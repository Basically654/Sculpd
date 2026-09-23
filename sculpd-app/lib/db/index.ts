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

export const CURRENT_DB_VERSION = 1;
export const DB_NAME = "sculpd_v3_db";

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

    // Version 1 of sculpd_v3_db:
    // Clean schema tailored for WebKit / iOS Safari with single-field indexes
    // (avoiding compound indexes on exercises where keys can be null/undefined)
    this.version(1).stores({
      users: "id, displayName, createdAt",
      routines: "id, userId, slug, displayOrder, [userId+displayOrder], updatedAt",
      exercises: "id, name, category, userId, routineId, displayOrder, updatedAt",
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

/**
 * Safely migrates user profiles and workout data from legacy sculpd_v2_db to sculpd_v3_db.
 * Wrapped in strict try...catch to ensure that if sculpd_v2_db is corrupted or locked by WebKit on disk,
 * the error is silently caught and sculpd_v3_db proceeds unblocked.
 */
const MIGRATION_KEY = "sculpd_v2_to_v3_migrated";

export async function migrateV2ToV3IfNeeded(): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    if (localStorage.getItem(MIGRATION_KEY) === "true") {
      return;
    }

    // Check if indexedDB exists in the browser
    if (!window.indexedDB) {
      return;
    }

    // If indexedDB.databases is supported, check if sculpd_v2_db actually exists
    if (window.indexedDB.databases) {
      const dbs = await window.indexedDB.databases().catch(() => []);
      const hasV2 = dbs.some((d) => d.name === "sculpd_v2_db");
      if (!hasV2) {
        localStorage.setItem(MIGRATION_KEY, "true");
        return;
      }
    }

    // Check if sculpd_v3_db already has users; if so, skip migration
    const currentUsers = await db.users.count().catch(() => 0);
    if (currentUsers > 0) {
      localStorage.setItem(MIGRATION_KEY, "true");
      return;
    }

    // Attempt to open legacy sculpd_v2_db read-only to copy data
    const oldDb = new Dexie("sculpd_v2_db");
    oldDb.version(3).stores({
      users: "id, displayName, createdAt",
      routines: "id, userId, slug, displayOrder, [userId+displayOrder], updatedAt",
      exercises: "id, name, category, userId, routineId, displayOrder, updatedAt",
      routineExercises:
        "id, routineId, exerciseId, displayOrder, [routineId+displayOrder], updatedAt",
      workoutSessions:
        "id, userId, routineId, status, startedAt, [userId+status], [userId+startedAt]",
      sets: "id, userId, workoutSessionId, exerciseId, createdAt, [userId+exerciseId], [userId+workoutSessionId], [workoutSessionId+exerciseId], [userId+createdAt]",
      syncQueue:
        "id, userId, status, timestamp, [userId+status], [status+timestamp]",
      syncMeta: "key, userId",
    });

    await oldDb.open();

    const [
      oldUsers,
      oldRoutines,
      oldRoutineExercises,
      oldWorkoutSessions,
      oldSets,
      oldSyncQueue,
      oldSyncMeta,
    ] = await Promise.all([
      oldDb.table("users").toArray().catch(() => []),
      oldDb.table("routines").toArray().catch(() => []),
      oldDb.table("routineExercises").toArray().catch(() => []),
      oldDb.table("workoutSessions").toArray().catch(() => []),
      oldDb.table("sets").toArray().catch(() => []),
      oldDb.table("syncQueue").toArray().catch(() => []),
      oldDb.table("syncMeta").toArray().catch(() => []),
    ]);

    if (oldUsers && oldUsers.length > 0) {
      await Promise.all([
        db.users.bulkPut(oldUsers).catch(() => {}),
        db.routines.bulkPut(oldRoutines).catch(() => {}),
        db.routineExercises.bulkPut(oldRoutineExercises).catch(() => {}),
        db.workoutSessions.bulkPut(oldWorkoutSessions).catch(() => {}),
        db.sets.bulkPut(oldSets).catch(() => {}),
        db.syncQueue.bulkPut(oldSyncQueue).catch(() => {}),
        db.syncMeta.bulkPut(oldSyncMeta).catch(() => {}),
      ]);
    }

    try {
      oldDb.close();
    } catch {}

    localStorage.setItem(MIGRATION_KEY, "true");
  } catch (err) {
    // If opening or reading legacy database fails (e.g. locked/corrupted file on iOS),
    // mark migration as finished so we never re-attempt or lock WebKit again.
    console.warn("[DB Migration] v2 to v3 migration safely bypassed:", err);
    try {
      localStorage.setItem(MIGRATION_KEY, "true");
    } catch {}
  }
}

// Re-establish connection on iOS Safari wake / tab resume if needed.
// NEVER listen to "focus" on window as that triggers on every input tap and keyboard display on iOS.
// NEVER call db.close() as closing an active SQLite backing store causes SQLITE_CANTOPEN on WebKit.
if (typeof window !== "undefined") {
  const reconnectOnWake = async () => {
    if (document.visibilityState === "visible") {
      try {
        if (!db.isOpen()) {
          await db.open();
        }
      } catch (err) {
        console.warn("[DB] Re-opening on wake:", err);
      }
    }
  };

  document.addEventListener("visibilitychange", reconnectOnWake);
  window.addEventListener("pageshow", reconnectOnWake);
}
