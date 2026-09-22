// lib/db/index.ts
import Dexie, { type Table } from "dexie";
import {
  User,
  Routine,
  Exercise,
  WorkoutSession,
  WorkoutSet,
  SyncQueueItem,
  SyncMeta,
} from "@/types/models";

export const CURRENT_DB_VERSION = 1;
export const DB_NAME = "sculpd_v2_db";

export class SculpdDatabase extends Dexie {
  users!: Table<User, string>;
  routines!: Table<Routine, string>;
  exercises!: Table<Exercise, string>;
  workoutSessions!: Table<WorkoutSession, string>;
  sets!: Table<WorkoutSet, string>;
  syncQueue!: Table<SyncQueueItem, string>;
  syncMeta!: Table<SyncMeta, string>;

  constructor() {
    super(DB_NAME);

    // Schema definition for Version 1
    // Indexes are optimized for user-scoped queries and workout session lookups
    this.version(CURRENT_DB_VERSION).stores({
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
  }
}

export const db = new SculpdDatabase();
