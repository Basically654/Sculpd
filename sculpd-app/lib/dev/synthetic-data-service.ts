// lib/dev/synthetic-data-service.ts
import { db } from "@/lib/db";
import {
  User,
  Routine,
  RoutineExerciseConfig,
  WorkoutSession,
  WorkoutSet,
  SyncQueueItem,
  SyncMeta,
  Exercise,
} from "@/types/models";
import { hashPin } from "@/lib/crypto/pin";
import { generateUUID } from "@/lib/crypto/uuid";
import { logTestTelemetry } from "@/lib/telemetry/telemetry-service";
import { ensureDbOpen } from "@/lib/db/transaction";

export const SYNTHETIC_PREFIX = "dev_synthetic_";

export function isSyntheticId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(SYNTHETIC_PREFIX);
}

export interface SyntheticCounts {
  users: number;
  routines: number;
  routineExercises: number;
  workoutSessions: number;
  sets: number;
  syncQueue: number;
  syncMeta: number;
  total: number;
}

export interface SyntheticCleanupResult {
  deleted: SyntheticCounts;
  timestamp: string;
}

export type SyntheticScenarioKey =
  | "fresh_athlete"
  | "active_athlete"
  | "in_progress"
  | "historical_backfill"
  | "sync_failures";

export interface ScenarioDefinition {
  key: SyntheticScenarioKey;
  name: string;
  description: string;
  estimatedRecords: string;
}

export const AVAILABLE_SCENARIOS: ScenarioDefinition[] = [
  {
    key: "fresh_athlete",
    name: "New Athlete (Clean Profile)",
    description: "New user profile with 1 starter routine, 0 workout history, and 0 logged sets.",
    estimatedRecords: "1 User, 1 Routine, 2 Routine Exercises",
  },
  {
    key: "active_athlete",
    name: "3-Week Active Athlete (Workouts & PRs)",
    description: "Active athlete with 2 routines, 9 completed sessions across 3 weeks, realistic weights, and progressive overload PRs.",
    estimatedRecords: "1 User, 2 Routines, 6 Routine Exercises, 9 Sessions, 36 Sets",
  },
  {
    key: "in_progress",
    name: "In-Progress Workout Session",
    description: "Athlete currently midway through a workout session with partially logged sets and an active timer context.",
    estimatedRecords: "1 User, 1 Routine, 3 Routine Exercises, 1 Live Session, 2 Sets",
  },
  {
    key: "historical_backfill",
    name: "Historical Backfill & Multi-Month Calendar",
    description: "Multi-month training history with backfilled session dates, rest days, and multi-session days for calendar validation.",
    estimatedRecords: "1 User, 2 Routines, 14 Completed Sessions spanning 2 months",
  },
  {
    key: "sync_failures",
    name: "Sync Queue Pending & Error Retries",
    description: "Simulated outbox entries in syncQueue with failed statuses, retry counts, and server error diagnostics.",
    estimatedRecords: "1 User, 4 Sync Queue Items (2 Failed, 2 Pending)",
  },
];

/**
 * Counts all synthetic records currently stored across all Dexie tables.
 */
export async function countSyntheticRecords(): Promise<SyntheticCounts> {
  await ensureDbOpen();

  const [
    users,
    routines,
    routineExercises,
    workoutSessions,
    sets,
    syncQueue,
    syncMeta,
  ] = await Promise.all([
    db.users.filter((u) => isSyntheticId(u.id)).count(),
    db.routines.filter((r) => isSyntheticId(r.id) || isSyntheticId(r.userId)).count(),
    db.routineExercises.filter(
      (re) => isSyntheticId(re.id) || isSyntheticId(re.routineId) || isSyntheticId(re.userId)
    ).count(),
    db.workoutSessions.filter((ws) => isSyntheticId(ws.id) || isSyntheticId(ws.userId)).count(),
    db.sets.filter((s) => isSyntheticId(s.id) || isSyntheticId(s.userId)).count(),
    db.syncQueue.filter((sq) => isSyntheticId(sq.id) || isSyntheticId(sq.userId)).count(),
    db.syncMeta.filter((sm) => sm.key.startsWith(SYNTHETIC_PREFIX) || isSyntheticId(sm.userId)).count(),
  ]);

  const total =
    users +
    routines +
    routineExercises +
    workoutSessions +
    sets +
    syncQueue +
    syncMeta;

  return {
    users,
    routines,
    routineExercises,
    workoutSessions,
    sets,
    syncQueue,
    syncMeta,
    total,
  };
}

