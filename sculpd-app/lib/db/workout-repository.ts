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
import { resilientTransaction } from "./transaction";

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
 * Retrieves all completed workout sessions for a user, ordered reverse chronologically (newest first).
 * Strictly excludes unfinished (in_progress) and cancelled sessions.
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
      loadType:
        item.loadType ||
        item.exercise?.loadType ||
        (item.exercise?.equipment?.toLowerCase() === "bodyweight"
          ? "bodyweight"
          : "weighted"),
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
        loadType:
          ex.loadType ||
          (ex.equipment?.toLowerCase() === "bodyweight"
            ? "bodyweight"
            : "weighted"),
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

  const syncItem: SyncQueueItem = {
    id: generateUUID(),
    userId,
    operation: "insert",
    collection: "workout_sessions",
    entityId: session.id,
    payload: JSON.parse(JSON.stringify(session)),
    timestamp: Date.now(),
    status: "pending",
    attempts: 0,
  };

  await resilientTransaction(
    "startWorkoutSession",
    [db.workoutSessions, db.syncQueue],
    async () => {
      await Promise.all([
        db.workoutSessions.add(session),
        db.syncQueue.add(syncItem),
      ]);
    },
    async () => {
      await db.workoutSessions.add(session);
      await db.syncQueue.add(syncItem);
    }
  );

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

  const now = new Date();
  const startDate = new Date(session.startedAt);
  let completedAtIso = session.completedAt;
  if (!completedAtIso) {
    if (now.getTime() - startDate.getTime() > 12 * 3600 * 1000) {
      completedAtIso = new Date(startDate.getTime() + 45 * 60000).toISOString();
    } else {
      completedAtIso = now.toISOString();
    }
  }

  const updatedSession: WorkoutSession = {
    ...session,
    completedAt: completedAtIso,
    status: "completed",
    updatedAt: now.toISOString(),
  };

  const resolvedNotes = notes !== undefined ? notes.trim() : (session.notes || "");
  if (resolvedNotes) {
    updatedSession.notes = resolvedNotes;
  } else {
    delete (updatedSession as any).notes;
  }

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

  await resilientTransaction(
    "completeWorkoutSession",
    [db.workoutSessions, db.syncQueue],
    async () => {
      await Promise.all([
        db.workoutSessions.put(updatedSession),
        db.syncQueue.add(syncItem),
      ]);
    },
    async () => {
      await db.workoutSessions.put(updatedSession);
      await db.syncQueue.add(syncItem);
    }
  );

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

  await resilientTransaction(
    "cancelWorkoutSession",
    [db.workoutSessions, db.syncQueue],
    async () => {
      await Promise.all([
        db.workoutSessions.put(updatedSession),
        db.syncQueue.add(syncItem),
      ]);
    },
    async () => {
      await db.workoutSessions.put(updatedSession);
      await db.syncQueue.add(syncItem);
    }
  );

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
  rpe?: number | null,
  bodyweight?: number | null,
  addedWeight?: number | null
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
    ...(typeof bodyweight === "number" ? { bodyweight } : {}),
    ...(typeof addedWeight === "number" ? { addedWeight } : {}),
    createdAt: now,
    updatedAt: now,
  };

  const syncItem: SyncQueueItem = {
    id: generateUUID(),
    userId,
    operation: "insert",
    collection: "sets",
    entityId: newSet.id,
    payload: JSON.parse(JSON.stringify(newSet)),
    timestamp: Date.now(),
    status: "pending",
    attempts: 0,
  };

  await resilientTransaction(
    "logUserSet",
    [db.sets, db.syncQueue],
    async () => {
      await Promise.all([
        db.sets.add(newSet),
        db.syncQueue.add(syncItem),
      ]);
    },
    async () => {
      await db.sets.add(newSet);
      await db.syncQueue.add(syncItem);
    }
  );

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

  await resilientTransaction(
    "deleteUserLastSet",
    [db.sets, db.syncQueue],
    async () => {
      await Promise.all([
        db.sets.delete(lastSet.id),
        db.syncQueue.add(syncItem),
      ]);
    },
    async () => {
      await db.sets.delete(lastSet.id);
      await db.syncQueue.add(syncItem);
    }
  );

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

/**
 * Permanently deletes a workout session and all associated sets for a user.
 * Records delete mutations in syncQueue for remote replication.
 */
