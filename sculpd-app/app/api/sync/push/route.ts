// app/api/sync/push/route.ts
import { NextResponse } from "next/server";
import { extractVerifiedUserId } from "@/lib/auth/session-token";
import {
  ensureMongoIndexes,
  isMongoOfflineError,
  getUsersCollection,
  getRoutinesCollection,
  getExercisesCollection,
  getRoutineExercisesCollection,
  getWorkoutSessionsCollection,
  getSetsCollection,
} from "@/lib/mongodb";
import { SyncPushPayload, SyncPushResult } from "@/types/models";

export const dynamic = "force-dynamic";

/**
 * Parses and validates an ISO 8601 timestamp string or number into epoch milliseconds.
 * Returns null if the timestamp is missing, malformed, or invalid.
 */
function parseIsoTimestamp(ts: any): number | null {
  if (typeof ts !== "string" && typeof ts !== "number") return null;
  const parsed = new Date(ts).getTime();
  if (isNaN(parsed) || parsed <= 0) return null;
  return parsed;
}

/**
 * POST /api/sync/push
 * Receives pending local mutations from the client outbox and idempotently applies
 * them to MongoDB collections. Enforces strict server-side user authentication,
 * ownership isolation, and timestamp-aware stale update rejection.
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
    const staleItemIds: string[] = [];
    const errors: Array<{ itemId: string; error: string }> = [];
    const details: Array<{
      itemId: string;
      status: "accepted" | "stale" | "failed";
      reason?: string;
    }> = [];

    // Get collections
    const usersCol = await getUsersCollection();
    const routinesCol = await getRoutinesCollection();
    const routineExercisesCol = await getRoutineExercisesCollection();
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
          details.push({
            itemId: item.id,
            status: "failed",
            reason: `Cross-user mutation blocked`,
          });
          continue;
        }

        const now = new Date().toISOString();

        if (item.operation === "delete") {
          // Tombstone strategy: Mark isDeleted = true and update timestamp
          switch (item.collection) {
            case "sets": {
              const existing = await setsCol.findOne({ id: item.entityId });
              if (existing && existing.userId !== verifiedUserId) {
                throw new Error("Forbidden: Cannot delete record belonging to another user.");
              }
              await setsCol.updateOne(
                { id: item.entityId, userId: verifiedUserId },
                { $set: { isDeleted: true, updatedAt: now } }
              );
              break;
            }
            case "workout_sessions": {
              const existing = await sessionsCol.findOne({ id: item.entityId });
              if (existing && existing.userId !== verifiedUserId) {
                throw new Error("Forbidden: Cannot delete record belonging to another user.");
              }
              await sessionsCol.updateOne(
                { id: item.entityId, userId: verifiedUserId },
                { $set: { isDeleted: true, updatedAt: now } }
              );
              break;
            }
            case "users": {
              if (item.entityId !== verifiedUserId) {
                throw new Error("Forbidden: Cannot delete profile of another user.");
              }
              await usersCol.updateOne(
                { id: item.entityId },
                { $set: { isDeleted: true, updatedAt: now } }
              );
              break;
            }
            case "routines": {
              const existing = await routinesCol.findOne({ id: item.entityId });
              if (existing && existing.userId && existing.userId !== verifiedUserId) {
                throw new Error("Forbidden: Cannot delete record belonging to another user.");
              }
              await routinesCol.updateOne(
                { id: item.entityId, userId: verifiedUserId },
                { $set: { isDeleted: true, updatedAt: now } }
              );
              break;
            }
            case "routine_exercises": {
              const existing = await routineExercisesCol.findOne({ id: item.entityId });
              if (existing && existing.userId && existing.userId !== verifiedUserId) {
                throw new Error("Forbidden: Cannot delete record belonging to another user.");
              }
              await routineExercisesCol.updateOne(
                { id: item.entityId, userId: verifiedUserId },
                { $set: { isDeleted: true, updatedAt: now } }
              );
              break;
            }
            case "exercises": {
              const existing = await exercisesCol.findOne({ id: item.entityId });
              if (existing && existing.userId && existing.userId !== verifiedUserId) {
                throw new Error("Forbidden: Cannot delete record belonging to another user.");
              }
              await exercisesCol.updateOne(
                { id: item.entityId },
                { $set: { isDeleted: true, updatedAt: now } }
              );
              break;
            }
            default:
              throw new Error(`Unsupported delete collection: ${item.collection}`);
          }

          syncedItemIds.push(item.id);
          details.push({ itemId: item.id, status: "accepted" });
        } else {
          // Insert or Update: Timestamp validation and timestamp-aware stale check
          let incomingUpdatedAt: string;
          if (item.operation === "update") {
            const parsed = parseIsoTimestamp(item.payload?.updatedAt);
            if (parsed === null) {
              throw new Error("Invalid or missing updatedAt timestamp for update operation.");
            }
            incomingUpdatedAt = new Date(parsed).toISOString();
          } else {
            // Insert operation
            if (item.payload?.updatedAt) {
              const parsed = parseIsoTimestamp(item.payload.updatedAt);
              if (parsed === null) {
                throw new Error("Invalid updatedAt timestamp for insert operation.");
              }
              incomingUpdatedAt = new Date(parsed).toISOString();
            } else {
              incomingUpdatedAt = now;
            }
          }

          const payload = {
            ...item.payload,
            updatedAt: incomingUpdatedAt,
            isDeleted: false,
          };

          switch (item.collection) {
            case "workout_sessions": {
              payload.userId = verifiedUserId;
              const existing = await sessionsCol.findOne({ id: item.entityId });
              if (existing) {
                if (existing.userId !== verifiedUserId) {
                  throw new Error("Forbidden: Cannot mutate record belonging to another user.");
                }
                const existingTime = parseIsoTimestamp(existing.updatedAt);
                const incomingTime = parseIsoTimestamp(payload.updatedAt)!;
                if (existingTime !== null && incomingTime < existingTime) {
                  // Stale update: cloud version is newer
                  staleItemIds.push(item.id);
                  details.push({
                    itemId: item.id,
                    status: "stale",
                    reason: "Incoming update is older than stored cloud version.",
                  });
                  continue;
                }
                // Atomic conditional update
                const updateRes = await sessionsCol.updateOne(
                  {
                    id: item.entityId,
                    userId: verifiedUserId,
                    $or: [
                      { updatedAt: { $exists: false } },
                      { updatedAt: { $lte: payload.updatedAt } },
                    ],
                  },
                  { $set: payload }
                );
                if (updateRes.matchedCount === 0) {
                  staleItemIds.push(item.id);
                  details.push({
                    itemId: item.id,
                    status: "stale",
                    reason: "Superseded by concurrent cloud update.",
                  });
                  continue;
                }
              } else {
                await sessionsCol.updateOne(
                  { id: item.entityId, userId: verifiedUserId },
                  { $set: payload },
                  { upsert: true }
                );
              }
              syncedItemIds.push(item.id);
              details.push({ itemId: item.id, status: "accepted" });
              break;
            }

            case "routines": {
              payload.userId = verifiedUserId;
              const existing = await routinesCol.findOne({ id: item.entityId });
              if (existing) {
                if (existing.userId && existing.userId !== verifiedUserId) {
                  throw new Error("Forbidden: Cannot mutate record belonging to another user.");
                }
                const existingTime = parseIsoTimestamp(existing.updatedAt);
                const incomingTime = parseIsoTimestamp(payload.updatedAt)!;
                if (existingTime !== null && incomingTime < existingTime) {
                  staleItemIds.push(item.id);
                  details.push({
                    itemId: item.id,
                    status: "stale",
                    reason: "Incoming update is older than stored cloud version.",
                  });
                  continue;
                }
                const updateRes = await routinesCol.updateOne(
                  {
                    id: item.entityId,
                    userId: verifiedUserId,
                    $or: [
                      { updatedAt: { $exists: false } },
                      { updatedAt: { $lte: payload.updatedAt } },
                    ],
                  },
                  { $set: payload }
                );
                if (updateRes.matchedCount === 0) {
                  staleItemIds.push(item.id);
                  details.push({
                    itemId: item.id,
                    status: "stale",
                    reason: "Superseded by concurrent cloud update.",
                  });
                  continue;
                }
              } else {
                await routinesCol.updateOne(
                  { id: item.entityId, userId: verifiedUserId },
                  { $set: payload },
                  { upsert: true }
                );
              }
              syncedItemIds.push(item.id);
              details.push({ itemId: item.id, status: "accepted" });
              break;
            }

            case "routine_exercises": {
              payload.userId = verifiedUserId;
              const existing = await routineExercisesCol.findOne({ id: item.entityId });
              if (existing) {
                if (existing.userId && existing.userId !== verifiedUserId) {
                  throw new Error("Forbidden: Cannot mutate record belonging to another user.");
                }
                const existingTime = parseIsoTimestamp(existing.updatedAt);
                const incomingTime = parseIsoTimestamp(payload.updatedAt)!;
                if (existingTime !== null && incomingTime < existingTime) {
                  staleItemIds.push(item.id);
                  details.push({
                    itemId: item.id,
                    status: "stale",
                    reason: "Incoming update is older than stored cloud version.",
                  });
                  continue;
                }
                const updateRes = await routineExercisesCol.updateOne(
                  {
                    id: item.entityId,
                    userId: verifiedUserId,
                    $or: [
                      { updatedAt: { $exists: false } },
                      { updatedAt: { $lte: payload.updatedAt } },
                    ],
                  },
                  { $set: payload }
                );
                if (updateRes.matchedCount === 0) {
                  staleItemIds.push(item.id);
                  details.push({
                    itemId: item.id,
                    status: "stale",
                    reason: "Superseded by concurrent cloud update.",
                  });
                  continue;
                }
              } else {
                await routineExercisesCol.updateOne(
                  { id: item.entityId, userId: verifiedUserId },
                  { $set: payload },
                  { upsert: true }
                );
              }
              syncedItemIds.push(item.id);
              details.push({ itemId: item.id, status: "accepted" });
              break;
            }

            case "sets": {
              // Enforce ownership: sets are append-only/immutable workout records
              payload.userId = verifiedUserId;
              const existing = await setsCol.findOne({ id: item.entityId });
              if (existing && existing.userId !== verifiedUserId) {
                throw new Error("Forbidden: Cannot mutate record belonging to another user.");
              }
              await setsCol.updateOne(
                { id: item.entityId, userId: verifiedUserId },
                { $set: payload },
                { upsert: true }
              );
              syncedItemIds.push(item.id);
              details.push({ itemId: item.id, status: "accepted" });
              break;
            }

            case "exercises": {
              const existing = await exercisesCol.findOne({ id: item.entityId });
              if (existing && existing.userId && existing.userId !== verifiedUserId) {
                throw new Error("Forbidden: Cannot mutate record belonging to another user.");
              }
              await exercisesCol.updateOne(
                { id: item.entityId },
                { $set: payload },
                { upsert: true }
              );
              syncedItemIds.push(item.id);
              details.push({ itemId: item.id, status: "accepted" });
              break;
            }

            case "users": {
              if (item.entityId !== verifiedUserId) {
                throw new Error("Forbidden: Cannot mutate profile of another user.");
              }
              const existing = await usersCol.findOne({ id: item.entityId });
              if (existing) {
                const existingTime = parseIsoTimestamp(existing.updatedAt);
                const incomingTime = parseIsoTimestamp(payload.updatedAt)!;
                if (existingTime !== null && incomingTime < existingTime) {
                  staleItemIds.push(item.id);
                  details.push({
                    itemId: item.id,
                    status: "stale",
                    reason: "Incoming update is older than stored cloud version.",
                  });
                  continue;
                }
              }
              await usersCol.updateOne(
                { id: item.entityId },
                { $set: payload },
                { upsert: true }
              );
              syncedItemIds.push(item.id);
              details.push({ itemId: item.id, status: "accepted" });
              break;
            }

            default:
              throw new Error(`Unsupported sync collection: ${item.collection}`);
          }
        }
      } catch (itemErr: any) {
        errors.push({
          itemId: item.id,
          error: itemErr?.message || "Failed to process item.",
        });
        details.push({
          itemId: item.id,
          status: "failed",
          reason: itemErr?.message || "Failed to process item.",
        });
      }
    }

    const result: SyncPushResult = {
      success: errors.length === 0,
      syncedItemIds,
      staleItemIds: staleItemIds.length > 0 ? staleItemIds : undefined,
      errors: errors.length > 0 ? errors : undefined,
      details: details.length > 0 ? details : undefined,
    };

    return NextResponse.json(result);
  } catch (globalError: any) {
    if (isMongoOfflineError(globalError)) {
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