/**
 * Safely removes ALL synthetic test data (`dev_synthetic_*`) from the local Dexie database.
 * Real athlete records (`usr_*`, standard exercises, etc.) are strictly protected and never touched.
 */
export async function cleanupSyntheticData(): Promise<SyntheticCleanupResult> {
  await ensureDbOpen();

  const countsBefore = await countSyntheticRecords();

  await db.transaction(
    "rw",
    [
      db.users,
      db.routines,
      db.routineExercises,
      db.workoutSessions,
      db.sets,
      db.syncQueue,
      db.syncMeta,
    ],
    async () => {
      // 1. Users
      const syntheticUsers = await db.users
        .filter((u) => isSyntheticId(u.id))
        .primaryKeys();
      await db.users.bulkDelete(syntheticUsers);

      // 2. Routines
      const syntheticRoutines = await db.routines
        .filter((r) => isSyntheticId(r.id) || isSyntheticId(r.userId))
        .primaryKeys();
      await db.routines.bulkDelete(syntheticRoutines);

      // 3. Routine Exercises
      const syntheticRoutineExercises = await db.routineExercises
        .filter(
          (re) =>
            isSyntheticId(re.id) ||
            isSyntheticId(re.routineId) ||
            isSyntheticId(re.userId)
        )
        .primaryKeys();
      await db.routineExercises.bulkDelete(syntheticRoutineExercises);

      // 4. Workout Sessions
      const syntheticSessions = await db.workoutSessions
        .filter((ws) => isSyntheticId(ws.id) || isSyntheticId(ws.userId))
        .primaryKeys();
      await db.workoutSessions.bulkDelete(syntheticSessions);

      // 5. Sets
      const syntheticSets = await db.sets
        .filter((s) => isSyntheticId(s.id) || isSyntheticId(s.userId))
        .primaryKeys();
      await db.sets.bulkDelete(syntheticSets);

      // 6. Sync Queue
      const syntheticQueue = await db.syncQueue
        .filter((sq) => isSyntheticId(sq.id) || isSyntheticId(sq.userId))
        .primaryKeys();
      await db.syncQueue.bulkDelete(syntheticQueue);

      // 7. Sync Meta
      const syntheticMeta = await db.syncMeta
        .filter((sm) => sm.key.startsWith(SYNTHETIC_PREFIX) || isSyntheticId(sm.userId))
        .primaryKeys();
      await db.syncMeta.bulkDelete(syntheticMeta);
    }
  );

  const timestamp = new Date().toISOString();

  logTestTelemetry("synthetic_data_cleanup", "pass", {
    deletedTotal: countsBefore.total,
    details: countsBefore,
  });

  return {
    deleted: countsBefore,
    timestamp,
  };
}

/**
 * Creates a synthetic athlete user profile.
 */
async function createSyntheticUser(
  suffix: string,
  displayName: string,
  avatarColor: User["avatarColor"],
  bodyweight = 180
): Promise<User> {
  const { pinHash, pinSalt } = await hashPin("1234");
  const now = new Date().toISOString();
  const user: User = {
    id: `${SYNTHETIC_PREFIX}usr_${suffix}`,
    displayName,
    pinHash,
    pinSalt,
    avatarColor,
    bodyweight,
    createdAt: now,
    updatedAt: now,
  };
  await db.users.put(user);
  return user;
}

/**
 * Generates Scenario 1: New Athlete (Clean Profile)
 */