export async function deleteWorkoutSession(
  userId: string,
  sessionId: string
): Promise<boolean> {
  assertUserId(userId);

  const session = await db.workoutSessions.get(sessionId);
  if (!session || session.userId !== userId) {
    return false;
  }

  const sessionSets = await db.sets
    .where("workoutSessionId")
    .equals(sessionId)
    .toArray();

  const setIds = sessionSets.map((s) => s.id);

  const sessionSyncItem: SyncQueueItem = {
    id: generateUUID(),
    userId,
    operation: "delete",
    collection: "workout_sessions",
    entityId: sessionId,
    payload: { id: sessionId },
    timestamp: Date.now(),
    status: "pending",
    attempts: 0,
  };

  const setSyncItems: SyncQueueItem[] = setIds.map((id) => ({
    id: generateUUID(),
    userId,
    operation: "delete",
    collection: "sets",
    entityId: id,
    payload: { id },
    timestamp: Date.now(),
    status: "pending",
    attempts: 0,
  }));

  await resilientTransaction(
    "deleteWorkoutSession",
    [db.workoutSessions, db.sets, db.syncQueue],
    async () => {
      await Promise.all([
        db.workoutSessions.delete(sessionId),
        db.sets.where("workoutSessionId").equals(sessionId).delete(),
        db.syncQueue.bulkAdd([sessionSyncItem, ...setSyncItems]),
      ]);
    },
    async () => {
      await db.workoutSessions.delete(sessionId);
      await db.sets.where("workoutSessionId").equals(sessionId).delete();
      await db.syncQueue.bulkAdd([sessionSyncItem, ...setSyncItems]);
    }
  );

  return true;
}

/**
 * Safely updates the calendar / historical date of a workout session.
 * Preserves session ID, all set IDs, weights, reps, exercise snapshots, and relationships.
 * Individual set timestamps are strictly preserved (not rewritten).
 * Enqueues a syncQueue mutation for cloud persistence.
 */
export async function updateWorkoutSessionDate(
  userId: string,
  sessionId: string,
  newDateInput: string
): Promise<WorkoutSession> {
  assertUserId(userId);
  if (!sessionId) {
    throw new Error("Workout session ID is required.");
  }
  if (!newDateInput || typeof newDateInput !== "string" || newDateInput.trim() === "") {
    throw new Error("A valid date string is required.");
  }

  const session = await db.workoutSessions.get(sessionId);
  if (!session || session.userId !== userId) {
    throw new Error("Workout session not found or unauthorized.");
  }

  const trimmed = newDateInput.trim();
  const oldStart = new Date(session.startedAt);
  if (isNaN(oldStart.getTime())) {
    throw new Error("Existing session has invalid startedAt timestamp.");
  }

  let newStart: Date;
  // If format is YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split("-").map(Number);
    // Preserve local time-of-day from original session
    newStart = new Date(
      year,
      month - 1,
      day,
      oldStart.getHours(),
      oldStart.getMinutes(),
      oldStart.getSeconds(),
      oldStart.getMilliseconds()
    );
  } else {
    // Full ISO or parseable timestamp
    newStart = new Date(trimmed);
  }

  if (isNaN(newStart.getTime())) {
    throw new Error("Invalid date provided.");
  }

  // Prevent future dates (allowing up to end of today + slight buffer)
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (newStart.getTime() > tomorrow.getTime()) {
    throw new Error("Workout session date cannot be in the future.");
  }

  // Calculate new completedAt preserving duration
  let newCompletedAt: string | null = null;
  if (session.completedAt) {
    const oldEnd = new Date(session.completedAt);
    const durationMs =
      oldEnd.getTime() > oldStart.getTime()
        ? oldEnd.getTime() - oldStart.getTime()
        : 60000;
    newCompletedAt = new Date(newStart.getTime() + durationMs).toISOString();
  }

  const nowIso = new Date().toISOString();
  const updatedSession: WorkoutSession = {
    ...session,
    startedAt: newStart.toISOString(),
    completedAt: newCompletedAt,
    updatedAt: nowIso,
  };

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

  await resilientTransaction(
    "updateWorkoutSessionDate",
    [db.workoutSessions, db.syncQueue],
    async () => {
      await Promise.all([
        db.workoutSessions.put(updatedSession),
        db.syncQueue.add(syncItem),
      ]);
    },
    async () => {
      await db.workoutSessions.put(updatedSession);
      await db.syncQueue.add(syncItem);
    }
  );

  return updatedSession;
}

