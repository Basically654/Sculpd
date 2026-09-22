// lib/db/workout-repository.ts
import { db } from "./index";
import {
  WorkoutSession,
  WorkoutSet,
  SyncQueueItem,
  WorkoutSessionExerciseSnapshot,
} from "@/types/models";
import {
  getRoutineWithExercises,
  getRoutineById,
  getRoutineBySlug,
  getExercisesForRoutine,
} from "./routine-repository";
import { generateUUID } from "@/lib/crypto/uuid";

/**
 * Ensures a valid userId is provided before executing queries.
 */
function assertUserId(userId: string) {
  if (!userId || typeof userId !== "string" || userId.trim() === "") {
    throw new Error("Strict User Isolation Error: userId is required.");
  }
}

/**
 * Retrieves all workout sessions for a specific user, ordered chronologically descending.
 */
export async function getUserWorkoutSessions(
  userId: string
): Promise<WorkoutSession[]> {
  assertUserId(userId);
  return db.workoutSessions
    .where("userId")
    .equals(userId)
    .reverse()
    .sortBy("startedAt");
}

/**
 * Retrieves a specific workout session by id, verifying user ownership.
 */
export async function getWorkoutSessionById(
  userId: string,
  sessionId: string
): Promise<WorkoutSession | undefined> {
  assertUserId(userId);
  const session = await db.workoutSessions.get(sessionId);
  if (!session || session.userId !== userId) {
    return undefined;
  }
  return session;
}

/**
 * Retrieves the currently active (in_progress) workout session for a user.
 */
export async function getActiveWorkoutSession(
  userId: string
): Promise<WorkoutSession | undefined> {
  assertUserId(userId);
  return db.workoutSessions
    .where("[userId+status]")
    .equals([userId, "in_progress"])
    .first();
}

/**
 * Starts a new workout session for a specific user.
 * Snapshots routine name and exercise configurations at start time to guarantee
 * that historical workouts remain immutable even if the routine template is modified later.
 * If an active session already exists for this routine, returns it.
 */
export async function startWorkoutSession(
  userId: string,
  routineId: string
): Promise<WorkoutSession> {
  assertUserId(userId);

  const existingActive = await getActiveWorkoutSession(userId);
  if (existingActive) {
    if (existingActive.routineId === routineId) {
      return existingActive;
    }
    // If an existing session for a different routine was left open, mark it completed
    await completeWorkoutSession(userId, existingActive.id);
  }

  // Create immutable snapshot of routine details and exercises at start time
  let routineName = "Workout";
  let exerciseSnapshots: WorkoutSessionExerciseSnapshot[] = [];

  const routineWithExercises = await getRoutineWithExercises(routineId);
  if (routineWithExercises) {
    routineName = routineWithExercises.name;
    exerciseSnapshots = routineWithExercises.exercises.map((item) => ({
      exerciseId: item.exerciseId,
      name: item.exercise.name,
      displayOrder: item.displayOrder,
      targetSets: item.targetSets,
      targetReps: item.targetReps,
      restSeconds: item.restSeconds,
      notes: item.notes,
    }));
  } else {
    // Legacy fallback for slug or legacy ID
    const legacyRoutine =
      (await getRoutineById(routineId)) || (await getRoutineBySlug(routineId));
    if (legacyRoutine) {
      routineName = legacyRoutine.name || legacyRoutine.dayName || "Workout";
      const legacyExercises = await getExercisesForRoutine(routineId);
      exerciseSnapshots = legacyExercises.map((ex, idx) => ({
        exerciseId: ex.id,
        name: ex.name,
        displayOrder: ex.displayOrder ?? idx + 1,
        targetSets: ex.targetSets ?? 3,
        targetReps: ex.targetReps ?? "8-10",
        restSeconds: 90,
        notes: ex.coachingCue || undefined,
      }));
    }
  }

  const now = new Date().toISOString();
  const session: WorkoutSession = {
    id: generateUUID(),
    userId,
    routineId,
    routineName,
    exerciseSnapshots,
    startedAt: now,
    completedAt: null,
    status: "in_progress",
    updatedAt: now,
  };

  await db.transaction("rw", [db.workoutSessions, db.syncQueue], async () => {
    await db.workoutSessions.add(session);

    const syncItem: SyncQueueItem = {
      id: generateUUID(),
      userId,
      operation: "insert",
      collection: "workout_sessions",
      entityId: session.id,
      payload: session,
      timestamp: Date.now(),
      status: "pending",
      attempts: 0,
    };
    await db.syncQueue.add(syncItem);
  });

  return session;
}