async function generateFreshAthleteScenario(): Promise<{ user: User; routines: Routine[] }> {
  const user = await createSyntheticUser("fresh", "Dev Fresh Athlete", "emerald", 175);
  const now = new Date().toISOString();

  const routineId = `${SYNTHETIC_PREFIX}rtn_fresh_push`;
  const routine: Routine = {
    id: routineId,
    userId: user.id,
    name: "Push Day Starter",
    description: "Beginner synthetic push template",
    displayOrder: 1,
    createdAt: now,
    updatedAt: now,
  };

  const re1: RoutineExerciseConfig = {
    id: `${SYNTHETIC_PREFIX}re_fresh_1`,
    routineId,
    userId: user.id,
    exerciseId: "std_ex_bench_press",
    displayOrder: 1,
    targetSets: 3,
    targetReps: "8-10",
    restSeconds: 90,
    loadType: "weighted",
    createdAt: now,
    updatedAt: now,
  };

  const re2: RoutineExerciseConfig = {
    id: `${SYNTHETIC_PREFIX}re_fresh_2`,
    routineId,
    userId: user.id,
    exerciseId: "std_ex_incline_db_press",
    displayOrder: 2,
    targetSets: 3,
    targetReps: "10-12",
    restSeconds: 90,
    loadType: "weighted",
    createdAt: now,
    updatedAt: now,
  };

  await db.routines.put(routine);
  await db.routineExercises.bulkPut([re1, re2]);

  return { user, routines: [routine] };
}

/**
 * Generates Scenario 2: 3-Week Active Athlete (Workouts & PRs)
 */
