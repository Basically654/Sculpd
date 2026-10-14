// app/api/sync/pull/route.ts
import { NextResponse } from "next/server";
import { extractVerifiedUserId } from "@/lib/auth/session-token";
import {
  ensureMongoIndexes,
  getUsersCollection,
  getRoutinesCollection,
  getExercisesCollection,
  getRoutineExercisesCollection,
  getWorkoutSessionsCollection,
  getSetsCollection,
} from "@/lib/mongodb";
import { SyncPullResult, SyncCollection } from "@/types/models";

export const dynamic = "force-dynamic";

/**
 * GET /api/sync/pull?since=<timestamp>
 * Returns delta updates from MongoDB changed after the watermark timestamp.
 * Strictly scoped to the authenticated user.
 */
export async function GET(request: Request) {
  try {
    // 1. Cryptographically verify authenticated userId
    const verifiedUserId = await extractVerifiedUserId(request);
    if (!verifiedUserId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Missing or invalid session token." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const sinceParam = searchParams.get("since");
    const sinceTimestamp = sinceParam ? parseInt(sinceParam, 10) : 0;
    const sinceIso = new Date(isNaN(sinceTimestamp) ? 0 : sinceTimestamp).toISOString();

    await ensureMongoIndexes();

    const usersCol = await getUsersCollection();
    const routinesCol = await getRoutinesCollection();
    const routineExercisesCol = await getRoutineExercisesCollection();
    const exercisesCol = await getExercisesCollection();
    const sessionsCol = await getWorkoutSessionsCollection();
    const setsCol = await getSetsCollection();

    const deletedIds: Array<{ collection: SyncCollection; id: string }> = [];

    // 2. Fetch Users (Sanitized: omit pinHash and pinSalt)
    const rawUsers = await usersCol
      .find({
        id: verifiedUserId,
        updatedAt: { $gt: sinceIso },
      })
      .toArray();

    const users: any[] = [];
    for (const u of rawUsers) {
      if (u.isDeleted) {
        deletedIds.push({ collection: "users", id: u.id });
      } else {
        const { _id, pinHash, pinSalt, ...safeUser } = u as any;
        users.push(safeUser);
      }
    }

    // 3. Fetch Workout Sessions (STRICTLY SCOPED TO verifiedUserId)
    const rawSessions = await sessionsCol
      .find({
        userId: verifiedUserId,
        updatedAt: { $gt: sinceIso },
      })
      .toArray();

    const workoutSessions: any[] = [];
    for (const s of rawSessions) {
      if (s.isDeleted) {
        deletedIds.push({ collection: "workout_sessions", id: s.id });
      } else {
        const { _id, ...cleanSession } = s as any;
        workoutSessions.push(cleanSession);
      }
    }

    // 4. Fetch Sets (STRICTLY SCOPED TO verifiedUserId)
    const rawSets = await setsCol
      .find({
        userId: verifiedUserId,
        updatedAt: { $gt: sinceIso },
      })
      .toArray();

    const sets: any[] = [];
    for (const set of rawSets) {
      if (set.isDeleted) {
        deletedIds.push({ collection: "sets", id: set.id });
      } else {
        const { _id, ...cleanSet } = set as any;
        sets.push(cleanSet);
      }
    }

    // 5. Fetch Routines (User's own routines or shared catalog)
    const rawRoutines = await routinesCol
      .find({
        $or: [
          { userId: verifiedUserId },
          { userId: "legacy_default" },
          { userId: { $exists: false } },
        ],
        updatedAt: { $gt: sinceIso },
      })
      .toArray();

    const routines: any[] = [];
    for (const r of rawRoutines) {
      if (r.isDeleted) {
        deletedIds.push({ collection: "routines", id: r.id });
      } else {
        const { _id, ...cleanRoutine } = r as any;
        routines.push(cleanRoutine);
      }
    }

    // 6. Fetch Routine Exercises (User's own configurations or shared catalog)
    const rawRoutineExercises = await routineExercisesCol
      .find({
        $or: [
          { userId: verifiedUserId },
          { userId: "legacy_default" },
          { userId: { $exists: false } },
        ],
        updatedAt: { $gt: sinceIso },
      })
      .toArray();

    const routineExercises: any[] = [];
    for (const re of rawRoutineExercises) {
      if (re.isDeleted) {
        deletedIds.push({ collection: "routine_exercises", id: re.id });
      } else {
        const { _id, ...cleanRe } = re as any;
        routineExercises.push(cleanRe);
      }
    }

    // 7. Fetch Shared Exercise Library
    const rawExercises = await exercisesCol
      .find({
        $or: [
          { userId: verifiedUserId },
          { userId: null },
          { userId: { $exists: false } },
        ],
        updatedAt: { $gt: sinceIso },
      })
      .toArray();

    const exercises: any[] = [];
    for (const e of rawExercises) {
      if (e.isDeleted) {
        deletedIds.push({ collection: "exercises", id: e.id });
      } else {
        const { _id, ...cleanExercise } = e as any;
        exercises.push(cleanExercise);
      }
    }

    const result: SyncPullResult = {
      users,
      routines,
      exercises,
      routineExercises,
      workoutSessions,
      sets,
      deletedIds: deletedIds.length > 0 ? deletedIds : undefined,
      lastSyncTimestamp: Date.now(),
    };

    return NextResponse.json(result);
  } catch (error: any) {
    const isMongoOffline =
      error?.name?.includes("Mongo") ||
      error?.message?.includes("MONGODB_URI") ||
      error?.message?.includes("getaddrinfo") ||
      error?.message?.includes("timed out") ||
      error?.message?.includes("ECONNREFUSED") ||
      error?.message?.includes("buffering timed out");

    if (isMongoOffline) {
      console.warn("Sync pull offline: Cloud database is unreachable:", error?.message || error);
      return NextResponse.json(
        { success: false, error: "Cloud database offline or unreachable." },
        { status: 503 }
      );
    }

    console.error("Sync pull endpoint error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Internal server error." },
      { status: 500 }
    );
  }
}