/**
 * Marks a workout session as completed.
 */
export async function completeWorkoutSession(
  userId: string,
  sessionId: string,
  notes?: string
): Promise<WorkoutSession> {
  assertUserId(userId);

  const session = await db.workoutSessions.get(sessionId);
  if (!session || session.userId !== userId) {
    throw new Error("Workout session not found or unauthorized.");
  }

  const now = new Date().toISOString();
  const updatedSession: WorkoutSession = {
    ...session,
    completedAt: session.completedAt || now,
    status: "completed",
    updatedAt: now,
  };

  const resolvedNotes = notes !== undefined ? notes.trim() : (session.notes || "");
  if (resolvedNotes) {
    updatedSession.notes = resolvedNotes;
  } else {
    delete (updatedSession as any).notes;
  }

  await db.transaction("rw", [db.workoutSessions, db.syncQueue], async () => {
    await db.workoutSessions.put(updatedSession);

    const syncItem: SyncQueueItem = {
      id: generateUUID(),
      userId,
      operation: "update",
      collection: "workout_sessions",
      entityId: updatedSession.id,
      payload: JSON.parse(JSON.stringify(updatedSession)),
      timestamp: Date.now(),
      status: "pending",
      attempts: 0,
    };
    await db.syncQueue.add(syncItem);
  });

  return updatedSession;
}

/**
 * Cancels / discards an in-progress workout session.
 */
export async function cancelWorkoutSession(
  userId: string,
  sessionId: string
): Promise<WorkoutSession> {
  assertUserId(userId);

  const session = await db.workoutSessions.get(sessionId);
  if (!session || session.userId !== userId) {
    throw new Error("Workout session not found or unauthorized.");
  }

  const now = new Date().toISOString();
  const updatedSession: WorkoutSession = {
    ...session,
    completedAt: now,
    status: "cancelled",
    updatedAt: now,
  };

  await db.transaction("rw", [db.workoutSessions, db.syncQueue], async () => {
    await db.workoutSessions.put(updatedSession);

    const syncItem: SyncQueueItem = {
      id: generateUUID(),
      userId,
      operation: "update",
      collection: "workout_sessions",
      entityId: updatedSession.id,
      payload: JSON.parse(JSON.stringify(updatedSession)),
      timestamp: Date.now(),
      status: "pending",
      attempts: 0,
    };
    await db.syncQueue.add(syncItem);
  });

  return updatedSession;
}

/**
 * Retrieves all sets for a specific user and workout session.
 */
export async function getUserSetsForSession(
  userId: string,
  sessionId: string
): Promise<WorkoutSet[]> {
  assertUserId(userId);
  return db.sets
    .where("[userId+workoutSessionId]")
    .equals([userId, sessionId])
    .sortBy("setNumber");
}

/**
 * Retrieves all historical sets for a specific user and exercise, ordered chronologically.
 */
export async function getUserSetsForExercise(
  userId: string,
  exerciseId: string
): Promise<WorkoutSet[]> {
  assertUserId(userId);
  return db.sets
    .where("[userId+exerciseId]")
    .equals([userId, exerciseId])
    .sortBy("createdAt");
}

/**
 * Resolves the most recent set logged by the user for this exercise prior to the current session.
 * Used for the "Prev: 225 lbs × 8" progressive overload indicator.
 */