async function generateActiveAthleteScenario(): Promise<{
  user: User;
  routines: Routine[];
  sessionCount: number;
  setCount: number;
}> {
  const user = await createSyntheticUser("active", "Dev Active Athlete", "violet", 185);
  const now = new Date();

  // Create 2 Routines: Upper & Lower
  const upperRtnId = `${SYNTHETIC_PREFIX}rtn_active_upper`;
  const lowerRtnId = `${SYNTHETIC_PREFIX}rtn_active_lower`;

  const upperRtn: Routine = {
    id: upperRtnId,
    userId: user.id,
    name: "Upper Body Power",
    description: "Chest, Back & Shoulders",
    displayOrder: 1,
    createdAt: new Date(now.getTime() - 25 * 86400000).toISOString(),
    updatedAt: new Date(now.getTime() - 25 * 86400000).toISOString(),
  };

  const lowerRtn: Routine = {
    id: lowerRtnId,
    userId: user.id,
    name: "Lower Body Power",
    description: "Squat, RDL & Calves",
    displayOrder: 2,
    createdAt: new Date(now.getTime() - 25 * 86400000).toISOString(),
    updatedAt: new Date(now.getTime() - 25 * 86400000).toISOString(),
  };

  await db.routines.bulkPut([upperRtn, lowerRtn]);

  // Routine Exercises for Upper
  const upperExercises: RoutineExerciseConfig[] = [
    {
      id: `${SYNTHETIC_PREFIX}re_active_up1`,
      routineId: upperRtnId,
      userId: user.id,
      exerciseId: "std_ex_bench_press",
      displayOrder: 1,
      targetSets: 3,
      targetReps: "5-8",
      restSeconds: 120,
      loadType: "weighted",
      createdAt: upperRtn.createdAt,
      updatedAt: upperRtn.createdAt,
    },
    {
      id: `${SYNTHETIC_PREFIX}re_active_up2`,
      routineId: upperRtnId,
      userId: user.id,
      exerciseId: "std_ex_bent_over_row",
      displayOrder: 2,
      targetSets: 3,
      targetReps: "8-10",
      restSeconds: 90,
      loadType: "weighted",
      createdAt: upperRtn.createdAt,
      updatedAt: upperRtn.createdAt,
    },
    {
      id: `${SYNTHETIC_PREFIX}re_active_up3`,
      routineId: upperRtnId,
      userId: user.id,
      exerciseId: "std_ex_lateral_raise",
      displayOrder: 3,
      targetSets: 3,
      targetReps: "12-15",
      restSeconds: 60,
      loadType: "weighted",
      createdAt: upperRtn.createdAt,
      updatedAt: upperRtn.createdAt,
    },
  ];

  // Routine Exercises for Lower
  const lowerExercises: RoutineExerciseConfig[] = [
    {
      id: `${SYNTHETIC_PREFIX}re_active_low1`,
      routineId: lowerRtnId,
      userId: user.id,
      exerciseId: "std_ex_squat",
      displayOrder: 1,
      targetSets: 3,
      targetReps: "5-8",
      restSeconds: 120,
      loadType: "weighted",
      createdAt: lowerRtn.createdAt,
      updatedAt: lowerRtn.createdAt,
    },
    {
      id: `${SYNTHETIC_PREFIX}re_active_low2`,
      routineId: lowerRtnId,
      userId: user.id,
      exerciseId: "std_ex_romanian_deadlift",
      displayOrder: 2,
      targetSets: 3,
      targetReps: "8-10",
      restSeconds: 90,
      loadType: "weighted",
      createdAt: lowerRtn.createdAt,
      updatedAt: lowerRtn.createdAt,
    },
    {
      id: `${SYNTHETIC_PREFIX}re_active_low3`,
      routineId: lowerRtnId,
      userId: user.id,
      exerciseId: "std_ex_standing_calf_raise",
      displayOrder: 3,
      targetSets: 3,
      targetReps: "12-15",
      restSeconds: 60,
      loadType: "weighted",
      createdAt: lowerRtn.createdAt,
      updatedAt: lowerRtn.createdAt,
    },
  ];

  await db.routineExercises.bulkPut([...upperExercises, ...lowerExercises]);

  // Generate 9 completed sessions across past 21 days (3 per week)
  const sessions: WorkoutSession[] = [];
  const sets: WorkoutSet[] = [];

  const dayOffsets = [21, 19, 16, 14, 12, 9, 7, 4, 1]; // days ago
  let benchBase = 185;
  let squatBase = 225;

  for (let i = 0; i < dayOffsets.length; i++) {
    const isUpper = i % 2 === 0;
    const sessionDate = new Date(now.getTime() - dayOffsets[i] * 86400000);
    const startDate = new Date(sessionDate.setHours(17, 30, 0, 0));
    const endDate = new Date(sessionDate.setHours(18, 25, 0, 0));

    const sessionId = `${SYNTHETIC_PREFIX}ws_act_${i + 1}`;
    const activeRoutine = isUpper ? upperRtn : lowerRtn;

    sessions.push({
      id: sessionId,
      userId: user.id,
      routineId: activeRoutine.id,
      routineName: activeRoutine.name,
      exerciseSnapshots: (isUpper ? upperExercises : lowerExercises).map((e) => ({
        exerciseId: e.exerciseId,
        name: e.exerciseId,
        displayOrder: e.displayOrder,
        targetSets: e.targetSets,
        targetReps: e.targetReps,
        restSeconds: e.restSeconds,
        loadType: e.loadType,
      })),
      startedAt: startDate.toISOString(),
      completedAt: endDate.toISOString(),
      status: "completed",
      notes: `Synthetic Session ${i + 1} - Strong performance`,
      updatedAt: endDate.toISOString(),
    });

    if (isUpper) {
      benchBase += 5; // Progressive overload PR progression
      // Bench sets
      for (let s = 1; s <= 3; s++) {
        sets.push({
          id: `${SYNTHETIC_PREFIX}set_act_${i + 1}_bp_${s}`,
          userId: user.id,
          workoutSessionId: sessionId,
          exerciseId: "std_ex_bench_press",
          setNumber: s,
          weight: benchBase,
          reps: 6 + (s === 1 ? 2 : 0),
          rpe: 8 + s * 0.5,
          createdAt: new Date(startDate.getTime() + s * 5 * 60000).toISOString(),
          updatedAt: new Date(startDate.getTime() + s * 5 * 60000).toISOString(),
        });
      }
      // Row sets
      for (let s = 1; s <= 2; s++) {
        sets.push({
          id: `${SYNTHETIC_PREFIX}set_act_${i + 1}_row_${s}`,
          userId: user.id,
          workoutSessionId: sessionId,
          exerciseId: "std_ex_bent_over_row",
          setNumber: s,
          weight: 155,
          reps: 8,
          rpe: 8,
          createdAt: new Date(startDate.getTime() + (15 + s * 4) * 60000).toISOString(),
          updatedAt: new Date(startDate.getTime() + (15 + s * 4) * 60000).toISOString(),
        });
      }
    } else {
      squatBase += 5; // Progressive overload PR progression
      // Squat sets
      for (let s = 1; s <= 3; s++) {
        sets.push({
          id: `${SYNTHETIC_PREFIX}set_act_${i + 1}_sq_${s}`,
          userId: user.id,
          workoutSessionId: sessionId,
          exerciseId: "std_ex_squat",
          setNumber: s,
          weight: squatBase,
          reps: 5,
          rpe: 8.5,
          createdAt: new Date(startDate.getTime() + s * 6 * 60000).toISOString(),
          updatedAt: new Date(startDate.getTime() + s * 6 * 60000).toISOString(),
        });
      }
      // RDL sets
      for (let s = 1; s <= 2; s++) {
        sets.push({
          id: `${SYNTHETIC_PREFIX}set_act_${i + 1}_rdl_${s}`,
          userId: user.id,
          workoutSessionId: sessionId,
          exerciseId: "std_ex_romanian_deadlift",
          setNumber: s,
          weight: 185,
          reps: 8,
          rpe: 8,
          createdAt: new Date(startDate.getTime() + (20 + s * 5) * 60000).toISOString(),
          updatedAt: new Date(startDate.getTime() + (20 + s * 5) * 60000).toISOString(),
        });
      }
    }
  }

  await db.workoutSessions.bulkPut(sessions);
  await db.sets.bulkPut(sets);

  return {
    user,
    routines: [upperRtn, lowerRtn],
    sessionCount: sessions.length,
    setCount: sets.length,
  };
}

