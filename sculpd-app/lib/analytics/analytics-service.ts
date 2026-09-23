// lib/analytics/analytics-service.ts
import { db } from "@/lib/db";
import {
  WorkoutSession,
  WorkoutSet,
  Exercise,
  ExerciseLoadType,
  WorkoutSessionExerciseSnapshot,
} from "@/types/models";
import {
  getEffectiveLoad,
  formatSetLoad,
  formatSetSummary,
  isBodyweightExercise,
} from "@/lib/load/load-utils";
import {
  calculateE1RM,
  detectPersonalRecord,
  PRResult,
} from "@/lib/pr/pr-detector";
import { getCompletedWorkoutSessions } from "@/lib/history/history-service";

export interface AnalyticsExerciseOption {
  id: string;
  name: string;
  category?: string;
  equipment?: string;
  loadType: ExerciseLoadType;
  isBodyweight: boolean;
  totalSets: number;
  totalSessions: number;
  lastTrainedAt?: string;
  formattedLastTrained?: string;
}

export interface ExerciseHistoryPoint {
  sessionId: string;
  routineName: string;
  date: string; // e.g. "Sep 21"
  fullDate: string; // e.g. "Sep 21, 2026"
  rawDate: string; // ISO 8601
  timestamp: number;
  sets: WorkoutSet[];
  topSet: WorkoutSet;
  topSetSummary: string; // e.g. "185 × 5" or "BW + 15 × 8"
  bestWeight: number; // raw weight or addedWeight
  effectiveWeight: number; // total effective load (lbs)
  bestReps: number;
  estimated1RM: number; // calculated E1RM
  volume: number; // session volume for this exercise
}

export interface ExerciseProgressionData {
  exerciseId: string;
  exerciseName: string;
  category?: string;
  equipment?: string;
  loadType: ExerciseLoadType;
  isBodyweight: boolean;
  totalWorkouts: number;
  totalSets: number;
  totalVolume: number;
  formattedTotalVolume: string;
  recentVolume: number; // last 30 days
  formattedRecentVolume: string;
  allTimeBestWeight: {
    weight: number;
    effectiveWeight: number;
    displayText: string;
    reps: number;
    date: string;
    sessionId: string;
  } | null;
  allTimeBestReps: {
    weight: number;
    effectiveWeight: number;
    displayText: string;
    reps: number;
    date: string;
    sessionId: string;
  } | null;
  allTimeBestE1RM: {
    e1rm: number;
    formatted: string;
    date: string;
    sessionId: string;
    basisSetSummary: string;
  } | null;
  recentE1RM: {
    e1rm: number;
    formatted: string;
    date: string;
  } | null;
  history: ExerciseHistoryPoint[]; // chronological (oldest to newest for charting)
  recentHistory: ExerciseHistoryPoint[]; // reverse chronological (newest first for list)
  prs: OverallPRHistoryEntry[]; // chronological PRs on this exercise
}

export interface WeeklyFrequencyPoint {
  weekKey: string; // e.g. "2026-W38"
  weekLabel: string; // e.g. "Sep 15"
  count: number;
}

export interface WorkoutConsistencyData {
  totalCompletedWorkouts: number;
  workoutsThisWeek: number;
  workoutsThisMonth: number;
  workoutsLast30Days: number;
  averageWorkoutsPerWeek: number;
  daysSinceLastWorkout: number | null;
  lastWorkoutDate: string | null;
  formattedLastWorkoutDate: string | null;
  weeklyFrequency: WeeklyFrequencyPoint[];
}

export interface WorkoutVolumePoint {
  sessionId: string;
  routineName: string;
  date: string; // "Sep 21"
  fullDate: string; // "Sep 21, 2026"
  timestamp: number;
  volume: number;
  totalSets: number;
  durationMinutes: number;
}

export interface WeeklyVolumePoint {
  weekKey: string;
  weekLabel: string;
  volume: number;
  workoutCount: number;
}

export interface VolumeTrendData {
  allTimeTotalVolume: number;
  formattedTotalVolume: string;
  averageWorkoutVolume: number;
  formattedAvgVolume: string;
  workoutVolumePoints: WorkoutVolumePoint[];
  weeklyVolumePoints: WeeklyVolumePoint[];
}

