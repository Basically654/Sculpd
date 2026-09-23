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

export const CURRENT_DB_VERSION = 3;
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

    // Schema definition for Version 3 (WebKit / iOS Safari transaction resilience)
    // Drops unused compound indexes [routineId+displayOrder] and [userId+name] from exercises
    // which caused WebKit key extraction failures when userId is null or routineId is undefined.
    this.version(3).stores({
      exercises: "id, name, category, userId, routineId, displayOrder, updatedAt",
    });
  }
}

export const db = new SculpdDatabase();

// Re-establish connection on iOS Safari wake / tab resume
if (typeof window !== "undefined") {
  const reconnectOnWake = async () => {
    if (document.visibilityState === "visible") {
      try {
        if (!db.isOpen()) {
          await db.open();
        }
      } catch (err) {
        console.warn("[DB] Reconnecting on wake:", err);
        try {
          db.close();
          await db.open();
        } catch {}
      }
    }
  };

  document.addEventListener("visibilitychange", reconnectOnWake);
  window.addEventListener("pageshow", reconnectOnWake);
  window.addEventListener("focus", reconnectOnWake);
}
