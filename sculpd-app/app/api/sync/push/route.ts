// app/api/sync/push/route.ts
import { NextResponse } from "next/server";
import { extractVerifiedUserId } from "@/lib/auth/session-token";
import {
  ensureMongoIndexes,
  getUsersCollection,
  getRoutinesCollection,
  getExercisesCollection,
  getWorkoutSessionsCollection,
  getSetsCollection,
} from "@/lib/mongodb";
import { SyncPushPayload, SyncPushResult, SyncQueueItem } from "@/types/models";

export const dynamic = "force-dynamic";

/**
 * POST /api/sync/push
 * Receives pending local mutations from the client outbox and idempotently applies
 * them to MongoDB collections. Enforces strict server-side user authentication.
 */
export async function POST(request: Request) {
  try {
    // 1. Cryptographically verify authenticated userId
    const verifiedUserId = await extractVerifiedUserId(request);
    if (!verifiedUserId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Missing or invalid session token." },
        { status: 401 }
      );
    }

    // 2. Parse push payload
    const body: SyncPushPayload = await request.json();
    const { userId, items } = body;

    if (!userId || typeof userId !== "string") {
      return NextResponse.json(
        { success: false, error: "Bad Request: userId is required in payload." },
        { status: 400 }
      );
    }

    // Strict user authorization check: client-supplied userId must match verified token
    if (userId !== verifiedUserId) {
      return NextResponse.json(
        { success: false, error: "Forbidden: Payload userId does not match session token." },
        { status: 403 }
      );
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({
        success: true,
        syncedItemIds: [],
      } as SyncPushResult);
    }

    // Ensure database indexes exist
    await ensureMongoIndexes();

    const syncedItemIds: string[] = [];
    const errors: Array<{ itemId: string; error: string }> = [];

    // Get collections
    const usersCol = await getUsersCollection();
    const routinesCol = await getRoutinesCollection();
    const exercisesCol = await getExercisesCollection();
    const sessionsCol = await getWorkoutSessionsCollection();
    const setsCol = await getSetsCollection();

    // Process each outbox item idempotently
    for (const item of items) {
      try {
        // Enforce user isolation: User A cannot push mutations for User B
        if (item.userId !== verifiedUserId) {
          errors.push({
            itemId: item.id,
            error: `Forbidden: Item userId (${item.userId}) does not match authenticated user (${verifiedUserId}).`,
          });
          continue;
        }

        const now = new Date().toISOString();

        if (item.operation === "delete") {
          // Tombstone strategy: Mark isDeleted = true and update timestamp
          switch (item.collection) {
            case "sets":
              await setsCol.updateOne(
                { id: item.entityId, userId: verifiedUserId },
                { $set: { isDeleted: true, updatedAt: now } }
              );
              break;
            case "workout_sessions":
              await sessionsCol.updateOne(
                { id: item.entityId, userId: verifiedUserId },
                { $set: { isDeleted: true, updatedAt: now } }
              );
              break;
            case "users":
              await usersCol.updateOne(
                { id: item.entityId },
                { $set: { isDeleted: true, updatedAt: now } }
              );
              break;
            case "routines":
              await routinesCol.updateOne(
                { id: item.entityId },
                { $set: { isDeleted: true, updatedAt: now } }
              );
              break;
            case "exercises":
              await exercisesCol.updateOne(
                { id: item.entityId },
                { $set: { isDeleted: true, updatedAt: now } }
              );
              break;
            default:
              throw new Error(`Unsupported delete collection: ${item.collection}`);
          }
        } else {
          // Insert or Update: Idempotent upsert by stable entity UUID
          const payload = {
            ...item.payload,
            updatedAt: item.payload?.updatedAt || now,
            isDeleted: false,
          };

          switch (item.collection) {
            case "users":
              await usersCol.updateOne(
                { id: item.entityId },
                { $set: payload },
                { upsert: true }
              );
              break;
            case "workout_sessions":
              // Enforce ownership
              payload.userId = verifiedUserId;
              await sessionsCol.updateOne(
                { id: item.entityId, userId: verifiedUserId },
                { $set: payload },
                { upsert: true }
              );
              break;
            case "sets":
              // Enforce ownership
              payload.userId = verifiedUserId;
              await setsCol.updateOne(
                { id: item.entityId, userId: verifiedUserId },
                { $set: payload },
                { upsert: true }
              );
              break;
            case "routines":
              await routinesCol.updateOne(
                { id: item.entityId },
                { $set: payload },
                { upsert: true }
              );
              break;
            case "exercises":
              await exercisesCol.updateOne(
                { id: item.entityId },
                { $set: payload },
                { upsert: true }
              );
              break;
            default:
              throw new Error(`Unsupported sync collection: ${item.collection}`);
          }
        }

        syncedItemIds.push(item.id);
      } catch (itemErr: any) {
        errors.push({
          itemId: item.id,
          error: itemErr?.message || "Failed to process item.",
        });
      }
    }

    const result: SyncPushResult = {
      success: errors.length === 0,
      syncedItemIds,
      errors: errors.length > 0 ? errors : undefined,
    };

    return NextResponse.json(result);
  } catch (globalError: any) {
    const isMongoOffline =
      globalError?.name?.includes("Mongo") ||
      globalError?.message?.includes("MONGODB_URI") ||
      globalError?.message?.includes("getaddrinfo") ||
      globalError?.message?.includes("timed out") ||
      globalError?.message?.includes("ECONNREFUSED") ||
      globalError?.message?.includes("buffering timed out");

    if (isMongoOffline) {
      console.warn("Sync push offline: Cloud database is unreachable:", globalError?.message || globalError);
      return NextResponse.json(
        { success: false, error: "Cloud database offline or unreachable." },
        { status: 503 }
      );
    }

    console.error("Sync push endpoint error:", globalError);
    return NextResponse.json(
      { success: false, error: globalError?.message || "Internal server error." },
      { status: 500 }
    );
  }
}
