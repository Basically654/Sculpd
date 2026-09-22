// types/models.ts

export type AvatarColor = "emerald" | "amber" | "violet" | "cyan" | "rose" | "blue" | "fuchsia";

export interface User {
  id: string; // UUIDv4
  displayName: string;
  pinHash: string;
  pinSalt: string;
  avatarColor: AvatarColor;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  isDeleted?: boolean;
}

/**
 * Sanitized user type without sensitive cryptographic PIN fields.
 * Safe for passing to client UI components.
 */
export type SafeUser = Omit<User, "pinHash" | "pinSalt">;

export interface Routine {
  id: string; // UUIDv4
  slug: string; // e.g. "monday"
  dayName: string; // e.g. "Monday"
  focusTarget: string; // e.g. "Glute Focus (Upper & Side) + Calves"
  color: string; // Tailwind gradient or color token
  displayOrder: number;
  updatedAt: string; // ISO 8601
  isDeleted?: boolean;
}

export interface Exercise {
  id: string; // UUIDv4
  routineId: string; // Foreign key to Routine.id
  name: string;
  targetSets: number;
  targetReps: string;
  coachingCue: string | null;
  displayOrder: number;
  updatedAt: string; // ISO 8601
  isDeleted?: boolean;
}

export type WorkoutSessionStatus = "in_progress" | "completed" | "cancelled";

export interface WorkoutSession {
  id: string; // UUIDv4
  userId: string; // Foreign key to User.id
  routineId: string; // Foreign key to Routine.id
  startedAt: string; // ISO 8601
  completedAt: string | null; // ISO 8601 or null if active
  status: WorkoutSessionStatus;
  notes?: string | null;
  updatedAt: string; // ISO 8601
  isDeleted?: boolean;
}

export interface WorkoutSet {
  id: string; // UUIDv4
  userId: string; // Foreign key to User.id
  workoutSessionId: string; // Foreign key to WorkoutSession.id
  exerciseId: string; // Foreign key to Exercise.id
  setNumber: number;
  weight: number;
  reps: number;
  rpe: number | null;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  isDeleted?: boolean;
}

export type SyncOperation = "insert" | "update" | "delete";

export type SyncCollection =
  | "users"
  | "routines"
  | "exercises"
  | "workout_sessions"
  | "sets";

export type SyncStatus = "pending" | "syncing" | "failed";

export interface SyncQueueItem {
  id: string; // UUIDv4
  userId: string;
  operation: SyncOperation;
  collection: SyncCollection;
  entityId: string;
  payload: any;
  timestamp: number; // Date.now()
  status: SyncStatus;
  attempts: number;
  lastAttemptAt?: number | null;
  lastError?: string;
}

// Push payload for sync API
export interface SyncPushPayload {
  userId: string;
  items: SyncQueueItem[];
}

export interface SyncPushResult {
  success: boolean;
  syncedItemIds: string[];
  errors?: Array<{ itemId: string; error: string }>;
}

export interface SyncPullResult {
  users: User[];
  routines: Routine[];
  exercises: Exercise[];
  workoutSessions: WorkoutSession[];
  sets: WorkoutSet[];
  deletedIds?: Array<{ collection: SyncCollection; id: string }>;
  lastSyncTimestamp: number;
}

export interface SyncMeta {
  key: string; // e.g. "lastSync_usr_123"
  userId: string;
  lastSyncTimestamp: number;
  updatedAt: string;
}

