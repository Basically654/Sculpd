// lib/mongodb.ts
import { MongoClient, Db, Collection } from "mongodb";
import {
  User,
  Routine,
  Exercise,
  WorkoutSession,
  WorkoutSet,
} from "@/types/models";

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

const dbName = process.env.MONGODB_DB_NAME || "sculpd";

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

  if (process.env.NODE_ENV === "development") {
    // In development mode, use a global variable so the connection is preserved across HMR reloads
    if (!global._mongoClientPromise) {
      const client = new MongoClient(uri);
      global._mongoClientPromise = client.connect();
    }
    return global._mongoClientPromise;
  } else {
    // In production mode, avoid global variable pollution
    const client = new MongoClient(uri);
    return client.connect();
  }
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

    indexesEnsured = true;
  } catch (err) {
    console.warn("MongoDB index creation warning:", err);
  }
}

