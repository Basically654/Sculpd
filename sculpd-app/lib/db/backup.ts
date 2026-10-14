// lib/db/backup.ts
import { db, SculpdDatabase, CURRENT_DB_VERSION, DB_NAME } from "./index";
import {
  SafeUser,
  Routine,
  RoutineExerciseConfig,
  Exercise,
  WorkoutSession,
  WorkoutSet,
} from "@/types/models";
import { sanitizeUser } from "./user-repository";
import { hashPin } from "@/lib/crypto/pin";
import { ensureDbOpen } from "./transaction";

export const BACKUP_FORMAT_IDENTIFIER = "sculpd-backup";
export const BACKUP_FORMAT_VERSION = 1;
export const APP_VERSION = "0.1.0";
export const LAST_EXPORT_STORAGE_KEY = "sculpd_last_backup_export_time";
export const DEFAULT_RESTORE_PIN = "0000";

export interface BackupData {
  users: SafeUser[];
  routines: Routine[];
  routineExercises: RoutineExerciseConfig[];
  exercises: Exercise[];
  workoutSessions: WorkoutSession[];
  sets: WorkoutSet[];
  syncQueue?: any[];
  syncMeta?: any[];
}

export interface BackupMetadata {
  userCount: number;
  routineCount: number;
  routineExerciseCount: number;
  exerciseCount: number;
  workoutSessionCount: number;
  setCount: number;
}

export interface SculpdBackup {
  format: typeof BACKUP_FORMAT_IDENTIFIER;
  version: number;
  exportedAt: string;
  appVersion: string;
  dbVersion: number;
  dbName: string;
  data: BackupData;
  metadata: BackupMetadata;
}

export interface BackupValidationResult {
  valid: boolean;
  error?: string;
  backup?: SculpdBackup;
  summary?: {
    userCount: number;
    userNames: string[];
    routineCount: number;
    routineExerciseCount: number;
    exerciseCount: number;
    workoutSessionCount: number;
    setCount: number;
    exportedAt: string;
  };
}

export interface DatabaseStateReport {
  isPopulated: boolean;
  counts: {
    users: number;
    routines: number;
    routineExercises: number;
    exercises: number;
    workoutSessions: number;
    sets: number;
  };
}

export type RestoreStrategy = "replace" | "merge_skip_existing";

export interface RestoreOptions {
  strategy?: RestoreStrategy;
  activeUserId?: string | null;
}

export interface RestoreResult {
  success: boolean;
  strategy: RestoreStrategy;
  restored: {
    users: number;
    routines: number;
    routineExercises: number;
    exercises: number;
    workoutSessions: number;
    sets: number;
  };
  skipped?: {
    users: number;
    routines: number;
    routineExercises: number;
    exercises: number;
    workoutSessions: number;
    sets: number;
  };
}

/**
 * Safely infers or heals a routine name for legacy routines that only have dayName, focusTarget, or slug.
 * e.g., 'rtn_friday_lower_posterior' -> 'Friday - Full Lower Body (Posterior Chain) + Calves' or 'Friday Lower Posterior'
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
 * Creates an in-memory backup object containing all user data from Dexie.
 * Strictly read-only: does not modify or lock the live database.
 * Cryptographic PIN hashes, salts, and secrets are strictly stripped.
 * Stale outbox queue mutations are NOT exported.
 */
export async function createBackup(
  dbInstance: SculpdDatabase = db
): Promise<SculpdBackup> {
  if (dbInstance === db) {
    await ensureDbOpen();
  } else if (!dbInstance.isOpen()) {
    await dbInstance.open();
  }

  const [rawUsers, routines, routineExercises, exercises, workoutSessions, sets] =
    await Promise.all([
      dbInstance.users.toArray(),
      dbInstance.routines.toArray(),
      dbInstance.routineExercises.toArray(),
      dbInstance.exercises.toArray(),
      dbInstance.workoutSessions.toArray(),
      dbInstance.sets.toArray(),
    ]);

  // Strip credentials, PIN hashes, and salts
  const safeUsers: SafeUser[] = rawUsers.map((u) => sanitizeUser(u));

  // Heal routines with missing names or legacy fields
  const healedRoutines: Routine[] = routines.map((r) => ({
    ...r,
    name: inferRoutineName(r),
  }));

  // Heal exercises with missing names
  const healedExercises: Exercise[] = exercises.map((ex) => ({
    ...ex,
    name: inferExerciseName(ex),
  }));

  const metadata: BackupMetadata = {
    userCount: safeUsers.length,
    routineCount: healedRoutines.length,
    routineExerciseCount: routineExercises.length,
    exerciseCount: healedExercises.length,
    workoutSessionCount: workoutSessions.length,
    setCount: sets.length,
  };

  return {
    format: BACKUP_FORMAT_IDENTIFIER,
    version: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    dbVersion: CURRENT_DB_VERSION,
    dbName: DB_NAME,
    data: {
      users: safeUsers,
      routines: healedRoutines,
      routineExercises,
      exercises: healedExercises,
      workoutSessions,
      sets,
    },
    metadata,
  };
}