/**
 * Generates Scenario 3: In-Progress Session
 */
async function generateInProgressScenario(): Promise<{
  user: User;
  session: WorkoutSession;
  sets: WorkoutSet[];
}> {
  const user = await createSyntheticUser("inprog", "Dev Live Athlete", "amber", 165);
  const now = new Date();
  const startTime = new Date(now.getTime() - 25 * 60000); // 25 mins ago

  const routineId = `${SYNTHETIC_PREFIX}rtn_inprog_leg`;
  const routine: Routine = {
    id: routineId,
    userId: user.id,
    name: "Live Quad Focus",
    displayOrder: 1,
    createdAt: startTime.toISOString(),
    updatedAt: startTime.toISOString(),
  };

  const re: RoutineExerciseConfig = {
    id: `${SYNTHETIC_PREFIX}re_inprog_1`,
    routineId,
    userId: user.id,
    exerciseId: "std_ex_hack_squat",
    displayOrder: 1,
    targetSets: 3,
    targetReps: "8-10",
    restSeconds: 90,
    loadType: "weighted",
    createdAt: startTime.toISOString(),
    updatedAt: startTime.toISOString(),
  };

  const sessionId = `${SYNTHETIC_PREFIX}ws_inprog_active`;
  const session: WorkoutSession = {
    id: sessionId,
    userId: user.id,
    routineId,
    routineName: "Live Quad Focus",
    exerciseSnapshots: [
      {
        exerciseId: "std_ex_hack_squat",
        name: "Hack Squat",
        displayOrder: 1,
        targetSets: 3,
        targetReps: "8-10",
        restSeconds: 90,
        loadType: "weighted",
      },
      {
        exerciseId: "std_ex_leg_extension",
        name: "Leg Extension",
        displayOrder: 2,
        targetSets: 3,
        targetReps: "12-15",
        restSeconds: 60,
        loadType: "weighted",
      },
    ],
    startedAt: startTime.toISOString(),
    completedAt: null,
    status: "in_progress",
    notes: "Active developer mode test session",
    updatedAt: now.toISOString(),
  };

  const loggedSets: WorkoutSet[] = [
    {
      id: `${SYNTHETIC_PREFIX}set_inprog_1`,
      userId: user.id,
      workoutSessionId: sessionId,
      exerciseId: "std_ex_hack_squat",
      setNumber: 1,
      weight: 270,
      reps: 10,
      rpe: 8,
      createdAt: new Date(startTime.getTime() + 5 * 60000).toISOString(),
      updatedAt: new Date(startTime.getTime() + 5 * 60000).toISOString(),
    },
    {
      id: `${SYNTHETIC_PREFIX}set_inprog_2`,
      userId: user.id,
      workoutSessionId: sessionId,
      exerciseId: "std_ex_hack_squat",
      setNumber: 2,
      weight: 290,
      reps: 8,
      rpe: 9,
      createdAt: new Date(startTime.getTime() + 10 * 60000).toISOString(),
      updatedAt: new Date(startTime.getTime() + 10 * 60000).toISOString(),
    },
  ];

  await db.routines.put(routine);
  await db.routineExercises.put(re);
  await db.workoutSessions.put(session);
  await db.sets.bulkPut(loggedSets);

  return { user, session, sets: loggedSets };
}