export interface OverallPRHistoryEntry {
  id: string;
  sessionId: string;
  exerciseId: string;
  exerciseName: string;
  date: string; // "Sep 21, 2026"
  shortDate: string; // "Sep 21"
  timestamp: number;
  isBodyweight: boolean;
  prType: "weight" | "reps" | "1rm";
  badgeText: string;
  setSummary: string;
  effectiveLoad: number;
  weight: number;
  reps: number;
  bodyweight?: number | null;
  addedWeight?: number | null;
  previousSummary?: string;
}

/**
 * Ensures strict user isolation by verifying userId is non-empty.
 */
function assertUserId(userId: string) {
  if (!userId || typeof userId !== "string" || userId.trim() === "") {
    throw new Error("Strict User Isolation Error: userId is required.");
  }
}

/**
 * Formats a short date: "Sep 21"
 */
export function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Formats a medium date: "Sep 21, 2026"
 */
export function formatMediumDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Formats numbers into clean localized strings with "lb" unit (e.g. "8,420 lb").
 */
export function formatVolume(vol: number): string {
  if (isNaN(vol) || vol <= 0) return "0 lb";
  return `${Math.round(vol).toLocaleString()} lb`;
}

/**
 * Generates an ISO week key (e.g. "2026-W38") and week start date.
 */
function getWeekInfo(date: Date): { weekKey: string; weekStart: Date; weekLabel: string } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Day of week: 0 = Sun, 1 = Mon, ..., 6 = Sat
  const day = d.getUTCDay();
  // Set to Monday of this week
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  monday.setUTCHours(0, 0, 0, 0);

  const year = monday.getUTCFullYear();
  // Calculate ISO week number
  const firstJan = new Date(Date.UTC(year, 0, 1));
  const daysSinceFirstJan = Math.floor((monday.getTime() - firstJan.getTime()) / 86400000);
  const weekNum = Math.ceil((daysSinceFirstJan + firstJan.getUTCDay() + 1) / 7);

  const weekKey = `${year}-W${String(weekNum).padStart(2, "0")}`;
  const weekLabel = monday.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

  return { weekKey, weekStart: monday, weekLabel };
}

/**
 * Retrieves the list of exercises that have historical logged sets for a user.
 * Sorted by most recently trained first.
 */
export async function getAnalyticsExercises(
  userId: string
): Promise<AnalyticsExerciseOption[]> {
  assertUserId(userId);

  const completedSessions = await getCompletedWorkoutSessions(userId);
  if (completedSessions.length === 0) return [];

  const completedSessionIds = new Set(completedSessions.map((s) => s.id));
  const allUserSets = await db.sets.where("userId").equals(userId).toArray();
  const validSets = allUserSets.filter((s) => completedSessionIds.has(s.workoutSessionId));

  if (validSets.length === 0) return [];

  // Group sets by exerciseId
  const setsByExercise = new Map<string, WorkoutSet[]>();
  for (const s of validSets) {
    const list = setsByExercise.get(s.exerciseId) || [];
    list.push(s);
    setsByExercise.set(s.exerciseId, list);
  }

  // Load exercise entities from DB
  const exerciseIds = Array.from(setsByExercise.keys());
  const exercises = await db.exercises.where("id").anyOf(exerciseIds).toArray();
  const exerciseMap = new Map<string, Exercise>();
  for (const ex of exercises) {
    exerciseMap.set(ex.id, ex);
  }

  // Build snapshot name map from sessions
  const snapshotMap = new Map<string, WorkoutSessionExerciseSnapshot>();
  for (const session of completedSessions) {
    if (session.exerciseSnapshots) {
      for (const snap of session.exerciseSnapshots) {
        if (!snapshotMap.has(snap.exerciseId)) {
          snapshotMap.set(snap.exerciseId, snap);
        }
      }
    }
  }

  const options: AnalyticsExerciseOption[] = [];

  for (const [exId, sets] of setsByExercise.entries()) {
    const dbEx = exerciseMap.get(exId);
    const snap = snapshotMap.get(exId);

    const name = dbEx?.name || snap?.name || "Exercise";
    const category = dbEx?.category;
    const equipment = dbEx?.equipment;
    const isBW =
      dbEx?.loadType === "bodyweight" ||
      snap?.loadType === "bodyweight" ||
      isBodyweightExercise(dbEx) ||
      sets.some((s) => typeof s.bodyweight === "number" && s.bodyweight > 0);

    const loadType: ExerciseLoadType = isBW ? "bodyweight" : "weighted";

    const distinctSessions = new Set(sets.map((s) => s.workoutSessionId));

    // Sort sets descending by createdAt to find most recent date
    const sortedSets = [...sets].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const lastTrainedAt = sortedSets[0]?.createdAt;

    options.push({
      id: exId,
      name,
      category,
      equipment,
      loadType,
      isBodyweight: isBW,
      totalSets: sets.length,
      totalSessions: distinctSessions.size,
      lastTrainedAt,
      formattedLastTrained: lastTrainedAt ? formatMediumDate(lastTrainedAt) : undefined,
    });
  }

  // Sort by most recently trained first
  return options.sort((a, b) => {
    const timeA = a.lastTrainedAt ? new Date(a.lastTrainedAt).getTime() : 0;
    const timeB = b.lastTrainedAt ? new Date(b.lastTrainedAt).getTime() : 0;
    return timeB - timeA;
  });
}