/**
 * Records the timestamp of a successful export in localStorage.
 */
export function recordLastBackupTime(
  timestamp: string = new Date().toISOString()
): void {
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      localStorage.setItem(LAST_EXPORT_STORAGE_KEY, timestamp);
    } catch (e) {
      console.warn("Could not save last backup export time to localStorage:", e);
    }
  }
}

/**
 * Retrieves the timestamp of the last export from localStorage.
 */
export function getLastBackupTime(): string | null {
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      return localStorage.getItem(LAST_EXPORT_STORAGE_KEY);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Generates a descriptive filename containing Sculp'd and the export date.
 * e.g. "sculpd-backup-2026-10-14.json"
 */
export function getBackupFilename(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  return `sculpd-backup-${year}-${month}-${day}-${hours}${minutes}.json`;
}

/**
 * Serializes the database backup into a formatted JSON string and records the export time.
 */
export async function exportBackupToJson(
  dbInstance: SculpdDatabase = db
): Promise<{ jsonString: string; filename: string }> {
  const backup = await createBackup(dbInstance);
  const jsonString = JSON.stringify(backup, null, 2);
  const filename = getBackupFilename(new Date(backup.exportedAt));
  recordLastBackupTime(backup.exportedAt);
  return { jsonString, filename };
}

/**
 * Initiates user download of the backup file.
 * Compatible with iOS Safari and iOS Home Screen PWA:
 * 1. Attempts Web Share API with File when supported (native iOS Share Sheet / Save to Files).
 * 2. Falls back to blob object URL anchor download.
 */
export async function triggerBackupDownload(
  dbInstance: SculpdDatabase = db
): Promise<{
  success: boolean;
  filename: string;
  method: "share" | "download" | "clipboard";
  error?: string;
  jsonString?: string;
}> {
  try {
    const { jsonString, filename } = await exportBackupToJson(dbInstance);

    // Platform handling: iOS Web Share API with file support
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.canShare === "function" &&
      typeof File !== "undefined"
    ) {
      try {
        const file = new File([jsonString], filename, {
          type: "application/json",
        });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: filename,
            text: "Sculp'd Training Database Backup",
          });
          return { success: true, filename, method: "share", jsonString };
        }
      } catch (shareErr: any) {
        if (shareErr.name === "AbortError") {
          // User tapped Cancel in the share sheet
          return {
            success: false,
            filename,
            method: "share",
            error: "Export cancelled by user.",
            jsonString,
          };
        }
        // Fall back to standard anchor download on any other error
        console.warn("Web Share API failed, falling back to download link:", shareErr);
      }
    }

    // Standard Anchor Download Fallback
    if (typeof window !== "undefined" && typeof document !== "undefined") {
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return { success: true, filename, method: "download", jsonString };
    }

    return { success: true, filename, method: "download", jsonString };
  } catch (err: any) {
    return {
      success: false,
      filename: "",
      method: "download",
      error: err?.message || "Failed to export backup.",
    };
  }
}

/**
 * Inspects the current target database to determine whether it is populated and count existing records.
 */
export async function checkDatabaseState(
  dbInstance: SculpdDatabase = db
): Promise<DatabaseStateReport> {
  if (dbInstance === db) {
    await ensureDbOpen();
  } else if (!dbInstance.isOpen()) {
    await dbInstance.open();
  }

  const [
    usersCount,
    routinesCount,
    routineExercisesCount,
    exercisesCount,
    workoutSessionsCount,
    setsCount,
  ] = await Promise.all([
    dbInstance.users.count(),
    dbInstance.routines.count(),
    dbInstance.routineExercises.count(),
    dbInstance.exercises.count(),
    dbInstance.workoutSessions.count(),
    dbInstance.sets.count(),
  ]);

  const isPopulated =
    usersCount > 0 ||
    routinesCount > 0 ||
    routineExercisesCount > 0 ||
    workoutSessionsCount > 0 ||
    setsCount > 0;

  return {
    isPopulated,
    counts: {
      users: usersCount,
      routines: routinesCount,
      routineExercises: routineExercisesCount,
      exercises: exercisesCount,
      workoutSessions: workoutSessionsCount,
      sets: setsCount,
    },
  };
}