export async function getUserPreviousSet(
  userId: string,
  exerciseId: string,
  excludeSessionId?: string
): Promise<WorkoutSet | undefined> {
  assertUserId(userId);

  const rawSets = await db.sets
    .where("[userId+exerciseId]")
    .equals([userId, exerciseId])
    .toArray();

  const sorted = rawSets.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  if (!excludeSessionId) {
    return sorted[0];
  }

  return sorted.find((s) => s.workoutSessionId !== excludeSessionId);
}

/**
 * Resolves all sets from the most recent previous session for this exercise.
 */
export async function getUserPreviousSetsForExercise(
  userId: string,
  exerciseId: string,
  excludeSessionId?: string
): Promise<WorkoutSet[]> {
  assertUserId(userId);

  const prevSet = await getUserPreviousSet(userId, exerciseId, excludeSessionId);
  if (!prevSet) return [];

  return db.sets
    .where("[userId+workoutSessionId]")
    .equals([userId, prevSet.workoutSessionId])
    .filter((s) => s.exerciseId === exerciseId)
    .sortBy("setNumber");
}

/**
 * Logs a set for a user in an active workout session.
 */
export async function logUserSet(
  userId: string,
  sessionId: string,
  exerciseId: string,
  weight: number,
  reps: number,
  rpe?: number | null
): Promise<WorkoutSet> {
  assertUserId(userId);

  // Validate session belongs to user
  const session = await db.workoutSessions.get(sessionId);
  if (!session || session.userId !== userId) {
    throw new Error("Cannot log set: session does not belong to user.");
  }

  // Count existing sets in this session for this exercise to determine setNumber
  const existingSets = await db.sets
    .where("[userId+workoutSessionId]")
    .equals([userId, sessionId])
    .filter((s) => s.exerciseId === exerciseId)
    .toArray();

  const nextSetNumber = existingSets.length + 1;
  const now = new Date().toISOString();

  const newSet: WorkoutSet = {
    id: generateUUID(),
    userId,
    workoutSessionId: sessionId,
    exerciseId,
    setNumber: nextSetNumber,
    weight,
    reps,
    rpe: rpe ?? null,
    createdAt: now,
    updatedAt: now,
  };

  await db.transaction("rw", [db.sets, db.syncQueue], async () => {
    await db.sets.add(newSet);

    const syncItem: SyncQueueItem = {
      id: generateUUID(),
      userId,
      operation: "insert",
      collection: "sets",
      entityId: newSet.id,
      payload: newSet,
      timestamp: Date.now(),
      status: "pending",
      attempts: 0,
    };
    await db.syncQueue.add(syncItem);
  });

  return newSet;
}

/**
 * Deletes the most recent set logged by the user for an exercise in a session.
 */
export async function deleteUserLastSet(
  userId: string,
  sessionId: string,
  exerciseId: string
): Promise<boolean> {
  assertUserId(userId);

  const existingSets = await db.sets
    .where("[userId+workoutSessionId]")
    .equals([userId, sessionId])
    .filter((s) => s.exerciseId === exerciseId)
    .sortBy("setNumber");

  if (existingSets.length === 0) {
    return false;
  }

  const lastSet = existingSets[existingSets.length - 1];

  await db.transaction("rw", [db.sets, db.syncQueue], async () => {
    await db.sets.delete(lastSet.id);

    const syncItem: SyncQueueItem = {
      id: generateUUID(),
      userId,
      operation: "delete",
      collection: "sets",
      entityId: lastSet.id,
      payload: { id: lastSet.id },
      timestamp: Date.now(),
      status: "pending",
      attempts: 0,
    };
    await db.syncQueue.add(syncItem);
  });

  return true;
}

/**
 * Retrieves the pending sync queue items for a user.
 * Confirms that User A only sees their own sync mutations.
 */
export async function getUserSyncQueue(
  userId: string
): Promise<SyncQueueItem[]> {
  assertUserId(userId);
  return db.syncQueue.where("userId").equals(userId).sortBy("timestamp");
}
