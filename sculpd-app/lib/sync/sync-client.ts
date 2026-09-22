// lib/sync/sync-client.ts
import { db } from "@/lib/db";
import {
  SyncQueueItem,
  SyncPushPayload,
  SyncPushResult,
  SyncPullResult,
} from "@/types/models";

export type SyncState = "synced" | "syncing" | "pending" | "offline";

/**
 * Calculates exponential backoff delay in milliseconds.
 * 1s, 2s, 4s, 8s, 16s, max 60s
 */
export function getBackoffDelay(attempts: number): number {
  return Math.min(1000 * Math.pow(2, attempts), 60000);
}

/**
 * Pushes pending outbox mutations from IndexedDB to the cloud API.
 * Never modifies or rolls back local workout data on failure.
 */
export async function pushPendingMutations(
  userId: string,
  sessionToken: string
): Promise<{ success: boolean; pushedCount: number; error?: string }> {
  if (!userId || !sessionToken) {
    return { success: false, pushedCount: 0, error: "Missing authentication" };
  }

  // Find all pending or failed items for this user
  const allUserItems = await db.syncQueue
    .where("userId")
    .equals(userId)
    .sortBy("timestamp");

  if (allUserItems.length === 0) {
    return { success: true, pushedCount: 0 };
  }

  const now = Date.now();
  // Filter items that are ready for retry based on backoff
  const readyItems = allUserItems.filter((item) => {
    if (item.status === "pending") return true;
    if (item.status === "failed") {
      const delay = getBackoffDelay(item.attempts);
      return now - (item.lastAttemptAt || 0) >= delay;
    }
    return false;
  });

  if (readyItems.length === 0) {
    return { success: true, pushedCount: 0 };
  }

  // Mark items as syncing locally
  const readyIds = readyItems.map((i) => i.id);
  await db.syncQueue
    .where("id")
    .anyOf(readyIds)
    .modify({ status: "syncing", lastAttemptAt: now });

  try {
    const payload: SyncPushPayload = {
      userId,
      items: readyItems,
    };

    const res = await fetch("/api/sync/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Push failed with status ${res.status}: ${errorText}`);
    }

    const result: SyncPushResult = await res.json();

    if (result.syncedItemIds && result.syncedItemIds.length > 0) {
      // Safely remove successfully synced items from outbox
      await db.syncQueue.where("id").anyOf(result.syncedItemIds).delete();
    }

    // Update failed items with incremented attempt count and error message
    if (result.errors && result.errors.length > 0) {
      for (const err of result.errors) {
        const item = await db.syncQueue.get(err.itemId);
        if (item) {
          await db.syncQueue.update(item.id, {
            status: "failed",
            attempts: item.attempts + 1,
            lastAttemptAt: Date.now(),
            lastError: err.error,
          });
        }
      }
    }

    return {
      success: result.success,
      pushedCount: result.syncedItemIds?.length || 0,
    };
  } catch (err: any) {
    // Network or server error: retain all items in queue for future retry
    for (const item of readyItems) {
      await db.syncQueue.update(item.id, {
        status: "failed",
        attempts: item.attempts + 1,
        lastAttemptAt: Date.now(),
        lastError: err?.message || "Network request failed",
      });
    }

    return { success: false, pushedCount: 0, error: err?.message };
  }
}

/**
 * Pulls delta updates from the cloud API and merges into IndexedDB using
 * Last-Write-Wins (LWW) conflict resolution and tombstone removal.
 */
export async function pullRemoteUpdates(
  userId: string,
  sessionToken: string
): Promise<{ success: boolean; pulledCount: number; error?: string }> {
  if (!userId || !sessionToken) {
    return { success: false, pulledCount: 0, error: "Missing authentication" };
  }

  try {
    const metaKey = `lastSync_${userId}`;
    const meta = await db.syncMeta.get(metaKey);
    const sinceTimestamp = meta?.lastSyncTimestamp || 0;

    const res = await fetch(`/api/sync/pull?since=${sinceTimestamp}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
    });

    if (!res.ok) {
      throw new Error(`Pull failed with status ${res.status}`);
    }

    const data: SyncPullResult = await res.json();
    let pulledCount = 0;

    // Apply tombstones: Remove deleted items locally so they do not resurrect
    if (data.deletedIds && data.deletedIds.length > 0) {
      for (const del of data.deletedIds) {
        if (del.collection === "sets") {
          await db.sets.delete(del.id);
        } else if (del.collection === "workout_sessions") {
          await db.workoutSessions.delete(del.id);
        } else if (del.collection === "users") {
          await db.users.delete(del.id);
        }
      }
    }

    // Merge shared catalog: routines & exercises
    if (data.routines && data.routines.length > 0) {
      await db.routines.bulkPut(data.routines);
      pulledCount += data.routines.length;
    }
    if (data.exercises && data.exercises.length > 0) {
      await db.exercises.bulkPut(data.exercises);
      pulledCount += data.exercises.length;
    }

    // Merge user workout sessions using Last-Write-Wins timestamp comparison
    if (data.workoutSessions && data.workoutSessions.length > 0) {
      for (const session of data.workoutSessions) {
        const local = await db.workoutSessions.get(session.id);
        if (!local || new Date(session.updatedAt) >= new Date(local.updatedAt)) {
          await db.workoutSessions.put(session);
          pulledCount++;
        }
      }
    }

    // Merge user workout sets (append-only / immutable once logged)
    if (data.sets && data.sets.length > 0) {
      for (const set of data.sets) {
        const local = await db.sets.get(set.id);
        if (!local || new Date(set.updatedAt) >= new Date(local.updatedAt)) {
          await db.sets.put(set);
          pulledCount++;
        }
      }
    }

    // Advance watermark ONLY after successful merge
    await db.syncMeta.put({
      key: metaKey,
      userId,
      lastSyncTimestamp: data.lastSyncTimestamp,
      updatedAt: new Date().toISOString(),
    });

    return { success: true, pulledCount };
  } catch (err: any) {
    // Watermark is NOT advanced on failure, guaranteeing no skipped updates
    return { success: false, pulledCount: 0, error: err?.message };
  }
}

/**
 * Performs a complete push-then-pull synchronization cycle.
 */
export async function performFullSync(
  userId: string,
  sessionToken: string
): Promise<{ success: boolean; error?: string }> {
  const pushRes = await pushPendingMutations(userId, sessionToken);
  const pullRes = await pullRemoteUpdates(userId, sessionToken);

  return {
    success: pushRes.success && pullRes.success,
    error: pushRes.error || pullRes.error,
  };
}