/**
 * Generates Scenario 4: Historical Backfill & Multi-Month Calendar
 */
async function generateHistoricalBackfillScenario(): Promise<{
  user: User;
  sessionCount: number;
}> {
  const user = await createSyntheticUser("backfill", "Dev History Athlete", "cyan", 170);
  const now = new Date();
  const sessions: WorkoutSession[] = [];
  const sets: WorkoutSet[] = [];

  const routineId = `${SYNTHETIC_PREFIX}rtn_hist_full`;
  const routine: Routine = {
    id: routineId,
    userId: user.id,
    name: "Consistent Hybrid",
    displayOrder: 1,
    createdAt: new Date(now.getTime() - 60 * 86400000).toISOString(),
    updatedAt: new Date(now.getTime() - 60 * 86400000).toISOString(),
  };
  await db.routines.put(routine);

  // Generate 14 sessions over 60 days, with 2 sessions on day 15 (multi-session test)
  const sessionDaysAgo = [55, 52, 48, 44, 40, 36, 32, 28, 24, 20, 15, 15, 8, 3];

  sessionDaysAgo.forEach((daysAgo, idx) => {
    const isSecondSessionOnDay = idx === 11;
    const startHour = isSecondSessionOnDay ? 18 : 9;
    const date = new Date(now.getTime() - daysAgo * 86400000);
    date.setHours(startHour, 0, 0, 0);

    const endDate = new Date(date.getTime() + 45 * 60000);
    const sessionId = `${SYNTHETIC_PREFIX}ws_hist_${idx + 1}`;

    sessions.push({
      id: sessionId,
      userId: user.id,
      routineId,
      routineName: "Consistent Hybrid",
      startedAt: date.toISOString(),
      completedAt: endDate.toISOString(),
      status: "completed",
      notes: isSecondSessionOnDay
        ? "Backfilled 2nd daily session (Evening recovery)"
        : `Historical workout day ${60 - daysAgo}`,
      updatedAt: endDate.toISOString(),
    });

    sets.push({
      id: `${SYNTHETIC_PREFIX}set_hist_${idx + 1}_1`,
      userId: user.id,
      workoutSessionId: sessionId,
      exerciseId: "std_ex_bench_press",
      setNumber: 1,
      weight: 185 + (idx % 3) * 5,
      reps: 8,
      rpe: 8,
      createdAt: new Date(date.getTime() + 10 * 60000).toISOString(),
      updatedAt: new Date(date.getTime() + 10 * 60000).toISOString(),
    });
  });

  await db.workoutSessions.bulkPut(sessions);
  await db.sets.bulkPut(sets);

  return { user, sessionCount: sessions.length };
}

/**
 * Generates Scenario 5: Sync Queue Failures & Pending Retries
 */
