// lib/db/routine-repository.ts
import { db } from "./index";
import {
  Routine,
  Exercise,
  RoutineExerciseConfig,
  RoutineWithExercises,
  SyncQueueItem,
  ExerciseLoadType,
} from "@/types/models";
import { getExerciseById, seedExerciseCatalog } from "./exercise-repository";
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
    await resilientTransaction(
      "seedDefaultCatalog",
      [db.routines, db.exercises],
      async () => {
        await Promise.all([
          db.routines.bulkPut(DEFAULT_ROUTINES),
          db.exercises.bulkPut(DEFAULT_EXERCISES),
        ]);
      },
      async () => {
        await db.routines.bulkPut(DEFAULT_ROUTINES);
        await db.exercises.bulkPut(DEFAULT_EXERCISES);
      }
    );
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
 * Safely infers or heals a routine name for legacy routines that only have dayName, focusTarget, or slug.
 */
export function inferRoutineName(r: any): string {
  if (typeof r?.name === "string" && r.name.trim().length > 0) {
    return r.name.trim();
  }
  const day = typeof r?.dayName === "string" ? r.dayName.trim() : "";
  const focus = typeof r?.focusTarget === "string" ? r.focusTarget.trim() : "";
  if (day && focus) {
    return `${day} - ${focus}`;
  }
  if (day) return day;
  if (focus) return focus;

  if (typeof r?.slug === "string" && r.slug.trim().length > 0) {
    const s = r.slug.trim();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  if (typeof r?.id === "string" && r.id.trim().length > 0) {
    const cleaned = r.id
      .replace(/^rtn_/, "")
      .replace(/[_-]+/g, " ")
      .trim();
    if (cleaned.length > 0) {
      return cleaned
        .split(" ")
        .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    }
  }

  return "Workout";
}

/**
 * Safely infers or heals an exercise name for legacy exercises lacking a name.
 */
export function inferExerciseName(ex: any): string {
  if (typeof ex?.name === "string" && ex.name.trim().length > 0) {
    return ex.name.trim();
  }
  if (typeof ex?.id === "string" && ex.id.trim().length > 0) {
    const cleaned = ex.id
      .replace(/^(std_ex_|ex_)/, "")
      .replace(/[_-]+/g, " ")
      .trim();
    if (cleaned.length > 0) {
      return cleaned
        .split(" ")
        .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    }
  }
  return "Exercise";
}

/**
 * Retrieves a single routine by its UUID/id or slug.
 * Pure read-only operation safe for liveQuery contexts.
 */
export async function getRoutineByIdOrSlug(idOrSlug: string): Promise<Routine | undefined> {
  if (!idOrSlug) return undefined;
  const direct = await db.routines.get(idOrSlug);
  if (direct) {
    return {
      ...direct,
      name: inferRoutineName(direct),
    };
  }

  const normalized = idOrSlug.toLowerCase().trim();
  const bySlug = await db.routines.where("slug").equals(normalized).first();
  if (bySlug) {
    return {
      ...bySlug,
      name: inferRoutineName(bySlug),
    };
  }

  const byId = await db.routines.where("id").equals(idOrSlug.trim()).first();
  if (byId) {
    return {
      ...byId,
      name: inferRoutineName(byId),
    };
  }

  return undefined;
}

/**
 * Retrieves a single routine by its UUID/id.
 * Pure read-only operation safe for liveQuery contexts.
 */
export async function getRoutineById(id: string): Promise<Routine | undefined> {
  return getRoutineByIdOrSlug(id);
}

/**
 * Retrieves a single routine by slug or id.
 * Pure read-only operation safe for liveQuery contexts.
 */
export async function getRoutineBySlug(slug: string): Promise<Routine | undefined> {
  return getRoutineByIdOrSlug(slug);
}

/**
 * Retrieves a routine along with its ordered exercise configurations and library exercise data.
 * Pure read-only operation safe for liveQuery contexts.
 * Seamlessly resolves either UUID/id or legacy slug (e.g. 'monday', 'friday').
 */
export async function getRoutineWithExercises(
  routineId: string
): Promise<RoutineWithExercises | undefined> {
  if (!routineId) return undefined;

  const routine = await getRoutineByIdOrSlug(routineId);
  if (!routine) return undefined;

  const canonicalRoutineId = routine.id;

  // 1. Fetch ordered configurations from routineExercises table
  const configs = await db.routineExercises
    .where("routineId")
    .equals(canonicalRoutineId)
    .sortBy("displayOrder");

  if (configs.length > 0) {
    const exercisesWithDetails = await Promise.all(
      configs.map(async (cfg) => {
        let exercise = await getExerciseById(cfg.exerciseId);
        if (!exercise) {
          // Fallback placeholder if exercise was somehow unlinked
          exercise = {
            id: cfg.exerciseId,
            name: inferExerciseName({ id: cfg.exerciseId }),
            createdAt: cfg.createdAt,
            updatedAt: cfg.updatedAt,
          };
        } else if (!exercise.name) {
          exercise = {
            ...exercise,
            name: inferExerciseName(exercise),
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
    .equals(canonicalRoutineId)
    .sortBy("displayOrder");

  const exercises = legacyExercises.map((ex, idx) => ({
    id: ex.id,
    routineId: canonicalRoutineId,
    exerciseId: ex.id,
    displayOrder: ex.displayOrder ?? idx + 1,
    targetSets: ex.targetSets ?? 3,
    targetReps: ex.targetReps ?? "8-10",
    restSeconds: 90,
    notes: ex.coachingCue || undefined,
    createdAt: ex.createdAt || new Date().toISOString(),
    updatedAt: ex.updatedAt || new Date().toISOString(),
    exercise: {
      ...ex,
      name: inferExerciseName(ex),
    },
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
      routineId: withExercises.id,
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
    daysOfWeek?: string[];
    dayName?: string;
    slug?: string;
    exercises?: Array<{
      exerciseId: string;
      targetSets: number;
      targetReps: string;
      restSeconds?: number;
      loadType?: ExerciseLoadType;
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
    id: generateUUID(),
    userId,
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    daysOfWeek: input.daysOfWeek,
    dayName: input.dayName?.trim() || undefined,
    slug: input.slug?.trim() || undefined,
    displayOrder: existingCount + 1,
    createdAt: now,
    updatedAt: now,
  };

  const configs: RoutineExerciseConfig[] = (input.exercises || []).map((item, index) => ({
    id: generateUUID(),
    routineId: routine.id,
    exerciseId: item.exerciseId,
    displayOrder: index + 1,
    targetSets: Number(item.targetSets) || 3,
    targetReps: String(item.targetReps || "8-10").trim(),
    restSeconds: Number(item.restSeconds) || 90,
    loadType: item.loadType,
    notes: item.notes?.trim() || undefined,
    userId,
    createdAt: now,
    updatedAt: now,
  }));

  const routineSyncItem: SyncQueueItem = {
    id: generateUUID(),
    userId,
    operation: "insert",
    collection: "routines",
    entityId: routine.id,
    payload: JSON.parse(JSON.stringify(routine)),
    timestamp: Date.now(),
    status: "pending",
    attempts: 0,
  };

  const configSyncItems: SyncQueueItem[] = configs.map((cfg) => ({
    id: generateUUID(),
    userId,
    operation: "insert",
    collection: "routine_exercises",
    entityId: cfg.id,
    payload: JSON.parse(JSON.stringify(cfg)),
    timestamp: Date.now(),
    status: "pending",
    attempts: 0,
  }));

  const allSyncItems = [routineSyncItem, ...configSyncItems];

  await resilientTransaction(
    "createRoutine",
    [db.routines, db.routineExercises, db.syncQueue],
    async () => {
      await Promise.all([
        db.routines.add(routine),
        configs.length > 0 ? db.routineExercises.bulkAdd(configs) : Promise.resolve(),
        db.syncQueue.bulkAdd(allSyncItems),
      ]);
    },
    async () => {
      await db.routines.add(routine);
      if (configs.length > 0) {
        await db.routineExercises.bulkAdd(configs);
      }
      await db.syncQueue.bulkAdd(allSyncItems);
    }
  );

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
      loadType?: ExerciseLoadType;
      notes?: string;
    }>;
  }
): Promise<Routine> {
  assertUserId(userId);

  const existing = await getRoutineByIdOrSlug(routineId);
  if (!existing) {
    throw new Error("Routine not found or unauthorized.");
  }
  if (existing.userId !== userId && existing.userId !== "legacy_default") {
    throw new Error("Routine not found or unauthorized.");
  }

  const canonicalRoutineId = existing.id;
  const now = new Date().toISOString();
  const updatedRoutine: Routine = {
    ...existing,
    userId, // claim ownership if previously legacy_default
    name: input.name !== undefined ? input.name.trim() : (existing.name || inferRoutineName(existing)),
    description:
      input.description !== undefined ? input.description?.trim() || undefined : existing.description,
    updatedAt: now,
  };

  const existingConfigs =
    input.exercises !== undefined
      ? await db.routineExercises.where("routineId").equals(canonicalRoutineId).toArray()
      : [];

  const routineSyncItem: SyncQueueItem = {
    id: generateUUID(),
    userId,
    operation: "update",
    collection: "routines",
    entityId: updatedRoutine.id,
    payload: JSON.parse(JSON.stringify(updatedRoutine)),
    timestamp: Date.now(),
    status: "pending",
    attempts: 0,
  };

  const delSyncItems: SyncQueueItem[] = existingConfigs.map((oldCfg) => ({
    id: generateUUID(),
    userId,
    operation: "delete",
    collection: "routine_exercises",
    entityId: oldCfg.id,
    payload: { id: oldCfg.id },
    timestamp: Date.now(),
    status: "pending",
    attempts: 0,
  }));

  const newConfigs: RoutineExerciseConfig[] = (input.exercises || []).map((item, index) => ({
    id: item.id || generateUUID(),
    routineId: canonicalRoutineId,
    exerciseId: item.exerciseId,
    displayOrder: index + 1,
    targetSets: Number(item.targetSets) || 3,
    targetReps: String(item.targetReps || "8-10").trim(),
    restSeconds: Number(item.restSeconds) || 90,
    loadType: item.loadType,
    notes: item.notes?.trim() || undefined,
    userId,
    createdAt: now,
    updatedAt: now,
  }));

  const addSyncItems: SyncQueueItem[] = newConfigs.map((cfg) => ({
    id: generateUUID(),
    userId,
    operation: "insert",
    collection: "routine_exercises",
    entityId: cfg.id,
    payload: JSON.parse(JSON.stringify(cfg)),
    timestamp: Date.now(),
    status: "pending",
    attempts: 0,
  }));

  const allSyncItems = [
    routineSyncItem,
    ...(input.exercises !== undefined ? delSyncItems : []),
    ...(input.exercises !== undefined ? addSyncItems : []),
  ];

  await resilientTransaction(
    "updateRoutine",
    [db.routines, db.routineExercises, db.syncQueue],
    async () => {
      const ops: Promise<any>[] = [
        db.routines.put(updatedRoutine),
        db.syncQueue.bulkAdd(allSyncItems),
      ];
      if (input.exercises !== undefined) {
        if (existingConfigs.length > 0) {
          ops.push(db.routineExercises.where("routineId").equals(canonicalRoutineId).delete());
        }
        if (newConfigs.length > 0) {
          ops.push(db.routineExercises.bulkAdd(newConfigs));
        }
      }
      await Promise.all(ops);
    },
    async () => {
      await db.routines.put(updatedRoutine);
      if (input.exercises !== undefined) {
        if (existingConfigs.length > 0) {
          await db.routineExercises.where("routineId").equals(canonicalRoutineId).delete();
        }
        if (newConfigs.length > 0) {
          await db.routineExercises.bulkAdd(newConfigs);
        }
      }
      await db.syncQueue.bulkAdd(allSyncItems);
    }
  );

  return updatedRoutine;
}

/**
 * Deletes a routine and all its associated exercise configurations.
 */
export async function deleteRoutine(userId: string, routineId: string): Promise<boolean> {
  assertUserId(userId);

  const existing = await getRoutineByIdOrSlug(routineId);
  if (!existing || (existing.userId !== userId && existing.userId !== "legacy_default")) {
    return false;
  }

  const canonicalRoutineId = existing.id;
  const configs = await db.routineExercises.where("routineId").equals(canonicalRoutineId).toArray();

  const routineDel: SyncQueueItem = {
    id: generateUUID(),
    userId,
    operation: "delete",
    collection: "routines",
    entityId: canonicalRoutineId,
    payload: { id: canonicalRoutineId },
    timestamp: Date.now(),
    status: "pending",
    attempts: 0,
  };

  const cfgDels: SyncQueueItem[] = configs.map((cfg) => ({
    id: generateUUID(),
    userId,
    operation: "delete",
    collection: "routine_exercises",
    entityId: cfg.id,
    payload: { id: cfg.id },
    timestamp: Date.now(),
    status: "pending",
    attempts: 0,
  }));

  const allDels = [routineDel, ...cfgDels];

  await resilientTransaction(
    "deleteRoutine",
    [db.routines, db.routineExercises, db.syncQueue],
    async () => {
      await Promise.all([
        db.routines.delete(canonicalRoutineId),
        db.routineExercises.where("routineId").equals(canonicalRoutineId).delete(),
        db.syncQueue.bulkAdd(allDels),
      ]);
    },
    async () => {
      await db.routines.delete(canonicalRoutineId);
      await db.routineExercises.where("routineId").equals(canonicalRoutineId).delete();
      await db.syncQueue.bulkAdd(allDels);
    }
  );

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

  const routine = await getRoutineByIdOrSlug(routineId);
  if (!routine || (routine.userId !== userId && routine.userId !== "legacy_default")) {
    throw new Error("Unauthorized to reorder exercises for this routine.");
  }

  const canonicalRoutineId = routine.id;
  const now = new Date().toISOString();
  const configsToUpdate: RoutineExerciseConfig[] = [];
  const syncItemsToQueue: SyncQueueItem[] = [];

  for (let i = 0; i < orderedConfigIds.length; i++) {
    const configId = orderedConfigIds[i];
    const newOrder = i + 1;
    const cfg = await db.routineExercises.get(configId);
    if (cfg && cfg.routineId === canonicalRoutineId) {
      const updatedCfg = { ...cfg, displayOrder: newOrder, updatedAt: now };
      configsToUpdate.push(updatedCfg);
      syncItemsToQueue.push({
        id: generateUUID(),
        userId,
        operation: "update",
        collection: "routine_exercises",
        entityId: cfg.id,
        payload: JSON.parse(JSON.stringify(updatedCfg)),
        timestamp: Date.now(),
        status: "pending",
        attempts: 0,
      });
    }
  }

  await resilientTransaction(
    "reorderRoutineExercises",
    [db.routineExercises, db.syncQueue],
    async () => {
      await Promise.all([
        db.routineExercises.bulkPut(configsToUpdate),
        db.syncQueue.bulkAdd(syncItemsToQueue),
      ]);
    },
    async () => {
      await db.routineExercises.bulkPut(configsToUpdate);
      await db.syncQueue.bulkAdd(syncItemsToQueue);
    }
  );
}
