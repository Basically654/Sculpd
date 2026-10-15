// lib/progression/progression-service.ts
import { db } from "@/lib/db";
import { WorkoutSession, WorkoutSet } from "@/types/models";
import { getEffectiveLoad } from "@/lib/load/load-utils";
import { getAllPRHistory, OverallPRHistoryEntry } from "@/lib/analytics/analytics-service";
import { getCompletedWorkoutSessions } from "@/lib/history/history-service";
import { ensureDbOpen } from "@/lib/db/transaction";
import { getLocalDateKey } from "@/lib/calendar/calendar-service";

/**
 * Ensures strict user isolation by verifying userId is non-empty.
 */
function assertUserId(userId: string) {
  if (!userId || typeof userId !== "string" || userId.trim() === "") {
    throw new Error("Strict User Isolation Error: userId is required.");
  }
}

export type AchievementCategory = "consistency" | "pr" | "milestone" | "volume";

export interface AchievementDefinition {
  id: string;
  title: string;
  category: AchievementCategory;
  description: string;
  icon: string;
  targetValue: number;
  unit?: string;
}

export interface UserAchievement extends AchievementDefinition {
  isUnlocked: boolean;
  unlockedAt: string | null; // ISO 8601 of session that achieved it, or null
  currentValue: number;
  progressPercent: number; // 0..100
}

export interface UserRank {
  level: number; // 1..6
  title: string;
  badge: string;
  description: string;
  minWorkouts: number;
  minPRs: number;
  minVolume: number;
}

export interface RankProgression {
  currentRank: UserRank;
  nextRank: UserRank | null;
  progressPercent: number; // 0..100% towards next rank
  requirementsNeeded: {
    workoutsRemaining: number;
    prsRemaining: number;
    volumeRemaining: number;
  } | null;
}

export interface LifetimeProgressionSummary {
  rank: RankProgression;
  totalCompletedWorkouts: number;
  totalVolume: number;
  formattedTotalVolume: string;
  verifiedPRCount: number;
  consecutiveWeeks: number;
  distinctExercisesCount: number;
  unlockedAchievementsCount: number;
  totalAchievementsCount: number;
  achievements: UserAchievement[];
  recentAchievements: UserAchievement[];
}

/**
 * Official Ranks Progression reflecting genuine, sustained training accomplishments.
 */
export const RANKS: UserRank[] = [
  {
    level: 1,
    title: "Bronze Lifter",
    badge: "🥉",
    description: "Starting your strength journey.",
    minWorkouts: 0,
    minPRs: 0,
    minVolume: 0,
  },
  {
    level: 2,
    title: "Silver Lifter",
    badge: "🥈",
    description: "Establishing consistency and logging verified records.",
    minWorkouts: 5,
    minPRs: 1,
    minVolume: 5000,
  },
  {
    level: 3,
    title: "Gold Lifter",
    badge: "🥇",
    description: "Solid foundation of continuous progressive overload.",
    minWorkouts: 15,
    minPRs: 5,
    minVolume: 25000,
  },
  {
    level: 4,
    title: "Platinum Athlete",
    badge: "💎",
    description: "Dedicated discipline across dozens of demanding training sessions.",
    minWorkouts: 35,
    minPRs: 12,
    minVolume: 75000,
  },
  {
    level: 5,
    title: "Diamond Veteran",
    badge: "👑",
    description: "Elite consistency and mastery over progressive overload.",
    minWorkouts: 70,
    minPRs: 25,
    minVolume: 200000,
  },
  {
    level: 6,
    title: "Master of Iron",
    badge: "⚡",
    description: "Centurion milestone achieved with hundreds of tons lifted.",
    minWorkouts: 120,
    minPRs: 50,
    minVolume: 500000,
  },
];

/**
 * Coherent, focused initial collection of 16 achievements based purely on real workout history.
 */
