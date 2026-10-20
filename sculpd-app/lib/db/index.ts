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
  WorkoutSkip,
  FitnessAlternative,
} from "@/types/models";

export const CURRENT_DB_VERSION = 2;
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
  skips!: Table<WorkoutSkip, string>;
  fitnessAlternatives!: Table<FitnessAlternative, string>;

  constructor(databaseName: string = DB_NAME) {
    super(databaseName);

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

    // Version 2: Monthly Accountability & Skips System
    this.version(2).stores({
      skips: "id, userId, dateKey, monthKey, [userId+dateKey], [userId+monthKey], createdAt",
      fitnessAlternatives: "id, userId, dateKey, activityType, [userId+dateKey], createdAt",
    });
  }
}

export const db = new SculpdDatabase();

/**
 * Safely migrates user profiles and workout data from legacy sculpd_v2_db to sculpd_v3_db.
 * Wrapped in strict try...catch to ensure that if sculpd_v2_db is corrupted or locked by WebKit on disk,
 * the error is silently caught and sculpd_v3_db proceeds unblocked.
 */
export interface RecoveryResult {
  success: boolean;
  sourceDb?: string;
  recoveredUsers: number;
  recoveredSessions: number;
  recoveredSets: number;
  recoveredRoutines: number;
  message: string;
}

const MIGRATION_KEY = "sculpd_v2_to_v3_migrated";

/**
 * Actively scans candidate legacy Dexie/IndexedDB database names and dynamically copies
 * any existing records into the active sculpd_v3_db.
 * Safe to run multiple times: uses bulkPut which merges/updates records by ID without duplicates.
 */
export async function recoverLegacyData(): Promise<RecoveryResult> {
  if (typeof window === "undefined" || !window.indexedDB) {
    return {
      success: false,
      recoveredUsers: 0,
      recoveredSessions: 0,
      recoveredSets: 0,
      recoveredRoutines: 0,
      message: "IndexedDB is not available in the current environment.",
    };
  }

  // Candidate legacy database names in priority order
  const candidateNames = ["sculpd_v2_db", "sculpd_db", "sculpd", "sculpd_v1_db"];

  // If indexedDB.databases is available, include any custom sculpd databases found
  if (window.indexedDB.databases) {
    try {
      const dbs = await window.indexedDB.databases();
      for (const d of dbs) {
        if (d.name && d.name !== DB_NAME && !candidateNames.includes(d.name)) {
          candidateNames.push(d.name);
        }
      }
    } catch {}
  }

  let totalUsers = 0;
  let totalSessions = 0;
  let totalSets = 0;
  let totalRoutines = 0;
  let detectedSourceDb: string | undefined = undefined;

  // Ensure current database is open
  if (!db.isOpen()) {
    await db.open().catch(() => {});
  }

  const v3TableNames = db.tables.map((t) => t.name);

  for (const candidateName of candidateNames) {
    try {
      // Dynamically open candidate database without declaring version/stores
      // (Dexie dynamically inspects whatever object stores actually exist on disk)
      const legacy = new Dexie(candidateName);
      await legacy.open();

      const legacyTableNames = legacy.tables.map((t) => t.name);
      if (!legacyTableNames || legacyTableNames.length === 0) {
        try { legacy.close(); } catch {}
        continue;
      }

      let foundDataInThisDb = false;

      for (const tableName of legacyTableNames) {
        if (!v3TableNames.includes(tableName)) continue;

        const records = await legacy.table(tableName).toArray().catch(() => []);
        if (records && records.length > 0) {
          foundDataInThisDb = true;
          await db.table(tableName).bulkPut(records).catch(() => {});

          if (tableName === "users") totalUsers += records.length;
          else if (tableName === "workoutSessions") totalSessions += records.length;
          else if (tableName === "sets") totalSets += records.length;
          else if (tableName === "routines") totalRoutines += records.length;
        }
      }

      if (foundDataInThisDb && !detectedSourceDb) {
        detectedSourceDb = candidateName;
      }

      try {
        legacy.close();
      } catch {}
    } catch {
      // NoSuchDatabaseError or locked database - safely proceed to next candidate
      continue;
    }
  }

  // Mark migration as completed in localStorage
  try {
    localStorage.setItem(MIGRATION_KEY, "true");
  } catch {}

  const hasRecoveredAny = totalUsers > 0 || totalSessions > 0 || totalSets > 0;

  // If users were recovered and no active user ID is set in localStorage, auto-restore
  if (totalUsers > 0 && typeof window !== "undefined") {
    const existingActiveId = localStorage.getItem("sculpd_active_user_id");
    if (!existingActiveId) {
      const firstUser = await db.users.orderBy("createdAt").first().catch(() => undefined);
      if (firstUser) {
        localStorage.setItem("sculpd_active_user_id", firstUser.id);
      }
    }
  }

  return {
    success: hasRecoveredAny,
    sourceDb: detectedSourceDb,
    recoveredUsers: totalUsers,
    recoveredSessions: totalSessions,
    recoveredSets: totalSets,
    recoveredRoutines: totalRoutines,
    message: hasRecoveredAny
      ? `Successfully recovered data from ${detectedSourceDb || "previous database"}: ${totalUsers} profile(s), ${totalSessions} workout session(s), and ${totalSets} logged set(s).`
      : "No previous database records found on this device/domain.",
  };
}

/**
 * Safely migrates user profiles and workout data from legacy databases to sculpd_v3_db.
 * Wrapped in strict try...catch to ensure sculpd_v3_db proceeds unblocked.
 */
export async function migrateV2ToV3IfNeeded(): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    // If sculpd_v3_db already has users, migration is definitely done.
    const currentUsers = await db.users.count().catch(() => 0);
    if (currentUsers > 0) {
      return;
    }

    // If sculpd_v3_db currently has 0 users, run legacy recovery regardless
    // of MIGRATION_KEY to heal devices where WebKit prematurely marked migration
    await recoverLegacyData();
  } catch (err) {
    console.warn("[DB Migration] v2 to v3 migration safely bypassed:", err);
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