/**
 * Computes deep historical progression metrics for a specific exercise.
 */
export async function getExerciseProgression(
  userId: string,
  exerciseId: string
): Promise<ExerciseProgressionData | null> {
  assertUserId(userId);
  if (!exerciseId) return null;

  const completedSessions = await getCompletedWorkoutSessions(userId);
  if (completedSessions.length === 0) return null;

  const completedSessionMap = new Map<string, WorkoutSession>();
  for (const s of completedSessions) {
    completedSessionMap.set(s.id, s);
  }

  const rawSets = await db.sets
    .where("[userId+exerciseId]")
    .equals([userId, exerciseId])
    .toArray();

  // Filter strictly to sets in completed sessions
  const validSets = rawSets.filter((s) => completedSessionMap.has(s.workoutSessionId));
  if (validSets.length === 0) return null;

  // Resolve exercise metadata
  const dbEx = await db.exercises.get(exerciseId);
  let snapshotEx: WorkoutSessionExerciseSnapshot | undefined;
  for (const s of completedSessions) {
    const found = s.exerciseSnapshots?.find((snap) => snap.exerciseId === exerciseId);
    if (found) {
      snapshotEx = found;
      break;
    }
  }

  const exerciseName = dbEx?.name || snapshotEx?.name || "Exercise";
  const category = dbEx?.category;
  const equipment = dbEx?.equipment;
  const isBW =
    dbEx?.loadType === "bodyweight" ||
    snapshotEx?.loadType === "bodyweight" ||
    isBodyweightExercise(dbEx) ||
    validSets.some((s) => typeof s.bodyweight === "number" && s.bodyweight > 0);

  const loadType: ExerciseLoadType = isBW ? "bodyweight" : "weighted";

  // Group sets by workout session
  const setsBySession = new Map<string, WorkoutSet[]>();
  for (const s of validSets) {
    const list = setsBySession.get(s.workoutSessionId) || [];
    list.push(s);
    setsBySession.set(s.workoutSessionId, list);
  }

  // Build session history points
  const historyPoints: ExerciseHistoryPoint[] = [];
  const thirtyDaysAgo = Date.now() - 30 * 86400000;
  let totalVolume = 0;
  let recentVolume = 0;

  for (const [sessionId, sets] of setsBySession.entries()) {
    const session = completedSessionMap.get(sessionId);
    if (!session) continue;

    // Order sets chronologically within session
    const sortedSets = [...sets].sort((a, b) => a.setNumber - b.setNumber);

    const sessionTime = new Date(session.completedAt || session.startedAt).getTime();
    const rawDate = session.completedAt || session.startedAt;
    const date = formatShortDate(rawDate);
    const fullDate = formatMediumDate(rawDate);
    const routineName = session.routineName || "Workout";

    // Compute volume for this exercise in this session
    let sessionExerciseVolume = 0;
    for (const s of sortedSets) {
      const effLoad = getEffectiveLoad(s);
      const setVol = effLoad * Math.max(0, s.reps || 0);
      sessionExerciseVolume += setVol;
    }
    totalVolume += sessionExerciseVolume;
    if (sessionTime >= thirtyDaysAgo) {
      recentVolume += sessionExerciseVolume;
    }

    // Find top set in this session by effective load, breaking ties with reps and E1RM
    let topSet = sortedSets[0];
    let topE1RM = calculateE1RM(getEffectiveLoad(topSet), topSet.reps);

    for (const s of sortedSets) {
      const currentEff = getEffectiveLoad(s);
      const topEff = getEffectiveLoad(topSet);
      const currentE1RM = calculateE1RM(currentEff, s.reps);

      if (
        currentEff > topEff ||
        (currentEff === topEff && s.reps > topSet.reps) ||
        (currentEff === topEff && s.reps === topSet.reps && currentE1RM > topE1RM)
      ) {
        topSet = s;
        topE1RM = currentE1RM;
      }
    }

    const bestWeight =
      isBW && typeof topSet.addedWeight === "number"
        ? topSet.addedWeight
        : topSet.weight;

    historyPoints.push({
      sessionId,
      routineName,
      date,
      fullDate,
      rawDate,
      timestamp: sessionTime,
      sets: sortedSets,
      topSet,
      topSetSummary: formatSetSummary(topSet, isBW),
      bestWeight,
      effectiveWeight: getEffectiveLoad(topSet),
      bestReps: topSet.reps,
      estimated1RM: Math.round(topE1RM),
      volume: sessionExerciseVolume,
    });
  }

  // Sort history points chronologically (oldest to newest) for charting
  historyPoints.sort((a, b) => a.timestamp - b.timestamp);

  // Find all-time metrics across all valid sets
  let bestWeightSet: { set: WorkoutSet; session: ExerciseHistoryPoint } | null = null;
  let bestRepsSet: { set: WorkoutSet; session: ExerciseHistoryPoint } | null = null;
  let bestE1RMSet: { set: WorkoutSet; session: ExerciseHistoryPoint; e1rm: number } | null = null;

  for (const hp of historyPoints) {
    for (const set of hp.sets) {
      if (set.reps <= 0) continue;
      const effLoad = getEffectiveLoad(set);
      if (!isBW && effLoad <= 0) continue;

      const e1rm = calculateE1RM(effLoad, set.reps);

      // Best weight evaluation
      if (
        !bestWeightSet ||
        effLoad > getEffectiveLoad(bestWeightSet.set) ||
        (effLoad === getEffectiveLoad(bestWeightSet.set) && set.reps > bestWeightSet.set.reps)
      ) {
        bestWeightSet = { set, session: hp };
      }

      // Best reps evaluation (max reps logged at significant working load)
      if (
        !bestRepsSet ||
        set.reps > bestRepsSet.set.reps ||
        (set.reps === bestRepsSet.set.reps && effLoad > getEffectiveLoad(bestRepsSet.set))
      ) {
        bestRepsSet = { set, session: hp };
      }

      // Best estimated 1RM
      if (!bestE1RMSet || e1rm > bestE1RMSet.e1rm) {
        bestE1RMSet = { set, session: hp, e1rm };
      }
    }
  }

  const allTimeBestWeight = bestWeightSet
    ? {
        weight: bestWeightSet.set.weight,
        effectiveWeight: getEffectiveLoad(bestWeightSet.set),
        displayText: formatSetLoad(bestWeightSet.set, isBW),
        reps: bestWeightSet.set.reps,
        date: bestWeightSet.session.fullDate,
        sessionId: bestWeightSet.session.sessionId,
      }
    : null;

  const allTimeBestReps = bestRepsSet
    ? {
        weight: bestRepsSet.set.weight,
        effectiveWeight: getEffectiveLoad(bestRepsSet.set),
        displayText: formatSetSummary(bestRepsSet.set, isBW),
        reps: bestRepsSet.set.reps,
        date: bestRepsSet.session.fullDate,
        sessionId: bestRepsSet.session.sessionId,
      }
    : null;

  const allTimeBestE1RM = bestE1RMSet
    ? {
        e1rm: Math.round(bestE1RMSet.e1rm),
        formatted: `${Math.round(bestE1RMSet.e1rm)} lb`,
        date: bestE1RMSet.session.fullDate,
        sessionId: bestE1RMSet.session.sessionId,
        basisSetSummary: formatSetSummary(bestE1RMSet.set, isBW),
      }
    : null;

  // Most recent session E1RM
  const mostRecentSession = historyPoints[historyPoints.length - 1];
  const recentE1RM = mostRecentSession
    ? {
        e1rm: mostRecentSession.estimated1RM,
        formatted: `${mostRecentSession.estimated1RM} lb`,
        date: mostRecentSession.fullDate,
      }
    : null;

  // Reverse chronological (newest first) for list presentation
  const recentHistory = [...historyPoints].reverse();

  // Compute PR history specifically for this exercise
  const allExercisePRs = await getAllPRHistory(userId, exerciseId);

  return {
    exerciseId,
    exerciseName,
    category,
    equipment,
    loadType,
    isBodyweight: isBW,
    totalWorkouts: historyPoints.length,
    totalSets: validSets.length,
    totalVolume,
    formattedTotalVolume: formatVolume(totalVolume),
    recentVolume,
    formattedRecentVolume: formatVolume(recentVolume),
    allTimeBestWeight,
    allTimeBestReps,
    allTimeBestE1RM,
    recentE1RM,
    history: historyPoints,
    recentHistory,
    prs: allExercisePRs,
  };
}