/**
 * Parses and validates an uploaded backup file string or parsed object.
 * Strictly verifies schema, format identifier, format version, required stores,
 * record shapes, and relationship integrity.
 */
export function validateBackup(
  content: string | unknown
): BackupValidationResult {
  let parsed: any;
  if (typeof content === "string") {
    try {
      parsed = JSON.parse(content);
    } catch {
      return {
        valid: false,
        error: "Invalid JSON format: The selected file could not be parsed.",
      };
    }
  } else if (content && typeof content === "object") {
    parsed = content;
  } else {
    return {
      valid: false,
      error: "Invalid backup content: Expected a valid JSON string or object.",
    };
  }

  // 1. Format Identifier
  if (!parsed || parsed.format !== BACKUP_FORMAT_IDENTIFIER) {
    return {
      valid: false,
      error: `Unrecognized backup format. Expected format '${BACKUP_FORMAT_IDENTIFIER}'.`,
    };
  }

  // 2. Format Version
  if (
    typeof parsed.version !== "number" ||
    parsed.version > BACKUP_FORMAT_VERSION ||
    parsed.version < 1
  ) {
    return {
      valid: false,
      error: `Unsupported backup version (${parsed.version}). This version of Sculp'd supports version ${BACKUP_FORMAT_VERSION}.`,
    };
  }

  // 3. Required Stores in Data Payload
  if (!parsed.data || typeof parsed.data !== "object") {
    return {
      valid: false,
      error: "Malformed backup: Missing 'data' container.",
    };
  }

  const requiredStores: (keyof BackupData)[] = [
    "users",
    "routines",
    "routineExercises",
    "exercises",
    "workoutSessions",
    "sets",
  ];

  for (const store of requiredStores) {
    if (!Array.isArray(parsed.data[store])) {
      return {
        valid: false,
        error: `Malformed backup: Required store '${store}' is missing or is not an array.`,
      };
    }
  }

  const { users, routines, routineExercises, exercises, workoutSessions, sets } =
    parsed.data;

  // 4. Validate Users
  const userIds = new Set<string>();
  for (let i = 0; i < users.length; i++) {
    const u = users[i];
    if (!u || typeof u.id !== "string" || !u.id.trim()) {
      return {
        valid: false,
        error: `User at index ${i} is missing a valid 'id'.`,
      };
    }
    if (typeof u.displayName !== "string" || !u.displayName.trim()) {
      return {
        valid: false,
        error: `User '${u.id}' is missing a valid 'displayName'.`,
      };
    }
    userIds.add(u.id);
  }

  // 5. Validate & Heal Routines
  const routineIds = new Set<string>();
  const healedRoutines: Routine[] = [];
  for (let i = 0; i < routines.length; i++) {
    const r = routines[i];
    if (!r || typeof r.id !== "string" || !r.id.trim()) {
      return {
        valid: false,
        error: `Routine at index ${i} is missing a valid 'id'.`,
      };
    }
    const resolvedName = inferRoutineName(r);
    const resolvedUserId =
      (typeof r.userId === "string" && r.userId.trim()) ||
      (users.length > 0 && typeof users[0].id === "string" ? users[0].id : "legacy_default");

    routineIds.add(r.id);
    healedRoutines.push({
      ...r,
      name: resolvedName,
      userId: resolvedUserId,
      displayOrder: typeof r.displayOrder === "number" ? r.displayOrder : i + 1,
      createdAt: r.createdAt || new Date().toISOString(),
      updatedAt: r.updatedAt || new Date().toISOString(),
    });
  }

  // 6. Validate & Heal Exercises
  const exerciseIds = new Set<string>();
  const healedExercises: Exercise[] = [];
  for (let i = 0; i < exercises.length; i++) {
    const ex = exercises[i];
    if (!ex || typeof ex.id !== "string" || !ex.id.trim()) {
      return {
        valid: false,
        error: `Exercise at index ${i} is missing a valid 'id'.`,
      };
    }
    const resolvedName = inferExerciseName(ex);
    exerciseIds.add(ex.id);
    healedExercises.push({
      ...ex,
      name: resolvedName,
      createdAt: ex.createdAt || new Date().toISOString(),
      updatedAt: ex.updatedAt || new Date().toISOString(),
    });
  }

  for (let i = 0; i < routineExercises.length; i++) {
    const re = routineExercises[i];
    if (!re || typeof re.id !== "string" || !re.id.trim()) {
      return {
        valid: false,
        error: `RoutineExercise at index ${i} is missing a valid 'id'.`,
      };
    }
    if (typeof re.routineId !== "string" || !re.routineId.trim()) {
      return {
        valid: false,
        error: `RoutineExercise '${re.id}' is missing 'routineId'.`,
      };
    }
    if (typeof re.exerciseId !== "string" || !re.exerciseId.trim()) {
      return {
        valid: false,
        error: `RoutineExercise '${re.id}' is missing 'exerciseId'.`,
      };
    }
  }

  // 7. Validate Workout Sessions
  const sessionIds = new Set<string>();
  for (let i = 0; i < workoutSessions.length; i++) {
    const s = workoutSessions[i];
    if (!s || typeof s.id !== "string" || !s.id.trim()) {
      return {
        valid: false,
        error: `Workout session at index ${i} is missing a valid 'id'.`,
      };
    }
    if (typeof s.userId !== "string" || !s.userId.trim()) {
      return {
        valid: false,
        error: `Workout session '${s.id}' is missing 'userId'.`,
      };
    }
    if (typeof s.startedAt !== "string" || isNaN(Date.parse(s.startedAt))) {
      return {
        valid: false,
        error: `Workout session '${s.id}' has an invalid 'startedAt' timestamp.`,
      };
    }
    if (
      s.status !== "in_progress" &&
      s.status !== "completed" &&
      s.status !== "cancelled"
    ) {
      return {
        valid: false,
        error: `Workout session '${s.id}' has invalid status '${s.status}'.`,
      };
    }
    sessionIds.add(s.id);
  }

  // 8. Validate Sets
  for (let i = 0; i < sets.length; i++) {
    const set = sets[i];
    if (!set || typeof set.id !== "string" || !set.id.trim()) {
      return {
        valid: false,
        error: `Workout set at index ${i} is missing a valid 'id'.`,
      };
    }
    if (typeof set.workoutSessionId !== "string" || !set.workoutSessionId.trim()) {
      return {
        valid: false,
        error: `Workout set '${set.id}' is missing 'workoutSessionId'.`,
      };
    }
    if (typeof set.exerciseId !== "string" || !set.exerciseId.trim()) {
      return {
        valid: false,
        error: `Workout set '${set.id}' is missing 'exerciseId'.`,
      };
    }
    if (typeof set.setNumber !== "number" || set.setNumber < 1) {
      return {
        valid: false,
        error: `Workout set '${set.id}' has an invalid setNumber (${set.setNumber}).`,
      };
    }
    if (typeof set.weight !== "number" || isNaN(set.weight)) {
      return {
        valid: false,
        error: `Workout set '${set.id}' has an invalid weight.`,
      };
    }
    if (typeof set.reps !== "number" || isNaN(set.reps)) {
      return {
        valid: false,
        error: `Workout set '${set.id}' has an invalid reps value.`,
      };
    }
    // Foreign key integrity check: Set must belong to a session in the backup
    if (!sessionIds.has(set.workoutSessionId)) {
      return {
        valid: false,
        error: `Workout set '${set.id}' references session '${set.workoutSessionId}' which does not exist in the backup.`,
      };
    }
  }

  // Clean incoming users: strip any rogue credential fields if someone crafted the file
  const sanitizedUsers: SafeUser[] = users.map((u: any) => {
    const { pinHash: _ph, pinSalt: _ps, ...safe } = u;
    return safe as SafeUser;
  });

  const validBackup: SculpdBackup = {
    format: BACKUP_FORMAT_IDENTIFIER,
    version: parsed.version,
    exportedAt: parsed.exportedAt || new Date().toISOString(),
    appVersion: parsed.appVersion || APP_VERSION,
    dbVersion: parsed.dbVersion || CURRENT_DB_VERSION,
    dbName: parsed.dbName || DB_NAME,
    data: {
      users: sanitizedUsers,
      routines: healedRoutines,
      routineExercises,
      exercises: healedExercises,
      workoutSessions,
      sets,
    },
    metadata: {
      userCount: sanitizedUsers.length,
      routineCount: healedRoutines.length,
      routineExerciseCount: routineExercises.length,
      exerciseCount: healedExercises.length,
      workoutSessionCount: workoutSessions.length,
      setCount: sets.length,
    },
  };

  return {
    valid: true,
    backup: validBackup,
    summary: {
      userCount: sanitizedUsers.length,
      userNames: sanitizedUsers.map((u) => u.displayName),
      routineCount: healedRoutines.length,
      routineExerciseCount: routineExercises.length,
      exerciseCount: healedExercises.length,
      workoutSessionCount: workoutSessions.length,
      setCount: sets.length,
      exportedAt: validBackup.exportedAt,
    },
  };
}

