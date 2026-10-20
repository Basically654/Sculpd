// lib/mongodb.ts
import { MongoClient, Db, Collection } from "mongodb";
import {
  User,
  Routine,
  Exercise,
  RoutineExerciseConfig,
  WorkoutSession,
  WorkoutSet,
  PushSubscriptionRecord,
  RestNotificationRecord,
} from "@/types/models";

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

const dbName = process.env.MONGODB_DB_NAME || "sculpd";

// Circuit breaker state to fail fast when cloud database is offline
let lastConnectionFailureTime = 0;
let lastConnectionFailureError: any = null;
const CONNECTION_FAILURE_COOLDOWN_MS = 15000; // 15s cooldown

/**
 * Checks whether an error represents a MongoDB or TLS connectivity failure.
 */
export function isMongoOfflineError(error: any): boolean {
  if (!error) return false;
  return Boolean(
    error?.name?.includes("Mongo") ||
    error?.message?.includes("MONGODB_URI") ||
    error?.message?.includes("getaddrinfo") ||
    error?.message?.includes("timed out") ||
    error?.message?.includes("ECONNREFUSED") ||
    error?.message?.includes("buffering timed out") ||
    error?.message?.includes("SSL") ||
    error?.message?.includes("tlsv1 alert") ||
    error?.message?.includes("Cloud database is currently unreachable") ||
    error?.code === "ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR"
  );
}

/**
 * Returns a cached MongoClient promise.
 * Avoids throwing at module load time so Next.js static builds do not crash
 * if MONGODB_URI is not set in the build environment.
 */
export function getMongoClientPromise(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error(
      "Missing MONGODB_URI environment variable. Please configure it in your environment or .env.local file."
    );
  }

  // Fast-fail if we recently failed connecting to prevent stacking 5-10s timeouts
  const now = Date.now();
  if (
    now - lastConnectionFailureTime < CONNECTION_FAILURE_COOLDOWN_MS &&
    lastConnectionFailureError
  ) {
    return Promise.reject(lastConnectionFailureError);
  }

  // In Next.js serverless functions (e.g. Vercel), cache the client promise globally
  // so warm invocations reuse the MongoDB connection pool without socket exhaustion or TLS alerts.
  if (!global._mongoClientPromise) {
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });
    global._mongoClientPromise = client
      .connect()
      .then((connectedClient) => {
        // Clear failure state on success
        lastConnectionFailureTime = 0;
        lastConnectionFailureError = null;
        return connectedClient;
      })
      .catch((err) => {
        global._mongoClientPromise = undefined;
        lastConnectionFailureTime = Date.now();
        lastConnectionFailureError = err;
        throw err;
      });
  }
  return global._mongoClientPromise;
}

/**
 * Helper to retrieve the active MongoDB database instance.
 */
export async function getDatabase(): Promise<Db> {
  const client = await getMongoClientPromise();
  return client.db(dbName);
}

/**
 * Strongly-typed collection accessors
 */
export async function getUsersCollection(): Promise<Collection<User>> {
  const db = await getDatabase();
  return db.collection<User>("users");
}

export async function getRoutinesCollection(): Promise<Collection<Routine>> {
  const db = await getDatabase();
  return db.collection<Routine>("routines");
}

export async function getRoutineExercisesCollection(): Promise<Collection<RoutineExerciseConfig>> {
  const db = await getDatabase();
  return db.collection<RoutineExerciseConfig>("routine_exercises");
}

export async function getExercisesCollection(): Promise<Collection<Exercise>> {
  const db = await getDatabase();
  return db.collection<Exercise>("exercises");
}

export async function getWorkoutSessionsCollection(): Promise<Collection<WorkoutSession>> {
  const db = await getDatabase();
  return db.collection<WorkoutSession>("workout_sessions");
}

export async function getSetsCollection(): Promise<Collection<WorkoutSet>> {
  const db = await getDatabase();
  return db.collection<WorkoutSet>("sets");
}

export async function getPushSubscriptionsCollection(): Promise<Collection<PushSubscriptionRecord>> {
  const db = await getDatabase();
  return db.collection<PushSubscriptionRecord>("push_subscriptions");
}

export async function getRestNotificationsCollection(): Promise<Collection<RestNotificationRecord>> {
  const db = await getDatabase();
  return db.collection<RestNotificationRecord>("rest_notifications");
}

let indexesEnsured = false;

/**
 * Ensures required MongoDB indexes are created idempotently on startup.
 */
export async function ensureMongoIndexes(): Promise<void> {
  if (indexesEnsured) return;

  try {
    const users = await getUsersCollection();
    await users.createIndex({ id: 1 }, { unique: true });

    const routines = await getRoutinesCollection();
    await routines.createIndex({ id: 1 }, { unique: true });
    await routines.createIndex({ slug: 1 });

    const routineExercises = await getRoutineExercisesCollection();
    await routineExercises.createIndex({ id: 1 }, { unique: true });
    await routineExercises.createIndex({ userId: 1, routineId: 1, displayOrder: 1 });
    await routineExercises.createIndex({ userId: 1, updatedAt: 1 });

    const exercises = await getExercisesCollection();
    await exercises.createIndex({ id: 1 }, { unique: true });
    await exercises.createIndex({ routineId: 1 });

    const sessions = await getWorkoutSessionsCollection();
    await sessions.createIndex({ id: 1 }, { unique: true });
    await sessions.createIndex({ userId: 1, startedAt: -1 });
    await sessions.createIndex({ userId: 1, updatedAt: 1 });

    const sets = await getSetsCollection();
    await sets.createIndex({ id: 1 }, { unique: true });
    await sets.createIndex({ userId: 1, workoutSessionId: 1 });
    await sets.createIndex({ userId: 1, exerciseId: 1 });
    await sets.createIndex({ userId: 1, updatedAt: 1 });

    const pushSubscriptions = await getPushSubscriptionsCollection();
    await pushSubscriptions.createIndex({ id: 1 }, { unique: true });
    await pushSubscriptions.createIndex({ userId: 1 });
    await pushSubscriptions.createIndex({ endpoint: 1 }, { unique: true });

    const restNotifications = await getRestNotificationsCollection();
    await restNotifications.createIndex({ id: 1 }, { unique: true });
    await restNotifications.createIndex({ userId: 1, status: 1 });
    await restNotifications.createIndex({ scheduledFor: 1 });

    indexesEnsured = true;
  } catch (err) {
    if (isMongoOfflineError(err)) {
      throw err;
    }
    console.warn("MongoDB index creation warning:", err);
  }
}