export const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
  // 1. Consistency & Habits
  {
    id: "consistency_first_workout",
    title: "First Step",
    category: "consistency",
    description: "Complete your first workout session.",
    icon: "👟",
    targetValue: 1,
    unit: "workout",
  },
  {
    id: "consistency_2_weeks",
    title: "Building Momentum",
    category: "consistency",
    description: "Complete workouts in 2 consecutive calendar weeks.",
    icon: "🔥",
    targetValue: 2,
    unit: "weeks",
  },
  {
    id: "consistency_4_weeks",
    title: "Habit Formed",
    category: "consistency",
    description: "Complete workouts in 4 consecutive calendar weeks.",
    icon: "📅",
    targetValue: 4,
    unit: "weeks",
  },
  {
    id: "consistency_8_weeks",
    title: "Iron Discipline",
    category: "consistency",
    description: "Complete workouts in 8 consecutive calendar weeks.",
    icon: "⚔️",
    targetValue: 8,
    unit: "weeks",
  },
  {
    id: "consistency_12_weeks",
    title: "Unstoppable",
    category: "consistency",
    description: "Complete workouts in 12 consecutive calendar weeks.",
    icon: "🛡️",
    targetValue: 12,
    unit: "weeks",
  },

  // 2. Personal Records (Verified PR Rules)
  {
    id: "pr_first",
    title: "Breaking Boundaries",
    category: "pr",
    description: "Log your first verified Personal Record.",
    icon: "🎯",
    targetValue: 1,
    unit: "PR",
  },
  {
    id: "pr_5",
    title: "Continuous Overload",
    category: "pr",
    description: "Achieve 5 verified Personal Records.",
    icon: "📈",
    targetValue: 5,
    unit: "PRs",
  },
  {
    id: "pr_15",
    title: "Strength Ascending",
    category: "pr",
    description: "Achieve 15 verified Personal Records.",
    icon: "🚀",
    targetValue: 15,
    unit: "PRs",
  },
  {
    id: "pr_30",
    title: "Elite Progression",
    category: "pr",
    description: "Achieve 30 verified Personal Records.",
    icon: "🌟",
    targetValue: 30,
    unit: "PRs",
  },

  // 3. Workout Milestones
  {
    id: "milestone_10",
    title: "Ten Down",
    category: "milestone",
    description: "Complete 10 lifetime workout sessions.",
    icon: "🔟",
    targetValue: 10,
    unit: "workouts",
  },
  {
    id: "milestone_25",
    title: "Quarter Century",
    category: "milestone",
    description: "Complete 25 lifetime workout sessions.",
    icon: "🏅",
    targetValue: 25,
    unit: "workouts",
  },
  {
    id: "milestone_50",
    title: "Half Century",
    category: "milestone",
    description: "Complete 50 lifetime workout sessions.",
    icon: "🏆",
    targetValue: 50,
    unit: "workouts",
  },
  {
    id: "milestone_100",
    title: "Centurion",
    category: "milestone",
    description: "Complete 100 lifetime workout sessions.",
    icon: "🏛️",
    targetValue: 100,
    unit: "workouts",
  },

  // 4. Lifetime Volume & Diversity
  {
    id: "volume_50k",
    title: "Heavy Mover",
    category: "volume",
    description: "Lift 50,000 lbs of lifetime cumulative training volume.",
    icon: "🏋️",
    targetValue: 50000,
    unit: "lbs",
  },
  {
    id: "volume_250k",
    title: "Quarter Million Club",
    category: "volume",
    description: "Lift 250,000 lbs of lifetime cumulative training volume.",
    icon: "🏔️",
    targetValue: 250000,
    unit: "lbs",
  },
  {
    id: "diversity_5",
    title: "Versatile Athlete",
    category: "volume",
    description: "Log completed sets on 5 or more distinct exercises.",
    icon: "🎨",
    targetValue: 5,
    unit: "exercises",
  },
];

/**
 * Calculates consecutive weekly streak from chronological workout timestamps.
 */
function calculateConsecutiveWeeks(chronologicalDates: Date[]): number {
  if (chronologicalDates.length === 0) return 0;

  // Map dates to ISO week keys: "YYYY-Www"
  const weekSet = new Set<string>();
  for (const date of chronologicalDates) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    weekSet.add(`${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`);
  }

  // Parse weeks into integer timestamps (Monday of each week)
  const sortedWeekStarts: number[] = [];
  for (const weekKey of weekSet) {
    const [yearStr, weekStr] = weekKey.split("-W");
    const year = parseInt(yearStr, 10);
    const week = parseInt(weekStr, 10);
    const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
    const dow = simple.getUTCDay();
    const ISOweekStart = simple;
    if (dow <= 4) ISOweekStart.setUTCDate(simple.getUTCDate() - simple.getUTCDay() + 1);
    else ISOweekStart.setUTCDate(simple.getUTCDate() + 8 - simple.getUTCDay());
    sortedWeekStarts.push(ISOweekStart.getTime());
  }

  sortedWeekStarts.sort((a, b) => a - b);
  if (sortedWeekStarts.length === 0) return 0;

  const ONE_WEEK_MS = 7 * 86400000;
  let maxStreak = 1;
  let currentStreak = 1;

  for (let i = 1; i < sortedWeekStarts.length; i++) {
    const diff = sortedWeekStarts[i] - sortedWeekStarts[i - 1];
    // Allow small boundary tolerance for Daylight Savings (+/- 2 hours)
    if (Math.abs(diff - ONE_WEEK_MS) < 86400000 / 2) {
      currentStreak++;
      if (currentStreak > maxStreak) maxStreak = currentStreak;
    } else {
      currentStreak = 1;
    }
  }

  return maxStreak;
}

