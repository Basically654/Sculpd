// lib/history/history-service.ts
import { db } from "@/lib/db";
import {
  WorkoutSession,
  WorkoutSet,
  Exercise,
  WorkoutSessionExerciseSnapshot,
} from "@/types/models";
import {
  getEffectiveLoad,
  formatSetSummary,
  isBodyweightExercise,
} from "@/lib/load/load-utils";
import { detectPersonalRecord, PRResult } from "@/lib/pr/pr-detector";
import { getUserSetsForSession } from "@/lib/db/workout-repository";

export interface CompletedWorkoutSummary {
  id: string;
  routineId: string;
  routineName: string;
  startedAt: string;
  completedAt: string;
  formattedDate: string; // e.g. "Sep 21, 2026"
  durationMinutes: number;
  formattedDuration: string; // e.g. "42 min"
  totalSets: number;
  totalExercises: number;
  totalVolume: number; // in lbs
  formattedVolume: string; // e.g. "8,420 lb"
  prCount: number;
  notes?: string | null;
}

export interface CompletedWorkoutDetailExercise {
  exerciseId: string;
  exerciseName: string;
  displayOrder: number;
  isBodyweight: boolean;
  sets: WorkoutSet[];
}

export interface CompletedWorkoutDetail {
  id: string;
  userId: string;
  routineId: string;
  routineName: string;
  startedAt: string;
  completedAt: string;
  formattedDate: string; // e.g. "September 21, 2026"
  startTimeFormatted: string; // e.g. "9:15 AM"
  completionTimeFormatted: string; // e.g. "9:57 AM"
  durationMinutes: number;
  formattedDuration: string; // e.g. "42 minutes"
  totalSets: number;
  totalExercises: number;
  totalVolume: number;
  formattedVolume: string; // e.g. "8,420 lb"
  prCount: number;
  prs: PRResult[];
  notes?: string | null;
  exercises: CompletedWorkoutDetailExercise[];
}

/**
 * Ensures a valid userId is provided before executing queries.
 */
function assertUserId(userId: string) {
  if (!userId || typeof userId !== "string" || userId.trim() === "") {
    throw new Error("Strict User Isolation Error: userId is required.");
  }
}

/**
 * Calculates duration in minutes between start and completion timestamps.
 * Guarantees a minimum of 1 minute for valid completed sessions.
 */
export function calculateWorkoutDuration(
  startedAt: string,
  completedAt?: string | null
): number {
  const startMs = new Date(startedAt).getTime();
  const endMs = completedAt ? new Date(completedAt).getTime() : Date.now();
  if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) {
    return 1;
  }
  return Math.max(1, Math.round((endMs - startMs) / 60000));
}

/**
 * Formats duration into a readable string:
 * - List view: "42 min" or "1h 15m"
 * - Detail view: "42 minutes" or "1 hour 15 minutes"
 */