async function generateSyncQueueFailureScenario(): Promise<{
  user: User;
  queueItems: SyncQueueItem[];
}> {
  const user = await createSyntheticUser("syncfail", "Dev Sync Tester", "rose", 190);
  const now = Date.now();

  const queueItems: SyncQueueItem[] = [
    {
      id: `${SYNTHETIC_PREFIX}sq_fail_1`,
      userId: user.id,
      operation: "insert",
      collection: "workout_sessions",
      entityId: `${SYNTHETIC_PREFIX}ws_fake_1`,
      payload: { id: `${SYNTHETIC_PREFIX}ws_fake_1`, status: "completed" },
      timestamp: now - 3600000,
      status: "failed",
      attempts: 3,
      lastAttemptAt: now - 600000,
      lastError: "Simulated 500: Gateway sync timeout on MongoDB push",
    },
    {
      id: `${SYNTHETIC_PREFIX}sq_fail_2`,
      userId: user.id,
      operation: "update",
      collection: "sets",
      entityId: `${SYNTHETIC_PREFIX}set_fake_1`,
      payload: { id: `${SYNTHETIC_PREFIX}set_fake_1`, weight: 225, reps: 5 },
      timestamp: now - 1800000,
      status: "failed",
      attempts: 2,
      lastAttemptAt: now - 300000,
      lastError: "Simulated 409: Version conflict with cloud document",
    },
    {
      id: `${SYNTHETIC_PREFIX}sq_pend_1`,
      userId: user.id,
      operation: "insert",
      collection: "routines",
      entityId: `${SYNTHETIC_PREFIX}rtn_fake_1`,
      payload: { id: `${SYNTHETIC_PREFIX}rtn_fake_1`, name: "Pending Sync Routine" },
      timestamp: now - 60000,
      status: "pending",
      attempts: 0,
      lastAttemptAt: null,
    },
    {
      id: `${SYNTHETIC_PREFIX}sq_pend_2`,
      userId: user.id,
      operation: "insert",
      collection: "routine_exercises",
      entityId: `${SYNTHETIC_PREFIX}re_fake_1`,
      payload: { id: `${SYNTHETIC_PREFIX}re_fake_1`, routineId: `${SYNTHETIC_PREFIX}rtn_fake_1` },
      timestamp: now - 30000,
      status: "pending",
      attempts: 0,
      lastAttemptAt: null,
    },
  ];

  await db.syncQueue.bulkPut(queueItems);

  return { user, queueItems };
}

/**
 * Main dispatcher to generate any supported synthetic scenario.
 */
export async function generateScenario(scenarioKey: SyntheticScenarioKey): Promise<{
  scenarioKey: SyntheticScenarioKey;
  summary: string;
  counts: SyntheticCounts;
}> {
  await ensureDbOpen();

  let summary = "";
  switch (scenarioKey) {
    case "fresh_athlete": {
      const res = await generateFreshAthleteScenario();
      summary = `Created fresh athlete '${res.user.displayName}' with routine '${res.routines[0].name}'`;
      break;
    }
    case "active_athlete": {
      const res = await generateActiveAthleteScenario();
      summary = `Created active athlete '${res.user.displayName}' with ${res.sessionCount} sessions and ${res.setCount} sets over 3 weeks`;
      break;
    }
    case "in_progress": {
      const res = await generateInProgressScenario();
      summary = `Created live athlete '${res.user.displayName}' with active session '${res.session.routineName}' and ${res.sets.length} sets logged`;
      break;
    }
    case "historical_backfill": {
      const res = await generateHistoricalBackfillScenario();
      summary = `Created history athlete '${res.user.displayName}' with ${res.sessionCount} sessions spanning 2 months`;
      break;
    }
    case "sync_failures": {
      const res = await generateSyncQueueFailureScenario();
      summary = `Created sync tester '${res.user.displayName}' with ${res.queueItems.length} queued items (2 failed, 2 pending)`;
      break;
    }
    default:
      throw new Error(`Unsupported scenario key: ${scenarioKey}`);
  }

  const counts = await countSyntheticRecords();

  logTestTelemetry("synthetic_scenario_generated", "pass", {
    scenarioKey,
    summary,
    currentCounts: counts,
  });

  return {
    scenarioKey,
    summary,
    counts,
  };
}
