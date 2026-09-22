// lib/db/routine-repository.ts
import { db } from "./index";
import {
  Routine,
  Exercise,
  RoutineExerciseConfig,
  RoutineWithExercises,
  SyncQueueItem,
} from "@/types/models";
import { getExerciseById, seedExerciseCatalog } from "./exercise-repository";

/**
 * Ensures a valid userId is provided before executing queries.
 */
function assertUserId(userId: string) {
  if (!userId || typeof userId !== "string" || userId.trim() === "") {
    throw new Error("Strict User Isolation Error: userId is required.");
  }
}

/**
 * Legacy Phase 4 routines used exclusively when seedDefaultCatalog() is explicitly called in tests.
 * The application runtime does NOT use these; fresh installations start with 0 routines.
 */
export const DEFAULT_ROUTINES: Routine[] = [
  {
    id: "rtn_monday_glutes_calves",
    userId: "legacy_default",
    name: "Monday - Glutes & Calves",
    slug: "monday",
    dayName: "Monday",
    focusTarget: "Glute Focus (Upper & Side) + Calves",
    color: "from-emerald-500/20 to-zinc-900",
    displayOrder: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "rtn_tuesday_upper_abs",
    userId: "legacy_default",
    name: "Tuesday - Upper & Abs",
    slug: "tuesday",
    dayName: "Tuesday",
    focusTarget: "Upper Body (Hourglass Balance) + Abs",
    color: "from-blue-500/10 to-zinc-900",
    displayOrder: 2,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "rtn_wednesday_quad_calves",
    userId: "legacy_default",
    name: "Wednesday - Quads & Calves",
    slug: "wednesday",
    dayName: "Wednesday",
    focusTarget: "Quad & Hip Focus + Calves",
    color: "from-amber-500/10 to-zinc-900",
    displayOrder: 3,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "rtn_thursday_recovery_core",
    userId: "legacy_default",
    name: "Thursday - Active Recovery & Core",
    slug: "thursday",
    dayName: "Thursday",
    focusTarget: "Active Recovery, Core, & Lower Back",
    color: "from-purple-500/10 to-zinc-900",
    displayOrder: 4,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "rtn_friday_lower_posterior",
    userId: "legacy_default",
    name: "Friday - Posterior Chain",
    slug: "friday",
    dayName: "Friday",
    focusTarget: "Full Lower Body (Posterior Chain) + Calves",
    color: "from-rose-500/10 to-zinc-900",
    displayOrder: 5,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

export const DEFAULT_EXERCISES: Exercise[] = [
  {
    id: "ex_mon_01_hip_thrust",
    routineId: "rtn_monday_glutes_calves",
    name: "Barbell Hip Thrust",
    targetSets: 3,
    targetReps: "8-10",
    coachingCue: "Drive through heels, pause 1s at top lockout, chin tucked",
    displayOrder: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "ex_mon_02_rdl",
    routineId: "rtn_monday_glutes_calves",
    name: "Romanian Deadlift (Dumbbell)",
    targetSets: 3,
    targetReps: "10-12",
    coachingCue: "Hinge hips back, feel deep stretch in hamstrings and glutes",
    displayOrder: 2,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "ex_mon_03_kickback",
    routineId: "rtn_monday_glutes_calves",
    name: "Cable Glute Kickback",
    targetSets: 3,
    targetReps: "12-15",
    coachingCue: "Squeeze upper glute at peak contraction, avoid arching lower back",
    displayOrder: 3,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "ex_mon_04_calf_raise",
    routineId: "rtn_monday_glutes_calves",
    name: "Standing Calf Raise",
    targetSets: 4,
    targetReps: "12-15",
    coachingCue: "Full dorsiflexion stretch at bottom, 2s hold at peak extension",
    displayOrder: 4,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

/**
 * Legacy seeding function kept for backwards compatibility with Phase 4 tests.
 * The production application does not call this function.
 */
export async function seedDefaultCatalog(): Promise<void> {
  const routineCount = await db.routines.count();
  if (routineCount === 0) {
    await db.transaction("rw", [db.routines, db.exercises], async () => {
      await db.routines.bulkPut(DEFAULT_ROUTINES);
      await db.exercises.bulkPut(DEFAULT_EXERCISES);
    });
  }
}

/**
 * Retrieves all routines for a specific user, ordered by displayOrder.
 * Pure read-only operation safe for liveQuery contexts.
 * Returns empty array [] if the user has no routines (clean empty state).
 */
export async function getUserRoutines(userId: string): Promise<Routine[]> {
  assertUserId(userId);
  return db.routines.where("userId").equals(userId).sortBy("displayOrder");
}

/**
 * Retrieves all routines from IndexedDB ordered by displayOrder.
 * Backward-compatible helper: if no routines exist in DB, returns empty array.
 * Pure read-only operation safe for liveQuery contexts.
 */
export async function getAllRoutines(userId?: string): Promise<Routine[]> {
  if (userId) {
    return getUserRoutines(userId);
  }
  return db.routines.orderBy("displayOrder").toArray();
}

/**
 * Retrieves a single routine by its UUID/id.
 * Pure read-only operation safe for liveQuery contexts.
 */
export async function getRoutineById(id: string): Promise<Routine | undefined> {
  return db.routines.get(id);
}

/**
 * Retrieves a single routine by slug or id.
 * Pure read-only operation safe for liveQuery contexts.
 */
export async function getRoutineBySlug(slug: string): Promise<Routine | undefined> {
  const normalized = slug.toLowerCase().trim();
  const found = await db.routines.where("slug").equals(normalized).first();
  if (found) return found;
  return db.routines.get(slug);
}

/**
 * Retrieves a routine along with its ordered exercise configurations and library exercise data.
 * Pure read-only operation safe for liveQuery contexts.
 */
export async function getRoutineWithExercises(
  routineId: string
): Promise<RoutineWithExercises | undefined> {
  const routine = await db.routines.get(routineId);
  if (!routine) return undefined;

  // 1. Fetch ordered configurations from routineExercises table
  const configs = await db.routineExercises
    .where("routineId")
    .equals(routineId)
    .sortBy("displayOrder");

  if (configs.length > 0) {
    const exercisesWithDetails = await Promise.all(
      configs.map(async (cfg) => {
        let exercise = await getExerciseById(cfg.exerciseId);
        if (!exercise) {
          // Fallback placeholder if exercise was somehow unlinked
          exercise = {
            id: cfg.exerciseId,
            name: "Unknown Exercise",
            createdAt: cfg.createdAt,
            updatedAt: cfg.updatedAt,
          };
        }
        return {
          ...cfg,
          exercise,
        };
      })
    );

    return {
      ...routine,
      exercises: exercisesWithDetails,
    };
  }

  // 2. Legacy fallback for Phase 4 routines
  const legacyExercises = await db.exercises
    .where("routineId")
    .equals(routineId)
    .sortBy("displayOrder");

  const exercises = legacyExercises.map((ex, idx) => ({
    id: ex.id,
    routineId,
    exerciseId: ex.id,
    displayOrder: ex.displayOrder ?? idx + 1,
    targetSets: ex.targetSets ?? 3,
    targetReps: ex.targetReps ?? "8-10",
    restSeconds: 90,
    notes: ex.coachingCue || undefined,
    createdAt: ex.createdAt || new Date().toISOString(),
    updatedAt: ex.updatedAt || new Date().toISOString(),
    exercise: ex,
  }));

  return {
    ...routine,
    exercises,
  };
}

/**
 * Retrieves all exercises associated with a specific routine, ordered by displayOrder.
 * Backward-compatible helper for Phase 4 workout components.
 * Pure read-only operation safe for liveQuery contexts.
 */
export async function getExercisesForRoutine(routineId: string): Promise<Exercise[]> {
  const withExercises = await getRoutineWithExercises(routineId);
  if (withExercises && withExercises.exercises.length > 0) {
    return withExercises.exercises.map((item) => ({
      ...item.exercise,
      id: item.exerciseId,
      routineId,
      targetSets: item.targetSets,
      targetReps: item.targetReps,
      coachingCue: item.notes ?? null,
      displayOrder: item.displayOrder,
      updatedAt: item.updatedAt,
    }));
  }

  return [];
}

/**
 * Creates a new user routine and its ordered exercise configurations.
 * Saves immediately to IndexedDB and queues sync items.
 */
export async function createRoutine(
  userId: string,
  input: {
    name: string;
    description?: string;
    exercises?: Array<{
      exerciseId: string;
      targetSets: number;
      targetReps: string;
      restSeconds?: number;
      notes?: string;
    }>;
  }
): Promise<Routine> {
  assertUserId(userId);
  if (!input.name || input.name.trim() === "") {
    throw new Error("Routine name cannot be empty.");
  }

  const existingCount = await db.routines.where("userId").equals(userId).count();
  const now = new Date().toISOString();

  const routine: Routine = {
    id: globalThis.crypto.randomUUID(),
    userId,
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    displayOrder: existingCount + 1,
    createdAt: now,
    updatedAt: now,
  };

  const configs: RoutineExerciseConfig[] = (input.exercises || []).map((item, index) => ({
    id: globalThis.crypto.randomUUID(),
    routineId: routine.id,
    exerciseId: item.exerciseId,
    displayOrder: index + 1,
    targetSets: Number(item.targetSets) || 3,
    targetReps: String(item.targetReps || "8-10").trim(),
    restSeconds: Number(item.restSeconds) || 90,
    notes: item.notes?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  }));

  await db.transaction("rw", [db.routines, db.routineExercises, db.syncQueue], async () => {
    await db.routines.add(routine);
    if (configs.length > 0) {
      await db.routineExercises.bulkAdd(configs);
    }

    // Queue sync mutations
    const routineSyncItem: SyncQueueItem = {
      id: globalThis.crypto.randomUUID(),
      userId,
      operation: "insert",
      collection: "routines",
      entityId: routine.id,
      payload: routine,
      timestamp: Date.now(),
      status: "pending",
      attempts: 0,
    };
    await db.syncQueue.add(routineSyncItem);

    for (const cfg of configs) {
      const cfgSyncItem: SyncQueueItem = {
        id: globalThis.crypto.randomUUID(),
        userId,
        operation: "insert",
        collection: "routine_exercises",
        entityId: cfg.id,
        payload: cfg,
        timestamp: Date.now(),
        status: "pending",
        attempts: 0,
      };
      await db.syncQueue.add(cfgSyncItem);
    }
  });

  return routine;
}

/**
 * Updates an existing routine and updates/replaces its exercise configurations.
 * Pure local write to IndexedDB; queues sync items.
 */
export async function updateRoutine(
  userId: string,
  routineId: string,
  input: {
    name?: string;
    description?: string;
    exercises?: Array<{
      id?: string;
      exerciseId: string;
      targetSets: number;
      targetReps: string;
      restSeconds?: number;
      notes?: string;
    }>;
  }
): Promise<Routine> {
  assertUserId(userId);

  const existing = await db.routines.get(routineId);
  if (!existing || existing.userId !== userId) {
    throw new Error("Routine not found or unauthorized.");
  }

  const now = new Date().toISOString();
  const updatedRoutine: Routine = {
    ...existing,
    name: input.name !== undefined ? input.name.trim() : existing.name,
    description:
      input.description !== undefined ? input.description?.trim() || undefined : existing.description,
    updatedAt: now,
  };

  await db.transaction("rw", [db.routines, db.routineExercises, db.syncQueue], async () => {
    await db.routines.put(updatedRoutine);

    // Queue routine update
    const routineSyncItem: SyncQueueItem = {
      id: globalThis.crypto.randomUUID(),
      userId,
      operation: "update",
      collection: "routines",
      entityId: updatedRoutine.id,
      payload: updatedRoutine,
      timestamp: Date.now(),
      status: "pending",
      attempts: 0,
    };
    await db.syncQueue.add(routineSyncItem);

    // If exercises list was provided, update configs
    if (input.exercises !== undefined) {
      const existingConfigs = await db.routineExercises
        .where("routineId")
        .equals(routineId)
        .toArray();

      // Delete existing configs
      if (existingConfigs.length > 0) {
        await db.routineExercises.where("routineId").equals(routineId).delete();
        for (const oldCfg of existingConfigs) {
          const delSync: SyncQueueItem = {
            id: globalThis.crypto.randomUUID(),
            userId,
            operation: "delete",
            collection: "routine_exercises",
            entityId: oldCfg.id,
            payload: { id: oldCfg.id },
            timestamp: Date.now(),
            status: "pending",
            attempts: 0,
          };
          await db.syncQueue.add(delSync);
        }
      }

      // Add new configurations with proper displayOrder
      const newConfigs: RoutineExerciseConfig[] = input.exercises.map((item, index) => ({
        id: item.id || globalThis.crypto.randomUUID(),
        routineId,
        exerciseId: item.exerciseId,
        displayOrder: index + 1,
        targetSets: Number(item.targetSets) || 3,
        targetReps: String(item.targetReps || "8-10").trim(),
        restSeconds: Number(item.restSeconds) || 90,
        notes: item.notes?.trim() || undefined,
        createdAt: now,
        updatedAt: now,
      }));

      if (newConfigs.length > 0) {
        await db.routineExercises.bulkAdd(newConfigs);
        for (const cfg of newConfigs) {
          const addSync: SyncQueueItem = {
            id: globalThis.crypto.randomUUID(),
            userId,
            operation: "insert",
            collection: "routine_exercises",
            entityId: cfg.id,
            payload: cfg,
            timestamp: Date.now(),
            status: "pending",
            attempts: 0,
          };
          await db.syncQueue.add(addSync);
        }
      }
    }
  });

  return updatedRoutine;
}

/**
 * Deletes a routine and all its associated exercise configurations.
 */
export async function deleteRoutine(userId: string, routineId: string): Promise<boolean> {
  assertUserId(userId);

  const existing = await db.routines.get(routineId);
  if (!existing || existing.userId !== userId) {
    return false;
  }

  const configs = await db.routineExercises.where("routineId").equals(routineId).toArray();

  await db.transaction("rw", [db.routines, db.routineExercises, db.syncQueue], async () => {
    await db.routines.delete(routineId);
    await db.routineExercises.where("routineId").equals(routineId).delete();

    // Queue sync deletions
    const routineDel: SyncQueueItem = {
      id: globalThis.crypto.randomUUID(),
      userId,
      operation: "delete",
      collection: "routines",
      entityId: routineId,
      payload: { id: routineId },
      timestamp: Date.now(),
      status: "pending",
      attempts: 0,
    };
    await db.syncQueue.add(routineDel);

    for (const cfg of configs) {
      const cfgDel: SyncQueueItem = {
        id: globalThis.crypto.randomUUID(),
        userId,
        operation: "delete",
        collection: "routine_exercises",
        entityId: cfg.id,
        payload: { id: cfg.id },
        timestamp: Date.now(),
        status: "pending",
        attempts: 0,
      };
      await db.syncQueue.add(cfgDel);
    }
  });

  return true;
}

/**
 * Reorders exercise configurations within a routine.
 * Updates displayOrder (1..N) and queues sync items.
 */
export async function reorderRoutineExercises(
  userId: string,
  routineId: string,
  orderedConfigIds: string[]
): Promise<void> {
  assertUserId(userId);

  const routine = await db.routines.get(routineId);
  if (!routine || routine.userId !== userId) {
    throw new Error("Unauthorized to reorder exercises for this routine.");
  }

  const now = new Date().toISOString();

  await db.transaction("rw", [db.routineExercises, db.syncQueue], async () => {
    for (let i = 0; i < orderedConfigIds.length; i++) {
      const configId = orderedConfigIds[i];
      const newOrder = i + 1;
      const cfg = await db.routineExercises.get(configId);
      if (cfg && cfg.routineId === routineId) {
        const updatedCfg = { ...cfg, displayOrder: newOrder, updatedAt: now };
        await db.routineExercises.put(updatedCfg);

        const syncItem: SyncQueueItem = {
          id: globalThis.crypto.randomUUID(),
          userId,
          operation: "update",
          collection: "routine_exercises",
          entityId: cfg.id,
          payload: updatedCfg,
          timestamp: Date.now(),
          status: "pending",
          attempts: 0,
        };
        await db.syncQueue.add(syncItem);
      }
    }
  });
}
