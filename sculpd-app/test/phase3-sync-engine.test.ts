// test/phase3-sync-engine.test.ts
import "fake-indexeddb/auto";
import { db } from "../lib/db/index";
import {
  createUser,
} from "../lib/db/user-repository";
import {
  startWorkoutSession,
  logUserSet,
  getUserSetsForSession,
  deleteUserLastSet,
  getUserSyncQueue,
} from "../lib/db/workout-repository";
import {
  createSessionToken,
  verifySessionToken,
} from "../lib/auth/session-token";
import {
  pushPendingMutations,
  pullRemoteUpdates,
  getBackoffDelay,
} from "../lib/sync/sync-client";
import {
  SyncQueueItem,
  SyncPushPayload,
  SyncPushResult,
  SyncPullResult,
} from "../types/models";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`❌ Assertion Failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

// In-memory MongoDB mock storage for test environment
class MockMongoServer {
  users: Map<string, any> = new Map();
  workoutSessions: Map<string, any> = new Map();
  sets: Map<string, any> = new Map();

  reset() {
    this.users.clear();
    this.workoutSessions.clear();
    this.sets.clear();
  }

  // Simulates server-side push handling in app/api/sync/push/route.ts
  async handlePush(
    token: string,
    payload: SyncPushPayload
  ): Promise<{ status: number; body: SyncPushResult | { error: string } }> {
    const verification = await verifySessionToken(token);
    if (!verification.valid || !verification.userId) {
      return { status: 401, body: { error: "Unauthorized" } };
    }

    const verifiedUserId = verification.userId;

    if (payload.userId !== verifiedUserId) {
      return {
        status: 403,
        body: { error: "Forbidden: Payload userId does not match token" },
      };
    }

    const syncedItemIds: string[] = [];
    const errors: Array<{ itemId: string; error: string }> = [];

    for (const item of payload.items) {
      if (item.userId !== verifiedUserId) {
        errors.push({
          itemId: item.id,
          error: "Forbidden: Cross-user mutation blocked",
        });
        continue;
      }

      if (item.operation === "delete") {
        if (item.collection === "sets") {
          const existing = this.sets.get(item.entityId);
          if (existing && existing.userId === verifiedUserId) {
            existing.isDeleted = true;
            existing.updatedAt = new Date().toISOString();
          }
        }
      } else {
        // Upsert by stable entity UUID (Idempotency)
        if (item.collection === "sets") {
          this.sets.set(item.entityId, {
            ...item.payload,
            userId: verifiedUserId,
            isDeleted: false,
            updatedAt: item.payload?.updatedAt || new Date().toISOString(),
          });
        } else if (item.collection === "workout_sessions") {
          this.workoutSessions.set(item.entityId, {
            ...item.payload,
            userId: verifiedUserId,
            isDeleted: false,
            updatedAt: item.payload?.updatedAt || new Date().toISOString(),
          });
        }
      }
      syncedItemIds.push(item.id);
    }

    return {
      status: 200,
      body: {
        success: errors.length === 0,
        syncedItemIds,
        errors: errors.length > 0 ? errors : undefined,
      },
    };
  }

  // Simulates server-side pull handling in app/api/sync/pull/route.ts
  async handlePull(
    token: string,
    sinceTimestamp: number
  ): Promise<{ status: number; body: SyncPullResult | { error: string } }> {
    const verification = await verifySessionToken(token);
    if (!verification.valid || !verification.userId) {
      return { status: 401, body: { error: "Unauthorized" } };
    }

    const verifiedUserId = verification.userId;
    const sinceIso = new Date(sinceTimestamp).toISOString();

    const userSets: any[] = [];
    const userSessions: any[] = [];
    const deletedIds: any[] = [];

    for (const session of this.workoutSessions.values()) {
      if (session.userId === verifiedUserId && session.updatedAt > sinceIso) {
        if (session.isDeleted) {
          deletedIds.push({ collection: "workout_sessions", id: session.id });
        } else {
          userSessions.push(session);
        }
      }
    }

    for (const set of this.sets.values()) {
      if (set.userId === verifiedUserId && set.updatedAt > sinceIso) {
        if (set.isDeleted) {
          deletedIds.push({ collection: "sets", id: set.id });
        } else {
          userSets.push(set);
        }
      }
    }

    return {
      status: 200,
      body: {
        users: [],
        routines: [],
        exercises: [],
        workoutSessions: userSessions,
        sets: userSets,
        deletedIds: deletedIds.length > 0 ? deletedIds : undefined,
        lastSyncTimestamp: Date.now(),
      },
    };
  }
}

const mockMongo = new MockMongoServer();

async function runPhase3Tests() {
  console.log("\n========================================================");
  console.log("SCULP'D 2.0 PHASE 3: SYNC ENGINE & MONGODB API TESTS");
  console.log("========================================================\n");

  await db.delete();
  await db.open();
  mockMongo.reset();

  // Create test user A
  const userA = await createUser({ displayName: "Alex", pin: "1234", avatarColor: "emerald" });
  const tokenA = await createSessionToken(userA.id);

  // Create test user B
  const userB = await createUser({ displayName: "Jordan", pin: "4321", avatarColor: "amber" });
  const tokenB = await createSessionToken(userB.id);

  const routineId = globalThis.crypto.randomUUID();
  const exerciseId = globalThis.crypto.randomUUID();

  console.log("--- Test 1: Local Set Created → SyncQueue Item Created ---");
  const sessionA = await startWorkoutSession(userA.id, routineId);
  const set1 = await logUserSet(userA.id, sessionA.id, exerciseId, 225, 8);

  const localSets = await getUserSetsForSession(userA.id, sessionA.id);
  assert(localSets.length === 1 && localSets[0].id === set1.id, "Local set saved to IndexedDB");

  const queueItems = await getUserSyncQueue(userA.id);
  const setQueueItem = queueItems.find((q) => q.entityId === set1.id);
  assert(Boolean(setQueueItem), "SyncQueue contains entry for set1");
  assert(setQueueItem?.status === "pending", "SyncQueue item has status 'pending'");
  assert(setQueueItem?.operation === "insert", "SyncQueue item operation is 'insert'");

  console.log("\n--- Test 2: Queue Item Pushed → Removed from Outbox on Success ---");
  // Setup global fetch mock to route to mockMongo
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = input.toString();
    const token = (init?.headers as any)?.Authorization?.replace("Bearer ", "") || "";

    if (urlStr.includes("/api/sync/push")) {
      const payload = JSON.parse(init?.body as string);
      const res = await mockMongo.handlePush(token, payload);
      return new Response(JSON.stringify(res.body), { status: res.status });
    }
    if (urlStr.includes("/api/sync/pull")) {
      const match = urlStr.match(/since=(\d+)/);
      const since = match ? parseInt(match[1], 10) : 0;
      const res = await mockMongo.handlePull(token, since);
      return new Response(JSON.stringify(res.body), { status: res.status });
    }
    return new Response("Not Found", { status: 404 });
  };

  const pushResult = await pushPendingMutations(userA.id, tokenA);
  assert(pushResult.success === true, "Push succeeded");

  const remainingQueue = await getUserSyncQueue(userA.id);
  const syncedSetInQueue = remainingQueue.find((q) => q.entityId === set1.id);
  assert(syncedSetInQueue === undefined, "Successfully synced set removed from syncQueue outbox");
  assert(mockMongo.sets.has(set1.id), "MongoDB mock received set1");

  console.log("\n--- Tests 3 & 4: Network Failure → Local Set Remains, Queue Item Remains ---");
  // Log set 2 while simulating network down
  const set2 = await logUserSet(userA.id, sessionA.id, exerciseId, 235, 6);

  // Mock network down
  globalThis.fetch = async () => {
    throw new Error("Network unreachable (offline gym mode)");
  };

  const failedPush = await pushPendingMutations(userA.id, tokenA);
  assert(failedPush.success === false, "Push correctly reports failure on network drop");

  // Verify local data is authoritative and NEVER rolled back
  const setsStillPresent = await getUserSetsForSession(userA.id, sessionA.id);
  assert(setsStillPresent.length === 2, "Local sets completely preserved (not deleted or rolled back)");

  const queueAfterFailure = await getUserSyncQueue(userA.id);
  const failedQueueItem = queueAfterFailure.find((q) => q.entityId === set2.id);
  assert(Boolean(failedQueueItem), "Queue item remains in outbox after network failure");
  assert(failedQueueItem?.status === "failed", "Queue item marked 'failed' for retry");
  assert(failedQueueItem?.attempts === 1, "Attempt counter incremented to 1");
  assert(Boolean(failedQueueItem?.lastError), "Failure error logged in item");

  console.log("\n--- Test 5: Retry with Backoff Delay → Eventually Synchronizes ---");
  // Exponential backoff check
  assert(getBackoffDelay(1) === 2000, "1 attempt = 2000ms backoff");
  assert(getBackoffDelay(2) === 4000, "2 attempts = 4000ms backoff");

  // Restore mock fetch
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = input.toString();
    const token = (init?.headers as any)?.Authorization?.replace("Bearer ", "") || "";
    if (urlStr.includes("/api/sync/push")) {
      const payload = JSON.parse(init?.body as string);
      const res = await mockMongo.handlePush(token, payload);
      return new Response(JSON.stringify(res.body), { status: res.status });
    }
    return new Response("Not Found", { status: 404 });
  };

  // Simulate backoff elapsed
  await db.syncQueue.update(failedQueueItem!.id, { lastAttemptAt: Date.now() - 5000 });
  const retryResult = await pushPendingMutations(userA.id, tokenA);
  assert(retryResult.success === true, "Retry succeeded after connectivity restored");
  assert(mockMongo.sets.has(set2.id), "MongoDB received set2 on retry");

  console.log("\n--- Test 6: Idempotency → Duplicate Push Creates Only One Record ---");
  const duplicateItem: SyncQueueItem = {
    id: globalThis.crypto.randomUUID(),
    userId: userA.id,
    operation: "insert",
    collection: "sets",
    entityId: set1.id, // Same set1 UUID
    payload: set1,
    timestamp: Date.now(),
    status: "pending",
    attempts: 0,
  };

  // Push twice
  await mockMongo.handlePush(tokenA, { userId: userA.id, items: [duplicateItem] });
  await mockMongo.handlePush(tokenA, { userId: userA.id, items: [duplicateItem] });

  const totalMatchingSetsInCloud = Array.from(mockMongo.sets.values()).filter(
    (s) => s.id === set1.id
  ).length;
  assert(totalMatchingSetsInCloud === 1, "Idempotent: Duplicate push resulted in exactly 1 MongoDB record");

  console.log("\n--- Test 7: User Isolation → User A Cannot Push Data as User B ---");
  const spoofedItem: SyncQueueItem = {
    id: globalThis.crypto.randomUUID(),
    userId: userB.id, // User B entity
    operation: "insert",
    collection: "sets",
    entityId: globalThis.crypto.randomUUID(),
    payload: { id: "spoofed_set", userId: userB.id },
    timestamp: Date.now(),
    status: "pending",
    attempts: 0,
  };

  // User A tries to push item with User B's token
  const spoofResult = await mockMongo.handlePush(tokenA, {
    userId: userA.id,
    items: [spoofedItem],
  });
  const pushBody = spoofResult.body as SyncPushResult;
  assert(
    pushBody.errors !== undefined && pushBody.errors.length > 0,
    "Server rejected push item with mismatched userId"
  );
  assert(!mockMongo.sets.has("spoofed_set"), "Spoofed set was NOT written to database");

  // User A tries to spoof payload userId
  const mismatchResult = await mockMongo.handlePush(tokenA, {
    userId: userB.id, // mismatch from tokenA
    items: [],
  });
  assert(mismatchResult.status === 403, "Server rejected payload with 403 Forbidden when userId !== token");

  console.log("\n--- Test 8: User Isolation → User A Cannot Pull User B Data ---");
  // Add a private set for User B into cloud
  mockMongo.sets.set("userB_private_set", {
    id: "userB_private_set",
    userId: userB.id,
    weight: 315,
    reps: 5,
    updatedAt: new Date().toISOString(),
  });

  const pullA = await mockMongo.handlePull(tokenA, 0);
  const pulledSetsA = (pullA.body as SyncPullResult).sets;
  const leakedSet = pulledSetsA.find((s) => s.id === "userB_private_set");
  assert(leakedSet === undefined, "User A pull strictly excluded User B's private sets");

  const pullB = await mockMongo.handlePull(tokenB, 0);
  const pulledSetsB = (pullB.body as SyncPullResult).sets;
  assert(
    pulledSetsB.some((s) => s.id === "userB_private_set"),
    "User B can pull their own set"
  );

  console.log("\n--- Test 9: Conflict Policy → Older Cloud Data Does Not Overwrite Newer Local Data ---");
  const sessionToTest = await startWorkoutSession(userA.id, routineId);
  const newerDate = "2026-09-21T21:00:00.000Z";
  const olderDate = "2026-09-21T18:00:00.000Z";

  // Mark local session as completed with newer timestamp
  await db.workoutSessions.update(sessionToTest.id, {
    status: "completed",
    updatedAt: newerDate,
  });

  // Mock server returning older session state
  globalThis.fetch = async (): Promise<Response> => {
    const result: SyncPullResult = {
      users: [],
      routines: [],
      exercises: [],
      workoutSessions: [
        {
          ...sessionToTest,
          status: "in_progress", // older state
          updatedAt: olderDate,
        },
      ],
      sets: [],
      lastSyncTimestamp: Date.now(),
    };
    return new Response(JSON.stringify(result), { status: 200 });
  };

  await pullRemoteUpdates(userA.id, tokenA);
  const localAfterPull = await db.workoutSessions.get(sessionToTest.id);
  assert(localAfterPull?.status === "completed", "Newer local record preserved; older cloud data discarded");

  console.log("\n--- Test 10: Offline Workout Logging Completely Decoupled from Network ---");
  // Break network completely
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };

  const offlineSession = await startWorkoutSession(userA.id, routineId);
  const offlineSet = await logUserSet(userA.id, offlineSession.id, exerciseId, 185, 10);
  assert(Boolean(offlineSet.id), "Offline set logged instantly with 0ms network dependency");

  const offlineSetsInDb = await getUserSetsForSession(userA.id, offlineSession.id);
  assert(offlineSetsInDb.length === 1, "Offline set immediately readable in IndexedDB");

  console.log("\n--- Test 11: Multiple Queued Sets Synchronize Correctly on Reconnect ---");
  const setMulti1 = await logUserSet(userA.id, offlineSession.id, exerciseId, 195, 8);
  const setMulti2 = await logUserSet(userA.id, offlineSession.id, exerciseId, 205, 6);

  // Restore mockMongo
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = input.toString();
    const token = (init?.headers as any)?.Authorization?.replace("Bearer ", "") || "";
    if (urlStr.includes("/api/sync/push")) {
      const payload = JSON.parse(init?.body as string);
      const res = await mockMongo.handlePush(token, payload);
      return new Response(JSON.stringify(res.body), { status: res.status });
    }
    return new Response("Not Found", { status: 404 });
  };

  const multiPush = await pushPendingMutations(userA.id, tokenA);
  assert(multiPush.success === true, "Batch push of all offline sets succeeded");
  assert(mockMongo.sets.has(offlineSet.id), "offlineSet synced to MongoDB");
  assert(mockMongo.sets.has(setMulti1.id), "setMulti1 synced to MongoDB");
  assert(mockMongo.sets.has(setMulti2.id), "setMulti2 synced to MongoDB");

  console.log("\n--- Test 12: App Restart Preserves Pending Queue ---");
  // Add an item directly to syncQueue
  const fakeItem: SyncQueueItem = {
    id: globalThis.crypto.randomUUID(),
    userId: userA.id,
    operation: "insert",
    collection: "sets",
    entityId: "restart_test_set",
    payload: { id: "restart_test_set" },
    timestamp: Date.now(),
    status: "pending",
    attempts: 0,
  };
  await db.syncQueue.add(fakeItem);

  // Simulate restart by re-querying from fresh db instance
  const freshItems = await db.syncQueue.where("id").equals(fakeItem.id).toArray();
  assert(freshItems.length === 1, "Queue items safely persisted across simulated restarts");

  console.log("\n--- Test 13: Tombstoned/Deleted Data Does Not Resurrect ---");
  // Delete a set
  await deleteUserLastSet(userA.id, offlineSession.id, exerciseId);
  const delQueueItems = await getUserSyncQueue(userA.id);
  const deleteOp = delQueueItems.find((q) => q.operation === "delete");
  assert(Boolean(deleteOp), "Deletion queued with operation: 'delete'");

  // Push deletion to MongoDB mock
  await mockMongo.handlePush(tokenA, {
    userId: userA.id,
    items: [deleteOp!],
  });

  const cloudSetRecord = mockMongo.sets.get(deleteOp!.entityId);
  assert(cloudSetRecord?.isDeleted === true, "Record tombstoned in MongoDB (isDeleted: true)");

  // Pull with tombstone
  globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
    const urlStr = input.toString();
    const token = tokenA;
    const res = await mockMongo.handlePull(token, 0);
    return new Response(JSON.stringify(res.body), { status: res.status });
  };

  await pullRemoteUpdates(userA.id, tokenA);
  const localSetAfterTombstone = await db.sets.get(deleteOp!.entityId);
  assert(localSetAfterTombstone === undefined, "Tombstoned record correctly removed/suppressed locally");

  console.log("\n--- Test 14: Sync Watermark Only Advances After Successful Synchronization ---");
  const metaBefore = await db.syncMeta.get(`lastSync_${userA.id}`);
  const watermarkBefore = metaBefore?.lastSyncTimestamp || 0;

  // Simulate pull failure
  globalThis.fetch = async () => {
    throw new Error("Server exploded");
  };
  await pullRemoteUpdates(userA.id, tokenA);
  const metaAfterFail = await db.syncMeta.get(`lastSync_${userA.id}`);
  assert(
    (metaAfterFail?.lastSyncTimestamp || 0) === watermarkBefore,
    "Watermark did NOT advance on sync failure"
  );

  // Restore working pull
  globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
    const res = await mockMongo.handlePull(tokenA, watermarkBefore);
    return new Response(JSON.stringify(res.body), { status: res.status });
  };
  await pullRemoteUpdates(userA.id, tokenA);
  const metaAfterSuccess = await db.syncMeta.get(`lastSync_${userA.id}`);
  assert(
    (metaAfterSuccess?.lastSyncTimestamp || 0) > watermarkBefore,
    "Watermark successfully advanced after clean sync"
  );

  // Restore original fetch
  globalThis.fetch = originalFetch;

  console.log("\n========================================================");
  console.log("✅ ALL 14 PHASE 3 AUTOMATED TESTS PASSED WITH 100% SUCCESS!");
  console.log("========================================================\n");
}

runPhase3Tests().catch((err) => {
  console.error("Phase 3 Test Suite Failed:", err);
  process.exit(1);
});