/**
 * Computes overall workout consistency, frequency, and cadence metrics.
 * Strictly avoids gamified streaks, arbitrary scores, or fitness ratings.
 */
export async function getWorkoutConsistency(
  userId: string
): Promise<WorkoutConsistencyData> {
  assertUserId(userId);

  const completedSessions = await getCompletedWorkoutSessions(userId);
  const totalCompletedWorkouts = completedSessions.length;

  if (totalCompletedWorkouts === 0) {
    return {
      totalCompletedWorkouts: 0,
      workoutsThisWeek: 0,
      workoutsThisMonth: 0,
      workoutsLast30Days: 0,
      averageWorkoutsPerWeek: 0,
      daysSinceLastWorkout: null,
      lastWorkoutDate: null,
      formattedLastWorkoutDate: null,
      weeklyFrequency: [],
    };
  }

  const now = new Date();

  // Current calendar week (Monday 00:00:00 local time)
  const currentWeekStart = new Date(now);
  const currentDay = currentWeekStart.getDay(); // 0 = Sun
  const diffToMonday = currentWeekStart.getDate() - currentDay + (currentDay === 0 ? -6 : 1);
  currentWeekStart.setDate(diffToMonday);
  currentWeekStart.setHours(0, 0, 0, 0);

  // Current calendar month (1st 00:00:00 local time)
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

  // Rolling 30 days
  const thirtyDaysAgo = now.getTime() - 30 * 86400000;

  let workoutsThisWeek = 0;
  let workoutsThisMonth = 0;
  let workoutsLast30Days = 0;

  for (const s of completedSessions) {
    const sessionTime = new Date(s.completedAt || s.startedAt).getTime();
    if (sessionTime >= currentWeekStart.getTime()) {
      workoutsThisWeek++;
    }
    if (sessionTime >= currentMonthStart.getTime()) {
      workoutsThisMonth++;
    }
    if (sessionTime >= thirtyDaysAgo) {
      workoutsLast30Days++;
    }
  }

  // Calculate average workouts per week from the first completed workout to now
  const oldestSession = completedSessions[completedSessions.length - 1];
  const firstWorkoutTime = new Date(oldestSession.completedAt || oldestSession.startedAt).getTime();
  const totalElapsedMs = Math.max(0, now.getTime() - firstWorkoutTime);
  const weeksElapsed = Math.max(1, totalElapsedMs / (7 * 86400000));
  const averageWorkoutsPerWeek = Math.round((totalCompletedWorkouts / weeksElapsed) * 10) / 10;

  // Days since last workout
  const latestSession = completedSessions[0];
  const lastWorkoutTime = new Date(latestSession.completedAt || latestSession.startedAt).getTime();
  const daysSinceLastWorkout = Math.max(0, Math.floor((now.getTime() - lastWorkoutTime) / 86400000));
  const lastWorkoutDate = latestSession.completedAt || latestSession.startedAt;
  const formattedLastWorkoutDate = formatMediumDate(lastWorkoutDate);

  // Build weekly frequency histogram for the last 10 weeks
  const weekMap = new Map<string, { weekLabel: string; count: number; orderTime: number }>();
  for (let i = 9; i >= 0; i--) {
    const targetDate = new Date(now.getTime() - i * 7 * 86400000);
    const { weekKey, weekStart, weekLabel } = getWeekInfo(targetDate);
    weekMap.set(weekKey, { weekLabel, count: 0, orderTime: weekStart.getTime() });
  }

  for (const s of completedSessions) {
    const sDate = new Date(s.completedAt || s.startedAt);
    const { weekKey } = getWeekInfo(sDate);
    if (weekMap.has(weekKey)) {
      const entry = weekMap.get(weekKey)!;
      entry.count++;
    }
  }

  const weeklyFrequency: WeeklyFrequencyPoint[] = Array.from(weekMap.entries())
    .sort((a, b) => a[1].orderTime - b[1].orderTime)
    .map(([weekKey, data]) => ({
      weekKey,
      weekLabel: data.weekLabel,
      count: data.count,
    }));

  return {
    totalCompletedWorkouts,
    workoutsThisWeek,
    workoutsThisMonth,
    workoutsLast30Days,
    averageWorkoutsPerWeek,
    daysSinceLastWorkout,
    lastWorkoutDate,
    formattedLastWorkoutDate,
    weeklyFrequency,
  };
}

