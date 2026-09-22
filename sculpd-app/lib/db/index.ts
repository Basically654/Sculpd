// lib/db/index.ts
import Dexie, { type Table } from "dexie";
import {
  User,
  Routine,
  Exercise,
  RoutineExerciseConfig,
  WorkoutSession,
  WorkoutSet,
  SyncQueueItem,
  SyncMeta,
} from "@/types/models";

export const CURRENT_DB_VERSION = 2;
export const DB_NAME = "sculpd_v2_db";

export class SculpdDatabase extends Dexie {
  users!: Table<User, string>;
  routines!: Table<Routine, string>;
  exercises!: Table<Exercise, string>;
  routineExercises!: Table<RoutineExerciseConfig, string>;
  workoutSessions!: Table<WorkoutSession, string>;
  sets!: Table<WorkoutSet, string>;
  syncQueue!: Table<SyncQueueItem, string>;
  syncMeta!: Table<SyncMeta, string>;

  constructor() {
    super(DB_NAME);

    // Schema definition for Version 1 (Phase 2-4 baseline)
    this.version(1).stores({
      users: "id, displayName, createdAt",
      routines: "id, slug, displayOrder",
      exercises: "id, routineId, displayOrder, [routineId+displayOrder]",
      workoutSessions:
        "id, userId, routineId, status, startedAt, [userId+status], [userId+startedAt]",
      sets: "id, userId, workoutSessionId, exerciseId, createdAt, [userId+exerciseId], [userId+workoutSessionId], [workoutSessionId+exerciseId], [userId+createdAt]",
      syncQueue:
        "id, userId, status, timestamp, [userId+status], [status+timestamp]",
      syncMeta: "key, userId",
    });

    // Schema definition for Version 2 (Phase 5 Workout System Overhaul)
    // Supports user-scoped routines, global/custom exercise catalog, and ordered routine exercises
    this.version(2).stores({
      users: "id, displayName, createdAt",
      routines: "id, userId, slug, displayOrder, [userId+displayOrder], updatedAt",
      exercises:
        "id, name, category, userId, routineId, displayOrder, [routineId+displayOrder], [userId+name], updatedAt",
      routineExercises:
        "id, routineId, exerciseId, displayOrder, [routineId+displayOrder], updatedAt",
      workoutSessions:
        "id, userId, routineId, status, startedAt, [userId+status], [userId+startedAt]",
      sets: "id, userId, workoutSessionId, exerciseId, createdAt, [userId+exerciseId], [userId+workoutSessionId], [workoutSessionId+exerciseId], [userId+createdAt]",
      syncQueue:
        "id, userId, status, timestamp, [userId+status], [status+timestamp]",
      syncMeta: "key, userId",
    });
  }
}

export const db = new SculpdDatabase();