export function formatWorkoutDuration(
  minutes: number,
  detailed = false
): string {
  if (minutes < 60) {
    return detailed ? `${minutes} ${minutes === 1 ? "minute" : "minutes"}` : `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (detailed) {
    const hrStr = `${hours} ${hours === 1 ? "hour" : "hours"}`;
    if (remainingMinutes === 0) return hrStr;
    const minStr = `${remainingMinutes} ${remainingMinutes === 1 ? "minute" : "minutes"}`;
    return `${hrStr} ${minStr}`;
  }
  return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`;
}

/**
 * Calculates total volume in lbs using getEffectiveLoad for full bodyweight + added weight compatibility.
 */
export function calculateWorkoutVolume(sets: WorkoutSet[]): number {
  if (!sets || sets.length === 0) return 0;
  return sets.reduce((sum, s) => {
    const effectiveLoad = getEffectiveLoad(s);
    return sum + effectiveLoad * (s.reps || 0);
  }, 0);
}

/**
 * Formats volume number into localized string with unit (e.g. "8,420 lb").
 */
export function formatWorkoutVolume(volume: number): string {
  return `${Math.round(volume).toLocaleString()} lb`;
}

/**
 * Evaluates PRs achieved during a specific workout session using the centralized PR detector.
 * Sets are evaluated in chronological sequence against prior historical sets.
 */
export async function getSessionPRs(
  userId: string,
  session: WorkoutSession,
  sessionSets: WorkoutSet[],
  exerciseNames?: Map<string, string>
): Promise<PRResult[]> {
  assertUserId(userId);
  if (!sessionSets || sessionSets.length === 0) return [];

  const prs: PRResult[] = [];
  const exerciseIds = Array.from(new Set(sessionSets.map((s) => s.exerciseId)));

  for (const exId of exerciseIds) {
    const exSets = sessionSets
      .filter((s) => s.exerciseId === exId)
      .sort((a, b) => a.setNumber - b.setNumber);

    // Retrieve all historical sets for this exercise
    const allHistorical = await db.sets
      .where("[userId+exerciseId]")
      .equals([userId, exId])
      .toArray();

    // Sets logged prior to this workout session
    const sessionStartTime = new Date(session.startedAt).getTime();
    const priorHistorical = allHistorical.filter(
      (s) =>
        s.workoutSessionId !== session.id &&
        new Date(s.createdAt).getTime() < sessionStartTime
    );

    const exerciseName =
      exerciseNames?.get(exId) ||
      session.exerciseSnapshots?.find((s) => s.exerciseId === exId)?.name ||
      "Exercise";

    const isBW =
      session.exerciseSnapshots?.some(
        (s) => s.exerciseId === exId && s.loadType === "bodyweight"
      ) ||
      exSets.some((s) => typeof s.bodyweight === "number" && s.bodyweight > 0) ||
      priorHistorical.some(
        (s) => typeof s.bodyweight === "number" && s.bodyweight > 0
      );

    const runningPrior = [...priorHistorical];

    for (const set of exSets) {
      const prCheck = detectPersonalRecord(
        {
          weight: set.weight,
          reps: set.reps,
          bodyweight: set.bodyweight,
          addedWeight: set.addedWeight,
        },
        exerciseName,
        runningPrior,
        isBW
      );

      if (prCheck.isPR) {
        prs.push(prCheck);
      }
      runningPrior.push(set);
    }
  }

  return prs;
}

/**
 * Retrieves all completed workout sessions for a user, ordered newest first (reverse chronological).
 * Strictly excludes unfinished ("in_progress") and cancelled sessions.
 */
export async function getCompletedWorkoutSessions(
  userId: string
): Promise<WorkoutSession[]> {
  assertUserId(userId);

  const rawSessions = await db.workoutSessions
    .where("[userId+status]")
    .equals([userId, "completed"])
    .toArray();

  return rawSessions.sort((a, b) => {
    const timeA = new Date(a.completedAt || a.startedAt).getTime();
    const timeB = new Date(b.completedAt || b.startedAt).getTime();
    return timeB - timeA;
  });
}

/**
 * Retrieves lightweight summaries of completed workouts for the History list screen.
 * Orders newest first and formats dates, durations, sets, exercises, volume, and PR counts.
 */
export async function getCompletedWorkoutSummaries(
  userId: string
): Promise<CompletedWorkoutSummary[]> {
  assertUserId(userId);

  const sessions = await getCompletedWorkoutSessions(userId);
  if (sessions.length === 0) return [];

  const summaries: CompletedWorkoutSummary[] = [];

  for (const session of sessions) {
    const sets = await getUserSetsForSession(userId, session.id);
    const durationMinutes = calculateWorkoutDuration(
      session.startedAt,
      session.completedAt
    );
    const totalVolume = calculateWorkoutVolume(sets);

    const uniqueExerciseIds = new Set(sets.map((s) => s.exerciseId));
    const totalExercises =
      uniqueExerciseIds.size > 0
        ? uniqueExerciseIds.size
        : session.exerciseSnapshots?.length || 0;

    // Date formatting (e.g. "Sep 21, 2026")
    const dateObj = new Date(session.completedAt || session.startedAt);
    const formattedDate = dateObj.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    // Centralized PR evaluation
    const prs = await getSessionPRs(userId, session, sets);

    // Snapshot integrity: prioritize snapshotted routineName
    const routineName = session.routineName || "Workout";

    summaries.push({
      id: session.id,
      routineId: session.routineId,
      routineName,
      startedAt: session.startedAt,
      completedAt: session.completedAt || session.startedAt,
      formattedDate,
      durationMinutes,
      formattedDuration: formatWorkoutDuration(durationMinutes, false),
      totalSets: sets.length,
      totalExercises,
      totalVolume,
      formattedVolume: formatWorkoutVolume(totalVolume),
      prCount: prs.length,
      notes: session.notes,
    });
  }

  return summaries;
}

/**
 * Retrieves the full detailed record of a single completed workout.
 * Respects immutable exercise snapshots so editing a routine template never rewrites history.
 */
export async function getCompletedWorkoutDetail(
  userId: string,
  sessionId: string
): Promise<CompletedWorkoutDetail | undefined> {
  assertUserId(userId);

  const session = await db.workoutSessions.get(sessionId);
  if (!session || session.userId !== userId) {
    return undefined;
  }

  // Only completed workouts should be displayed in completed detail
  if (session.status !== "completed") {
    return undefined;
  }

  const sets = await getUserSetsForSession(userId, session.id);
  const durationMinutes = calculateWorkoutDuration(
    session.startedAt,
    session.completedAt
  );
  const totalVolume = calculateWorkoutVolume(sets);

  const completedTime = session.completedAt || session.startedAt;
  const startDate = new Date(session.startedAt);
  const completionDate = new Date(completedTime);

  const formattedDate = completionDate.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const startTimeFormatted = startDate.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const completionTimeFormatted = completionDate.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  // Map of exerciseId -> Snapshot / Name for historical integrity
  const snapshotMap = new Map<string, WorkoutSessionExerciseSnapshot>();
  if (session.exerciseSnapshots) {
    for (const snap of session.exerciseSnapshots) {
      snapshotMap.set(snap.exerciseId, snap);
    }
  }

  // Distinct exercises in order of appearance
  const exerciseIdsInOrder: string[] = [];
  if (session.exerciseSnapshots && session.exerciseSnapshots.length > 0) {
    const sortedSnapshots = [...session.exerciseSnapshots].sort(
      (a, b) => a.displayOrder - b.displayOrder
    );
    for (const snap of sortedSnapshots) {
      if (!exerciseIdsInOrder.includes(snap.exerciseId)) {
        exerciseIdsInOrder.push(snap.exerciseId);
      }
    }
  }

  // Also include any exercise IDs from sets not in snapshots
  for (const s of sets) {
    if (!exerciseIdsInOrder.includes(s.exerciseId)) {
      exerciseIdsInOrder.push(s.exerciseId);
    }
  }

  const exerciseNames = new Map<string, string>();
  for (const exId of exerciseIdsInOrder) {
    const snap = snapshotMap.get(exId);
    if (snap) {
      exerciseNames.set(exId, snap.name);
    } else {
      const dbEx = await db.exercises.get(exId);
      exerciseNames.set(exId, dbEx?.name || "Exercise");
    }
  }

  // Build grouped exercise details with their actual sets in order
  const exerciseDetails: CompletedWorkoutDetailExercise[] = [];
  for (const exId of exerciseIdsInOrder) {
    const exSets = sets
      .filter((s) => s.exerciseId === exId)
      .sort((a, b) => a.setNumber - b.setNumber);

    // Only show exercises that actually have logged sets in this completed workout
    if (exSets.length === 0) continue;

    const snap = snapshotMap.get(exId);
    const exName = exerciseNames.get(exId) || "Exercise";
    const isBW =
      snap?.loadType === "bodyweight" ||
      exSets.some((s) => typeof s.bodyweight === "number" && s.bodyweight > 0);

    exerciseDetails.push({
      exerciseId: exId,
      exerciseName: exName,
      displayOrder: snap?.displayOrder || exerciseDetails.length + 1,
      isBodyweight: isBW,
      sets: exSets,
    });
  }

  // Centralized PR calculation
  const prs = await getSessionPRs(userId, session, sets, exerciseNames);

  return {
    id: session.id,
    userId: session.userId,
    routineId: session.routineId,
    routineName: session.routineName || "Workout",
    startedAt: session.startedAt,
    completedAt: completedTime,
    formattedDate,
    startTimeFormatted,
    completionTimeFormatted,
    durationMinutes,
    formattedDuration: formatWorkoutDuration(durationMinutes, true),
    totalSets: sets.length,
    totalExercises: exerciseDetails.length,
    totalVolume,
    formattedVolume: formatWorkoutVolume(totalVolume),
    prCount: prs.length,
    prs,
    notes: session.notes,
    exercises: exerciseDetails,
  };
}