/**
 * Restores a validated backup into the target database.
 * Atomically executed inside a Dexie readwrite transaction across all target tables.
 *
 * Conflict & Populated Database Policy:
 * - If target DB is populated and no strategy is provided: Throws an error to prevent silent data loss.
 * - 'replace': Clears existing user data stores atomically and restores backup.
 *   Retains existing PIN hashes for profiles matching local user IDs.
 * - 'merge_skip_existing': Only adds records whose IDs do not already exist locally.
 *   Preserves existing local records and avoids arbitrary Last-Write-Wins overwriting.
 *
 * Synchronization Metadata Policy:
 * - Stale outbox queue mutations (`syncQueue`) from the backup are NOT replayed.
 * - In 'replace' mode, old queue mutations are cleared and sync cursor (`syncMeta`) is reset
 *   so the device does not blindly replay stale outbox actions or corrupt remote state.
 */
export async function restoreBackup(
  backupInput: SculpdBackup | string,
  options: RestoreOptions = {},
  dbInstance: SculpdDatabase = db
): Promise<RestoreResult> {
  const validation = validateBackup(backupInput);
  if (!validation.valid || !validation.backup) {
    throw new Error(validation.error || "Backup validation failed.");
  }

  const backup = validation.backup;
  const dbState = await checkDatabaseState(dbInstance);

  if (dbState.isPopulated && !options.strategy) {
    throw new Error(
      "Database contains existing records. You must explicitly choose a restore strategy ('replace' or 'merge_skip_existing') to prevent silent data loss."
    );
  }

  const strategy: RestoreStrategy = options.strategy || "replace";

  if (dbInstance === db) {
    await ensureDbOpen();
  } else if (!dbInstance.isOpen()) {
    await dbInstance.open();
  }

  // Pre-generate default PIN hash outside the transaction to prevent microtask gaps in WebKit
  const defaultPinCrypto = await hashPin(DEFAULT_RESTORE_PIN);

  const result: RestoreResult = {
    success: false,
    strategy,
    restored: {
      users: 0,
      routines: 0,
      routineExercises: 0,
      exercises: 0,
      workoutSessions: 0,
      sets: 0,
    },
    skipped: {
      users: 0,
      routines: 0,
      routineExercises: 0,
      exercises: 0,
      workoutSessions: 0,
      sets: 0,
    },
  };

  // Atomic transaction covering all destination tables.
  // If anything throws, Dexie rolls back all tables automatically.
  await dbInstance.transaction(
    "rw",
    [
      dbInstance.users,
      dbInstance.routines,
      dbInstance.routineExercises,
      dbInstance.exercises,
      dbInstance.workoutSessions,
      dbInstance.sets,
      dbInstance.syncQueue,
      dbInstance.syncMeta,
    ],
    async () => {
      if (strategy === "replace") {
        // Collect existing PIN credentials so current athletes don't lose their PIN
        const existingUsers = await dbInstance.users.toArray();
        const existingPinMap = new Map<string, { pinHash: string; pinSalt: string }>();
        for (const u of existingUsers) {
          if (u.pinHash && u.pinSalt) {
            existingPinMap.set(u.id, { pinHash: u.pinHash, pinSalt: u.pinSalt });
          }
        }

        // Clear existing tables
        await Promise.all([
          dbInstance.users.clear(),
          dbInstance.routines.clear(),
          dbInstance.routineExercises.clear(),
          dbInstance.exercises.clear(),
          dbInstance.workoutSessions.clear(),
          dbInstance.sets.clear(),
          dbInstance.syncQueue.clear(), // Reset outbox: Stale mutations are never blindly replayed
          dbInstance.syncMeta.clear(),  // Reset sync cursor: Clean sync baseline
        ]);

        // Reconstruct user records with preserved or safe default PIN hashes
        const usersToInsert = backup.data.users.map((safeUser) => {
          const existingPin = existingPinMap.get(safeUser.id);
          return {
            ...safeUser,
            pinHash: existingPin ? existingPin.pinHash : defaultPinCrypto.pinHash,
            pinSalt: existingPin ? existingPin.pinSalt : defaultPinCrypto.pinSalt,
          };
        });

        // Insert restored records
        await Promise.all([
          dbInstance.users.bulkAdd(usersToInsert),
          dbInstance.routines.bulkAdd(backup.data.routines),
          dbInstance.routineExercises.bulkAdd(backup.data.routineExercises),
          dbInstance.exercises.bulkAdd(backup.data.exercises),
          dbInstance.workoutSessions.bulkAdd(backup.data.workoutSessions),
          dbInstance.sets.bulkAdd(backup.data.sets),
        ]);

        result.restored = {
          users: usersToInsert.length,
          routines: backup.data.routines.length,
          routineExercises: backup.data.routineExercises.length,
          exercises: backup.data.exercises.length,
          workoutSessions: backup.data.workoutSessions.length,
          sets: backup.data.sets.length,
        };
      } else {
        // strategy === "merge_skip_existing"
        // Collect existing primary keys across all tables
        const [
          existingUserKeys,
          existingRoutineKeys,
          existingRoutineExKeys,
          existingExerciseKeys,
          existingSessionKeys,
          existingSetKeys,
        ] = await Promise.all([
          dbInstance.users.toCollection().primaryKeys(),
          dbInstance.routines.toCollection().primaryKeys(),
          dbInstance.routineExercises.toCollection().primaryKeys(),
          dbInstance.exercises.toCollection().primaryKeys(),
          dbInstance.workoutSessions.toCollection().primaryKeys(),
          dbInstance.sets.toCollection().primaryKeys(),
        ]);

        const userKeySet = new Set(existingUserKeys as string[]);
        const routineKeySet = new Set(existingRoutineKeys as string[]);
        const routineExKeySet = new Set(existingRoutineExKeys as string[]);
        const exerciseKeySet = new Set(existingExerciseKeys as string[]);
        const sessionKeySet = new Set(existingSessionKeys as string[]);
        const setKeySet = new Set(existingSetKeys as string[]);

        // Filter out colliding records
        const newUsers = backup.data.users.filter((u) => !userKeySet.has(u.id));
        const newRoutines = backup.data.routines.filter((r) => !routineKeySet.has(r.id));
        const newRoutineEx = backup.data.routineExercises.filter(
          (re) => !routineExKeySet.has(re.id)
        );
        const newExercises = backup.data.exercises.filter((ex) => !exerciseKeySet.has(ex.id));
        const newSessions = backup.data.workoutSessions.filter((s) => !sessionKeySet.has(s.id));
        const newSets = backup.data.sets.filter((set) => !setKeySet.has(set.id));

        const usersToInsert = newUsers.map((safeUser) => ({
          ...safeUser,
          pinHash: defaultPinCrypto.pinHash,
          pinSalt: defaultPinCrypto.pinSalt,
        }));

        if (usersToInsert.length > 0) await dbInstance.users.bulkAdd(usersToInsert);
        if (newRoutines.length > 0) await dbInstance.routines.bulkAdd(newRoutines);
        if (newRoutineEx.length > 0) await dbInstance.routineExercises.bulkAdd(newRoutineEx);
        if (newExercises.length > 0) await dbInstance.exercises.bulkAdd(newExercises);
        if (newSessions.length > 0) await dbInstance.workoutSessions.bulkAdd(newSessions);
        if (newSets.length > 0) await dbInstance.sets.bulkAdd(newSets);

        result.restored = {
          users: usersToInsert.length,
          routines: newRoutines.length,
          routineExercises: newRoutineEx.length,
          exercises: newExercises.length,
          workoutSessions: newSessions.length,
          sets: newSets.length,
        };

        result.skipped = {
          users: backup.data.users.length - usersToInsert.length,
          routines: backup.data.routines.length - newRoutines.length,
          routineExercises: backup.data.routineExercises.length - newRoutineEx.length,
          exercises: backup.data.exercises.length - newExercises.length,
          workoutSessions: backup.data.workoutSessions.length - newSessions.length,
          sets: backup.data.sets.length - newSets.length,
        };
      }

      result.success = true;
    }
  );

  return result;
}
