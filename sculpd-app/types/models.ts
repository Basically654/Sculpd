// types/models.ts

export type AvatarColor = "emerald" | "amber" | "violet" | "cyan" | "rose" | "blue" | "fuchsia";

export type ExerciseLoadType = "weighted" | "bodyweight";

export interface User {
  id: string; // UUIDv4
  displayName: string;
  pinHash: string;
  pinSalt: string;
  avatarColor: AvatarColor;
  bodyweight?: number | null; // Profile bodyweight in lbs, e.g. 195
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  isDeleted?: boolean;
}

/**
 * Sanitized user type without sensitive cryptographic PIN fields.
 * Safe for passing to client UI components.
 */
export type SafeUser = Omit<User, "pinHash" | "pinSalt">;

/**
 * Exercise in the global/custom Exercise Library.
 */
export interface Exercise {
  id: string; // UUIDv4
  name: string;
  category?: string; // Muscle group: e.g. "Chest", "Back", "Legs", "Shoulders", "Arms", "Core"
  equipment?: string; // e.g. "Barbell", "Dumbbell", "Cable", "Machine", "Bodyweight"
  loadType?: ExerciseLoadType; // "weighted" | "bodyweight"
  userId?: string | null; // null for standard library, userId for custom user exercises
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  isDeleted?: boolean;

  // Legacy compatibility fields
  routineId?: string;
  targetSets?: number;
  targetReps?: string;
  coachingCue?: string | null;
  displayOrder?: number;
}

/**
 * Routine / Workout template created and organized by the user.
 */
export interface Routine {
  id: string; // UUIDv4
  userId: string; // Foreign key to User.id (user isolation)
  name: string; // e.g. "Push Day", "Lower Power"
  description?: string; // Optional notes or focus
  displayOrder: number;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  isDeleted?: boolean;

  // Legacy compatibility fields
  slug?: string;
  dayName?: string;
  focusTarget?: string;
  color?: string;
}

/**
 * Ordered exercise configuration within a routine.
 */
export interface RoutineExerciseConfig {
  id: string; // UUIDv4
  routineId: string; // Foreign key to Routine.id
  exerciseId: string; // Foreign key to Exercise.id
  displayOrder: number;
  targetSets: number;
  targetReps: string; // Rep target or rep range, e.g. "5-8" or "8-10"
  restSeconds: number; // Rest duration in seconds, e.g. 90
  loadType?: ExerciseLoadType; // "weighted" | "bodyweight"
  notes?: string; // Optional coaching cue or execution notes
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  isDeleted?: boolean;
}

/**
 * Routine populated with joined exercise library details.
 */
export interface RoutineWithExercises extends Routine {
  exercises: Array<RoutineExerciseConfig & { exercise: Exercise }>;
}

export type WorkoutSessionStatus = "in_progress" | "completed" | "cancelled";

/**
 * Immutable snapshot of an exercise configuration saved at workout start time.
 * Protects completed and in-progress workouts if the routine template is edited later.
 */
export interface WorkoutSessionExerciseSnapshot {
  exerciseId: string;
  name: string;
  displayOrder: number;
  targetSets: number;
  targetReps: string;
  restSeconds: number;
  loadType?: ExerciseLoadType;
  notes?: string;
}

export interface WorkoutSession {
  id: string; // UUIDv4
  userId: string; // Foreign key to User.id
  routineId: string; // Foreign key to Routine.id
  routineName?: string; // Snapshot of routine name at start time
  exerciseSnapshots?: WorkoutSessionExerciseSnapshot[]; // Snapshot of exercises at start time
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
  bodyweight?: number | null; // Captured user bodyweight at time of set (for bodyweight exercises)
  addedWeight?: number | null; // Additional load in lbs (e.g. 15 for BW+15, or 0)
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  isDeleted?: boolean;
}

export type SyncOperation = "insert" | "update" | "delete";

export type SyncCollection =
  | "users"
  | "routines"
  | "exercises"
  | "routine_exercises"
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
  routineExercises?: RoutineExerciseConfig[];
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

/**
 * Web Push Subscription persisted in MongoDB per user device.
 */
export interface PushSubscriptionRecord {
  id: string; // UUIDv4
  userId: string; // Foreign key to User.id
  endpoint: string; // Browser/APNs gateway endpoint URL
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export type RestNotificationStatus =
  | "scheduled"
  | "dispatched"
  | "cancelled"
  | "superseded";

/**
 * Scheduled rest notification record stored in MongoDB.
 */
export interface RestNotificationRecord {
  id: string; // timerId
  userId: string; // Foreign key to User.id
  workoutSessionId?: string;
  exerciseName?: string;
  nextSetNumber?: number;
  workoutUrl?: string;
  scheduledFor: number; // Target epoch ms
  qstashMessageId?: string;
  status: RestNotificationStatus;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}