/**
 * Calculates volume metrics and historical trends across completed workouts.
 */
export async function getVolumeTrends(userId: string): Promise<VolumeTrendData> {
  assertUserId(userId);

  const completedSessions = await getCompletedWorkoutSessions(userId);
  if (completedSessions.length === 0) {
    return {
      allTimeTotalVolume: 0,
      formattedTotalVolume: "0 lb",
      averageWorkoutVolume: 0,
      formattedAvgVolume: "0 lb",
      workoutVolumePoints: [],
      weeklyVolumePoints: [],
    };
  }

  const workoutVolumePoints: WorkoutVolumePoint[] = [];
  const weekVolumeMap = new Map<string, { weekLabel: string; volume: number; count: number; orderTime: number }>();
  let allTimeTotalVolume = 0;

  // Process sessions chronologically (oldest to newest)
  const chronologicalSessions = [...completedSessions].reverse();

  for (const s of chronologicalSessions) {
    const sets = await db.sets
      .where("[userId+workoutSessionId]")
      .equals([userId, s.id])
      .toArray();

    let sessionVolume = 0;
    for (const set of sets) {
      const eff = getEffectiveLoad(set);
      sessionVolume += eff * Math.max(0, set.reps || 0);
    }
    allTimeTotalVolume += sessionVolume;

    const sessionDate = new Date(s.completedAt || s.startedAt);
    const date = formatShortDate(s.completedAt || s.startedAt);
    const fullDate = formatMediumDate(s.completedAt || s.startedAt);
    const timestamp = sessionDate.getTime();

    // Duration calculation
    const startMs = new Date(s.startedAt).getTime();
    const endMs = s.completedAt ? new Date(s.completedAt).getTime() : timestamp;
    const durationMinutes = Math.max(1, Math.round((endMs - startMs) / 60000));

    workoutVolumePoints.push({
      sessionId: s.id,
      routineName: s.routineName || "Workout",
      date,
      fullDate,
      timestamp,
      volume: sessionVolume,
      totalSets: sets.length,
      durationMinutes,
    });

    // Group into weekly volume buckets
    const { weekKey, weekStart, weekLabel } = getWeekInfo(sessionDate);
    const weekEntry = weekVolumeMap.get(weekKey) || {
      weekLabel,
      volume: 0,
      count: 0,
      orderTime: weekStart.getTime(),
    };
    weekEntry.volume += sessionVolume;
    weekEntry.count += 1;
    weekVolumeMap.set(weekKey, weekEntry);
  }

  const weeklyVolumePoints: WeeklyVolumePoint[] = Array.from(weekVolumeMap.entries())
    .sort((a, b) => a[1].orderTime - b[1].orderTime)
    .map(([weekKey, data]) => ({
      weekKey,
      weekLabel: data.weekLabel,
      volume: Math.round(data.volume),
      workoutCount: data.count,
    }));

  const averageWorkoutVolume =
    completedSessions.length > 0
      ? Math.round(allTimeTotalVolume / completedSessions.length)
      : 0;

  return {
    allTimeTotalVolume,
    formattedTotalVolume: formatVolume(allTimeTotalVolume),
    averageWorkoutVolume,
    formattedAvgVolume: formatVolume(averageWorkoutVolume),
    workoutVolumePoints,
    weeklyVolumePoints,
  };
}