/**
 * Calculates current user rank based on real completed workouts, verified PRs, and lifetime volume.
 */
export function calculateRankProgression(
  totalWorkouts: number,
  totalPRs: number,
  totalVolume: number
): RankProgression {
  let currentRankIndex = 0;

  for (let i = RANKS.length - 1; i >= 0; i--) {
    const r = RANKS[i];
    if (
      totalWorkouts >= r.minWorkouts &&
      totalPRs >= r.minPRs &&
      totalVolume >= r.minVolume
    ) {
      currentRankIndex = i;
      break;
    }
  }

  const currentRank = RANKS[currentRankIndex];
  const nextRank = currentRankIndex + 1 < RANKS.length ? RANKS[currentRankIndex + 1] : null;

  if (!nextRank) {
    return {
      currentRank,
      nextRank: null,
      progressPercent: 100,
      requirementsNeeded: null,
    };
  }

  // Calculate progress toward next rank
  const workoutReq = Math.max(0, nextRank.minWorkouts - currentRank.minWorkouts);
  const workoutDone = Math.min(workoutReq, Math.max(0, totalWorkouts - currentRank.minWorkouts));
  const workoutFrac = workoutReq > 0 ? workoutDone / workoutReq : 1;

  const prReq = Math.max(0, nextRank.minPRs - currentRank.minPRs);
  const prDone = Math.min(prReq, Math.max(0, totalPRs - currentRank.minPRs));
  const prFrac = prReq > 0 ? prDone / prReq : 1;

  const volReq = Math.max(0, nextRank.minVolume - currentRank.minVolume);
  const volDone = Math.min(volReq, Math.max(0, totalVolume - currentRank.minVolume));
  const volFrac = volReq > 0 ? volDone / volReq : 1;

  const combinedFrac = (workoutFrac + prFrac + volFrac) / 3;
  const progressPercent = Math.min(99, Math.round(combinedFrac * 100));

  return {
    currentRank,
    nextRank,
    progressPercent,
    requirementsNeeded: {
      workoutsRemaining: Math.max(0, nextRank.minWorkouts - totalWorkouts),
      prsRemaining: Math.max(0, nextRank.minPRs - totalPRs),
      volumeRemaining: Math.max(0, nextRank.minVolume - totalVolume),
    },
  };
}

/**
 * Evaluates the full progression, ranks, and achievements for a user.
 * Derived 100% deterministically from canonical completed workouts and verified PRs.
 */