/**
 * Backfills a historical workout session on a specific past date.
 * Snapshots the routine name and exercise configurations at start time.
 * Enqueues a syncQueue mutation for cloud persistence.
 */
export async function backfillHistoricalWorkoutSession(
  userId: string,
  input: {
    routineId: string;
    historicalDate: string; // YYYY-MM-DD
    durationMinutes?: number;
    notes?: string;
  }
): Promise<WorkoutSession> {
  assertUserId(userId);
  if (!input.routineId) {
    throw new Error("Routine ID is required.");
  }
  if (!input.historicalDate) {
    throw new Error("Historical date is required.");
  }

  const [year, month, day] = input.historicalDate.trim().split("-").map(Number);
  // Default to 10:00 AM on the historical date
  const startedAtDate = new Date(year, month - 1, day, 10, 0, 0);
  if (isNaN(startedAtDate.getTime())) {
    throw new Error("Invalid historical date format.");
  }

  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (startedAtDate.getTime() > tomorrow.getTime()) {
    throw new Error("Workout session date cannot be in the future.");
  }

  const durationMin = Math.max(1, input.durationMinutes || 45);
  const completedAtDate = new Date(startedAtDate.getTime() + durationMin * 60000);

  // Snapshot routine name and exercises
  let routineName = "Workout";
  let exerciseSnapshots: WorkoutSessionExerciseSnapshot[] = [];

  const routineWithExercises = await getRoutineWithExercises(input.routineId);
  if (routineWithExercises) {
    routineName = routineWithExercises.name;
    exerciseSnapshots = routineWithExercises.exercises.map((item) => ({
      exerciseId: item.exerciseId,
      name: item.exercise.name,
      displayOrder: item.displayOrder,
      targetSets: item.targetSets,
      targetReps: item.targetReps,
      restSeconds: item.restSeconds,
      loadType:
        item.loadType ||
        item.exercise?.loadType ||
        (item.exercise?.equipment?.toLowerCase() === "bodyweight"
          ? "bodyweight"
          : "weighted"),
      notes: item.notes,
    }));
  } else {
    const legacyRoutine =
      (await getRoutineById(input.routineId)) || (await getRoutineBySlug(input.routineId));
    if (legacyRoutine) {
      routineName = legacyRoutine.name || legacyRoutine.dayName || "Workout";
      const legacyExercises = await getExercisesForRoutine(input.routineId);
      exerciseSnapshots = legacyExercises.map((ex, idx) => ({
        exerciseId: ex.id,
        name: ex.name,
        displayOrder: ex.displayOrder ?? idx + 1,
        targetSets: ex.targetSets ?? 3,
        targetReps: ex.targetReps ?? "8-10",
        restSeconds: 90,
        loadType:
          ex.loadType ||
          (ex.equipment?.toLowerCase() === "bodyweight"
            ? "bodyweight"
            : "weighted"),
        notes: ex.coachingCue || undefined,
      }));
    }
  }

  const nowIso = new Date().toISOString();
  const session: WorkoutSession = {
    id: generateUUID(),
    userId,
    routineId: input.routineId,
    routineName,
    exerciseSnapshots,
    startedAt: startedAtDate.toISOString(),
    completedAt: completedAtDate.toISOString(),
    status: "completed",
    notes: input.notes?.trim() || undefined,
    updatedAt: nowIso,
  };

  const syncItem: SyncQueueItem = {
    id: generateUUID(),
    userId,
    operation: "insert",
    collection: "workout_sessions",
    entityId: session.id,
    payload: JSON.parse(JSON.stringify(session)),
    timestamp: Date.now(),
    status: "pending",
    attempts: 0,
  };

  await resilientTransaction(
    "backfillHistoricalWorkoutSession",
    [db.workoutSessions, db.syncQueue],
    async () => {
      await Promise.all([
        db.workoutSessions.add(session),
        db.syncQueue.add(syncItem),
      ]);
    },
    async () => {
      await db.workoutSessions.add(session);
      await db.syncQueue.add(syncItem);
    }
  );

  return session;
}