/**
 * Re-evaluates training history in strict chronological sequence using centralized PR detection
 * to construct an accurate, immutable timeline of personal records.
 */
export async function getAllPRHistory(
  userId: string,
  exerciseIdFilter?: string
): Promise<OverallPRHistoryEntry[]> {
  assertUserId(userId);

  // Retrieve all completed workout sessions, sorted oldest to newest (chronological)
  const completedSessions = await getCompletedWorkoutSessions(userId);
  if (completedSessions.length === 0) return [];

  const chronologicalSessions = [...completedSessions].reverse();
  const allUserSets = await db.sets.where("userId").equals(userId).toArray();

  // Index sets by workoutSessionId
  const setsBySession = new Map<string, WorkoutSet[]>();
  for (const set of allUserSets) {
    const list = setsBySession.get(set.workoutSessionId) || [];
    list.push(set);
    setsBySession.set(set.workoutSessionId, list);
  }

  // Pre-fetch all exercise names
  const allExercises = await db.exercises.toArray();
  const exerciseNameMap = new Map<string, string>();
  for (const ex of allExercises) {
    exerciseNameMap.set(ex.id, ex.name);
  }

  const allPRs: OverallPRHistoryEntry[] = [];
  // Running set history per exercise to evaluate PRs sequentially
  const runningSetsByExercise = new Map<string, WorkoutSet[]>();

  for (const session of chronologicalSessions) {
    const sessionSets = setsBySession.get(session.id) || [];
    const sortedSets = [...sessionSets].sort((a, b) => a.setNumber - b.setNumber);

    const distinctExerciseIds = Array.from(new Set(sortedSets.map((s) => s.exerciseId)));

    for (const exId of distinctExerciseIds) {
      // Optional filter
      if (exerciseIdFilter && exId !== exerciseIdFilter) continue;

      const exSetsInSession = sortedSets.filter((s) => s.exerciseId === exId);
      const priorSets = runningSetsByExercise.get(exId) || [];

      // Exercise name resolution
      const snapName = session.exerciseSnapshots?.find((s) => s.exerciseId === exId)?.name;
      const exName = snapName || exerciseNameMap.get(exId) || "Exercise";

      const isBW =
        session.exerciseSnapshots?.some(
          (s) => s.exerciseId === exId && s.loadType === "bodyweight"
        ) ||
        exSetsInSession.some((s) => typeof s.bodyweight === "number" && s.bodyweight > 0) ||
        priorSets.some((s) => typeof s.bodyweight === "number" && s.bodyweight > 0);

      const runningPrior = [...priorSets];

      for (let idx = 0; idx < exSetsInSession.length; idx++) {
        const set = exSetsInSession[idx];

        const prResult = detectPersonalRecord(
          {
            weight: set.weight,
            reps: set.reps,
            bodyweight: set.bodyweight,
            addedWeight: set.addedWeight,
          },
          exName,
          runningPrior,
          isBW
        );

        if (prResult.isPR) {
          const rawDate = session.completedAt || session.startedAt;
          allPRs.push({
            id: `${session.id}_${exId}_${set.id || idx}`,
            sessionId: session.id,
            exerciseId: exId,
            exerciseName: exName,
            date: formatMediumDate(rawDate),
            shortDate: formatShortDate(rawDate),
            timestamp: new Date(rawDate).getTime(),
            isBodyweight: isBW,
            prType: prResult.prType || "weight",
            badgeText: prResult.badgeText || "PR",
            setSummary: formatSetSummary(set, isBW),
            effectiveLoad: getEffectiveLoad(set),
            weight: set.weight,
            reps: set.reps,
            bodyweight: set.bodyweight,
            addedWeight: set.addedWeight,
            previousSummary: prResult.previous
              ? formatSetSummary(
                  {
                    weight: prResult.previous.weight,
                    reps: prResult.previous.reps,
                    bodyweight: prResult.previous.bodyweight,
                    addedWeight: prResult.previous.addedWeight,
                  },
                  isBW
                )
              : undefined,
          });
        }

        runningPrior.push(set);
      }

      runningSetsByExercise.set(exId, runningPrior);
    }
  }

  // Return PRs in reverse chronological order (newest first)
  return allPRs.sort((a, b) => b.timestamp - a.timestamp);
}