export async function getUserProgression(userId: string): Promise<LifetimeProgressionSummary> {
  assertUserId(userId);
  await ensureDbOpen();

  // 1. Load canonical completed sessions (chronological order)
  const completedSessions = await getCompletedWorkoutSessions(userId);
  const chronologicalSessions = [...completedSessions].reverse();

  // 2. Load all user sets
  const allUserSets = await db.sets.where("userId").equals(userId).toArray();
  const setsBySession = new Map<string, WorkoutSet[]>();
  const distinctExerciseIds = new Set<string>();

  for (const s of allUserSets) {
    const list = setsBySession.get(s.workoutSessionId) || [];
    list.push(s);
    setsBySession.set(s.workoutSessionId, list);
    if (s.exerciseId) {
      distinctExerciseIds.add(s.exerciseId);
    }
  }

  // 3. Compute total volume and running milestone checkpoints
  let totalVolume = 0;
  const workoutTimestamps: Date[] = [];
  const volumeAtSessions: { timestamp: string; cumulativeVolume: number }[] = [];

  for (const session of chronologicalSessions) {
    const sessionSets = setsBySession.get(session.id) || [];
    let sessionVol = 0;
    for (const s of sessionSets) {
      const eff = getEffectiveLoad(s);
      sessionVol += eff * Math.max(0, s.reps || 0);
    }
    totalVolume += sessionVol;

    const date = new Date(session.completedAt || session.startedAt);
    workoutTimestamps.push(date);
    volumeAtSessions.push({
      timestamp: date.toISOString(),
      cumulativeVolume: totalVolume,
    });
  }

  // 4. Load verified PRs using centralized detector
  const verifiedPRs = await getAllPRHistory(userId);
  const verifiedPRCount = verifiedPRs.length;

  // 5. Calculate consecutive weeks
  const consecutiveWeeks = calculateConsecutiveWeeks(workoutTimestamps);

  // 6. Calculate Rank
  const rank = calculateRankProgression(
    chronologicalSessions.length,
    verifiedPRCount,
    totalVolume
  );

  // 7. Evaluate each achievement with deterministic unlock timestamps
  const achievements: UserAchievement[] = ACHIEVEMENT_DEFINITIONS.map((def) => {
    let currentValue = 0;
    let isUnlocked = false;
    let unlockedAt: string | null = null;

    switch (def.id) {
      // Consistency
      case "consistency_first_workout":
        currentValue = chronologicalSessions.length;
        if (chronologicalSessions.length >= 1) {
          isUnlocked = true;
          unlockedAt = chronologicalSessions[0].completedAt || chronologicalSessions[0].startedAt;
        }
        break;

      case "consistency_2_weeks":
      case "consistency_4_weeks":
      case "consistency_8_weeks":
      case "consistency_12_weeks":
        currentValue = consecutiveWeeks;
        if (consecutiveWeeks >= def.targetValue) {
          isUnlocked = true;
          // Approximate unlockedAt to the most recent session
          unlockedAt = chronologicalSessions[chronologicalSessions.length - 1]?.completedAt || null;
        }
        break;

      // PRs
      case "pr_first":
      case "pr_5":
      case "pr_15":
      case "pr_30":
        currentValue = verifiedPRCount;
        if (verifiedPRCount >= def.targetValue) {
          isUnlocked = true;
          // Exact timestamp from the verified PR list (chronological order is reversed from return)
          const chronoPRs = [...verifiedPRs].reverse();
          unlockedAt = chronoPRs[def.targetValue - 1]?.date || null;
        }
        break;

      // Milestones
      case "milestone_10":
      case "milestone_25":
      case "milestone_50":
      case "milestone_100":
        currentValue = chronologicalSessions.length;
        if (chronologicalSessions.length >= def.targetValue) {
          isUnlocked = true;
          const s = chronologicalSessions[def.targetValue - 1];
          unlockedAt = s.completedAt || s.startedAt;
        }
        break;

      // Volume
      case "volume_50k":
      case "volume_250k":
        currentValue = totalVolume;
        if (totalVolume >= def.targetValue) {
          isUnlocked = true;
          const thresholdSession = volumeAtSessions.find(
            (v) => v.cumulativeVolume >= def.targetValue
          );
          unlockedAt = thresholdSession?.timestamp || null;
        }
        break;

      // Exercise Diversity
      case "diversity_5":
        currentValue = distinctExerciseIds.size;
        if (distinctExerciseIds.size >= def.targetValue) {
          isUnlocked = true;
          unlockedAt = chronologicalSessions[chronologicalSessions.length - 1]?.completedAt || null;
        }
        break;

      default:
        break;
    }

    const progressPercent = Math.min(
      100,
      Math.round((currentValue / def.targetValue) * 100)
    );

    return {
      ...def,
      isUnlocked,
      unlockedAt,
      currentValue,
      progressPercent,
    };
  });

  const unlockedCount = achievements.filter((a) => a.isUnlocked).length;
  const recentAchievements = achievements
    .filter((a) => a.isUnlocked && a.unlockedAt)
    .sort((a, b) => (b.unlockedAt || "").localeCompare(a.unlockedAt || ""))
    .slice(0, 4);

  return {
    rank,
    totalCompletedWorkouts: chronologicalSessions.length,
    totalVolume,
    formattedTotalVolume: `${Math.round(totalVolume).toLocaleString()} lb`,
    verifiedPRCount,
    consecutiveWeeks,
    distinctExercisesCount: distinctExerciseIds.size,
    unlockedAchievementsCount: unlockedCount,
    totalAchievementsCount: achievements.length,
    achievements,
    recentAchievements,
  };
}

/**
 * Convenient alias for getUserProgression.
 */
export const getLifetimeProgressionSummary = getUserProgression;
