// test/cloud-sync-integrity.test.ts
import "fake-indexeddb/auto";
import { db } from "../lib/db/index";
import { createUser } from "../lib/db/user-repository";
import {
  createRoutine,
  updateRoutine,
  deleteRoutine,
  getRoutineWithExercises,
} from "../lib/db/routine-repository";
import {
  startWorkoutSession,
  logUserSet,
} from "../lib/db/workout-repository";
import {
  createSessionToken,
  verifySessionToken,
} from "../lib/auth/session-token";
import {
  pushPendingMutations,
  pullRemoteUpdates,
} from "../lib/sync/sync-client";
import {
  SyncPushPayload,
  SyncPushResult,
  SyncPullResult,
  SyncQueueItem,
} from "../types/models";
import { POST } from "../app/api/sync/push/route";
import { GET } from "../app/api/sync/pull/route";

// Set mock MongoDB URI for Next.js route environment
process.env.MONGODB_URI = "mongodb://mock-cloud-atlas:27017/sculpd";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`❌ Assertion Failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

/**
 * In-memory Mock MongoDB Collection supporting real queries used by push and pull routes:
 * - findOne({ id, userId })
 * - find({ userId, updatedAt: { $gt } })
 * - updateOne({ id, userId, $or: [...] }, { $set: ... }, { upsert: true })
 * - createIndex(...)
 */
class MockMongoCollection<T extends { id: string; userId?: string | null; updatedAt?: string; isDeleted?: boolean }> {
  private store: Map<string, any> = new Map();

  clear() {
    this.store.clear();
  }

  async createIndex(): Promise<string> {
    return "index_ok";
  }

  async findOne(query: Record<string, any>): Promise<any | null> {
    for (const doc of this.store.values()) {
      if (this.matchesQuery(doc, query)) {
        return JSON.parse(JSON.stringify(doc));
      }
    }
    return null;
  }

  find(query: Record<string, any>): { toArray: () => Promise<any[]> } {
    const results: any[] = [];
    for (const doc of this.store.values()) {
      if (this.matchesQuery(doc, query)) {
        results.push(JSON.parse(JSON.stringify(doc)));
      }
    }
    return {
      toArray: async () => results,
    };
  }

  async updateOne(
    query: Record<string, any>,
    update: { $set: any },
    options?: { upsert?: boolean }
  ): Promise<{ matchedCount: number; modifiedCount: number; upsertedCount: number }> {
    let targetDoc: any = null;
    let targetKey: string | null = null;

    for (const [key, doc] of this.store.entries()) {
      if (this.matchesQuery(doc, query)) {
        targetDoc = doc;
        targetKey = key;
        break;
      }
    }

    if (targetDoc && targetKey) {
      const updated = {
        ...targetDoc,
        ...update.$set,
      };
      this.store.set(targetKey, updated);
      return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
    }

    if (options?.upsert) {
      // If doc exists by ID but query didn't match (e.g. wrong userId), in Mongo unique index prevents duplicate insert
      if (query.id && this.store.has(query.id)) {
        const existing = this.store.get(query.id);
        if (query.userId && existing.userId && existing.userId !== query.userId) {
          throw new Error("E11000 duplicate key error collection: index id_1 dup key");
        }
      }

      const newId = update.$set?.id || query.id;
      const newDoc = {
        ...query,
        ...update.$set,
        id: newId,
      };
      delete newDoc.$or;
      this.store.set(newId, newDoc);
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
    }

    return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
  }

  private matchesQuery(doc: any, query: Record<string, any>): boolean {
    for (const [key, val] of Object.entries(query)) {
      if (key === "$or" && Array.isArray(val)) {
        const orMatches = val.some((subQuery) => this.matchesQuery(doc, subQuery));
        if (!orMatches) return false;
      } else if (key === "updatedAt" && typeof val === "object" && val !== null) {
        if (val.$gt !== undefined) {
          if (!doc.updatedAt || doc.updatedAt <= val.$gt) return false;
        }
        if (val.$lte !== undefined) {
          if (!doc.updatedAt || doc.updatedAt > val.$lte) return false;
        }
        if (val.$exists !== undefined) {
          const exists = doc.updatedAt !== undefined;
          if (exists !== val.$exists) return false;
        }
      } else {
        if (val === null || val === undefined) {
          if (doc[key] !== null && doc[key] !== undefined) return false;
        } else if (doc[key] !== val) {
          return false;
        }
      }
    }
    return true;
  }

  // Test inspection helper
  get(id: string): any | undefined {
    const doc = this.store.get(id);
    return doc ? JSON.parse(JSON.stringify(doc)) : undefined;
  }

  count(): number {
    return this.store.size;
  }
}

// Mock collections
const mockUsers = new MockMongoCollection();
const mockRoutines = new MockMongoCollection();
const mockRoutineExercises = new MockMongoCollection();
const mockExercises = new MockMongoCollection();
const mockSessions = new MockMongoCollection();
const mockSets = new MockMongoCollection();
const mockPushSubscriptions = new MockMongoCollection();
const mockRestNotifications = new MockMongoCollection();

// Mock MongoDB Database
const mockDb = {
  collection: (name: string) => {
    switch (name) {
      case "users":
        return mockUsers;
      case "routines":
        return mockRoutines;
      case "routine_exercises":
        return mockRoutineExercises;
      case "exercises":
        return mockExercises;
      case "workout_sessions":
        return mockSessions;
      case "sets":
        return mockSets;
      case "push_subscriptions":
        return mockPushSubscriptions;
      case "rest_notifications":
        return mockRestNotifications;
      default:
        throw new Error(`Unknown mock collection: ${name}`);
    }
  },
};

// Wire global mongoClientPromise to return our mockDb
(global as any)._mongoClientPromise = Promise.resolve({
  db: () => mockDb,
});

/**
 * Route dispatcher helper simulating Next.js fetch calls to /api/sync/push and /api/sync/pull
 */
function setupFetchMock() {
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = input.toString();

    if (urlStr.includes("/api/sync/push")) {
      const headers = new Headers(init?.headers as any);
      const req = new Request("http://localhost:3000/api/sync/push", {
        method: "POST",
        headers,
        body: init?.body,
      });
      return await POST(req);
    }

    if (urlStr.includes("/api/sync/pull")) {
      const headers = new Headers(init?.headers as any);
      const req = new Request(`http://localhost:3000${urlStr.substring(urlStr.indexOf("/api/sync/pull"))}`, {
        method: "GET",
        headers,
      });
      return await GET(req);
    }

    return new Response("Not Found", { status: 404 });
  };
}

async function runTests() {
  console.log("\n========================================================");
  console.log("SCULP'D 2.0 TASK 02.2: CLOUD SYNC INTEGRITY REGRESSION TESTS");
  console.log("========================================================\n");

  setupFetchMock();

  // Reset local Dexie and mock Mongo
  await db.delete();
  await db.open();

  mockUsers.clear();
  mockRoutines.clear();
  mockRoutineExercises.clear();
  mockExercises.clear();
  mockSessions.clear();
  mockSets.clear();

  // Create Athlete A
  const athleteA = await createUser({
    displayName: "Athlete A",
    pin: "1234",
    avatarColor: "emerald",
  });
  const tokenA = await createSessionToken(athleteA.id);

  // Create Athlete B (for cross-user isolation tests)
  const athleteB = await createUser({
    displayName: "Athlete B",
    pin: "5678",
    avatarColor: "violet",
  });
  const tokenB = await createSessionToken(athleteB.id);

  console.log("--- 1. Routine-Exercise Push Creates Valid MongoDB Records ---");
  const routine1 = await createRoutine(athleteA.id, {
    name: "Hypertrophy Push",
    description: "Chest, Shoulders & Triceps",
    exercises: [
      {
        exerciseId: "ex_incline_press",
        targetSets: 4,
        targetReps: "8-10",
        restSeconds: 90,
        notes: "Keep elbows at 45 degrees",
      },
      {
        exerciseId: "ex_lateral_raise",
        targetSets: 3,
        targetReps: "12-15",
        restSeconds: 60,
        notes: "Lead with elbows",
      },
      {
        exerciseId: "ex_tricep_dips",
        targetSets: 3,
        targetReps: "10-12",
        restSeconds: 60,
        loadType: "bodyweight",
        notes: "Full lockout",
      },
    ],
  });

  // Verify Dexie state
  const localRtnExercises = await db.routineExercises
    .where("routineId")
    .equals(routine1.id)
    .sortBy("displayOrder");
  assert(localRtnExercises.length === 3, "Dexie created 3 routine_exercise records");

  // Push pending mutations
  const pushRes1 = await pushPendingMutations(athleteA.id, tokenA);
  assert(pushRes1.success === true, "Push request succeeded");
  assert(pushRes1.pushedCount === 5, "Pushed 5 items (1 user profile + 1 routine + 3 routine_exercises)");

  // Verify records in mock MongoDB
  assert(mockRoutineExercises.count() === 3, "MongoDB routine_exercises collection has 3 records");
  const mongoRe1 = mockRoutineExercises.get(localRtnExercises[0].id);
  assert(Boolean(mongoRe1), "First routine_exercise persisted to MongoDB");
  assert(mongoRe1.routineId === routine1.id, "Preserved routineId relationship");
  assert(mongoRe1.exerciseId === "ex_incline_press", "Preserved exerciseId");
  assert(mongoRe1.displayOrder === 1, "Preserved displayOrder 1");
  assert(mongoRe1.targetSets === 4, "Preserved targetSets: 4");
  assert(mongoRe1.targetReps === "8-10", "Preserved targetReps: '8-10'");
  assert(mongoRe1.restSeconds === 90, "Preserved restSeconds: 90");
  assert(mongoRe1.notes === "Keep elbows at 45 degrees", "Preserved notes");
  assert(mongoRe1.userId === athleteA.id, "Preserved userId ownership");
  assert(mongoRe1.isDeleted === false, "isDeleted is false");

  const mongoRe3 = mockRoutineExercises.get(localRtnExercises[2].id);
  assert(mongoRe3.loadType === "bodyweight", "Preserved loadType: bodyweight");
  assert(mongoRe3.displayOrder === 3, "Preserved displayOrder: 3");

  // Verify outbox was pruned
  const queueAfterPush1 = await db.syncQueue.where("userId").equals(athleteA.id).count();
  assert(queueAfterPush1 === 0, "All items pruned from outbox on successful push");

  console.log("\n--- 2. Repeating the Same Push Does Not Create Duplicates (Idempotency) ---");
  // Enqueue duplicate push item manually
  const duplicateItem: SyncQueueItem = {
    id: "queue_dup_1",
    userId: athleteA.id,
    operation: "insert",
    collection: "routine_exercises",
    entityId: localRtnExercises[0].id,
    payload: JSON.parse(JSON.stringify(localRtnExercises[0])),
    timestamp: Date.now(),
    status: "pending",
    attempts: 0,
  };
  await db.syncQueue.add(duplicateItem);

  const dupPushRes = await pushPendingMutations(athleteA.id, tokenA);
  assert(dupPushRes.success === true, "Duplicate push reported success");
  assert(mockRoutineExercises.count() === 3, "Repeating push did NOT create duplicate MongoDB documents");
  const dupQueueRemaining = await db.syncQueue.where("userId").equals(athleteA.id).count();
  assert(dupQueueRemaining === 0, "Duplicate item acknowledged and removed from outbox");

  console.log("\n--- 3. Routine-Exercise Pull Restores Correct Records & Display Order ---");
  // Simulate a new device: clear local routineExercises and routines tables
  await db.routineExercises.clear();
  await db.routines.clear();
  assert((await db.routineExercises.count()) === 0, "Target device routineExercises starts empty");

  const pullRes = await pullRemoteUpdates(athleteA.id, tokenA);
  assert(pullRes.success === true, "Pull remote updates succeeded");
  assert((await db.routineExercises.count()) === 3, "Target device restored 3 routine_exercises");

  const restoredRtnWithExercises = await getRoutineWithExercises(routine1.id);
  assert(Boolean(restoredRtnWithExercises), "Routine retrieved with exercises");
  assert(restoredRtnWithExercises!.exercises.length === 3, "Retrieved all 3 exercises");
  assert(restoredRtnWithExercises!.exercises[0].exerciseId === "ex_incline_press", "Exercise 1 is incline press");
  assert(restoredRtnWithExercises!.exercises[0].displayOrder === 1, "Exercise 1 displayOrder is 1");
  assert(restoredRtnWithExercises!.exercises[1].exerciseId === "ex_lateral_raise", "Exercise 2 is lateral raise");
  assert(restoredRtnWithExercises!.exercises[1].displayOrder === 2, "Exercise 2 displayOrder is 2");
  assert(restoredRtnWithExercises!.exercises[2].exerciseId === "ex_tricep_dips", "Exercise 3 is tricep dips");
  assert(restoredRtnWithExercises!.exercises[2].displayOrder === 3, "Exercise 3 displayOrder is 3");

  console.log("\n--- 4. Deleted Routine-Exercise Records Follow Tombstone Contract ---");
  // Athlete A updates routine: removes Exercise 2 (ex_lateral_raise)
  const remainingConfigs = [
    {
      exerciseId: "ex_incline_press",
      targetSets: 4,
      targetReps: "8-10",
      restSeconds: 90,
    },
    {
      exerciseId: "ex_tricep_dips",
      targetSets: 3,
      targetReps: "10-12",
      restSeconds: 60,
      loadType: "bodyweight" as const,
    },
  ];

  await updateRoutine(athleteA.id, routine1.id, {
    exercises: remainingConfigs,
  });

  // Verify deletion tombstone is queued
  const deleteQueueItems = await db.syncQueue
    .where("userId")
    .equals(athleteA.id)
    .filter((q) => q.operation === "delete")
    .toArray();
  assert(deleteQueueItems.length >= 1, "Delete mutation queued in syncQueue");

  const deletedConfigId = deleteQueueItems[0].entityId;

  // Push the deletion
  const delPushRes = await pushPendingMutations(athleteA.id, tokenA);
  assert(delPushRes.success === true, "Delete push succeeded");

  // Verify MongoDB document has isDeleted: true
  const tombstonedInMongo = mockRoutineExercises.get(deletedConfigId);
  assert(Boolean(tombstonedInMongo), "Document exists in MongoDB");
  assert(tombstonedInMongo.isDeleted === true, "Document tombstoned with isDeleted: true");

  // Pull onto simulated device: verifies tombstone prunes local record
  await pullRemoteUpdates(athleteA.id, tokenA);
  const deletedOnClient = await db.routineExercises.get(deletedConfigId);
  assert(deletedOnClient === undefined, "Tombstoned record deleted from local client database");

  console.log("\n--- 5. Failed Persistence Does Not Silently Remove Queued Mutations ---");
  // Enqueue a mutation
  const testSetItem: SyncQueueItem = {
    id: "queue_failed_test",
    userId: athleteA.id,
    operation: "insert",
    collection: "sets",
    entityId: "set_fail_1",
    payload: { id: "set_fail_1", weight: 225, reps: 5 },
    timestamp: Date.now(),
    status: "pending",
    attempts: 0,
  };
  await db.syncQueue.add(testSetItem);

  // Force global fetch failure to simulate network drop
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("Cloud database connection timeout");
  };

  const failedPushResult = await pushPendingMutations(athleteA.id, tokenA);
  assert(failedPushResult.success === false, "Push reports failure");

  const failedQueueItem = await db.syncQueue.get("queue_failed_test");
  assert(Boolean(failedQueueItem), "Failed item retained in syncQueue outbox");
  assert(failedQueueItem?.status === "failed", "Status marked as 'failed'");
  assert(failedQueueItem?.attempts === 1, "Attempt counter incremented to 1");

  // Restore fetch
  setupFetchMock();
  await db.syncQueue.delete("queue_failed_test");

  console.log("\n--- 6. Stale Workout-Session Update Cannot Overwrite Newer Cloud Version ---");
  // Set up cloud state with a newer session completed at 14:00
  const sessionId = "ws_conflict_test";
  await mockSessions.updateOne(
    { id: sessionId },
    {
      $set: {
        id: sessionId,
        userId: athleteA.id,
        routineId: routine1.id,
        status: "completed",
        notes: "Updated from Laptop at 14:00",
        startedAt: "2026-10-14T13:00:00.000Z",
        completedAt: "2026-10-14T14:00:00.000Z",
        updatedAt: "2026-10-14T14:00:00.000Z",
        isDeleted: false,
      },
    },
    { upsert: true }
  );

  // Stale mutation from offline phone: has updatedAt: 12:00
  const stalePhoneItem: SyncQueueItem = {
    id: "queue_stale_phone",
    userId: athleteA.id,
    operation: "update",
    collection: "workout_sessions",
    entityId: sessionId,
    payload: {
      id: sessionId,
      routineId: routine1.id,
      status: "in_progress",
      notes: "Old notes from phone at 12:00",
      startedAt: "2026-10-14T11:00:00.000Z",
      updatedAt: "2026-10-14T12:00:00.000Z",
    },
    timestamp: Date.now(),
    status: "pending",
    attempts: 0,
  };
  await db.syncQueue.add(stalePhoneItem);

  const stalePushRes = await pushPendingMutations(athleteA.id, tokenA);
  assert(stalePushRes.success === true, "Stale push successfully acknowledged without error");
  assert(stalePushRes.staleCount === 1, "Identified 1 stale mutation");

  // Cloud document was NOT overwritten
  const sessionInMongo = mockSessions.get(sessionId);
  assert(sessionInMongo.status === "completed", "Cloud session status remains 'completed'");
  assert(sessionInMongo.notes === "Updated from Laptop at 14:00", "Cloud session notes NOT overwritten by stale phone notes");
  assert(sessionInMongo.updatedAt === "2026-10-14T14:00:00.000Z", "Cloud session updatedAt remains 14:00");

  // Stale mutation pruned from outbox so client doesn't retry endlessly
  const staleItemInQueue = await db.syncQueue.get("queue_stale_phone");
  assert(staleItemInQueue === undefined, "Stale mutation safely pruned from outbox to avoid infinite retry loop");

  console.log("\n--- 7. Newer Valid Update is Accepted ---");
  const newerItem: SyncQueueItem = {
    id: "queue_newer_edit",
    userId: athleteA.id,
    operation: "update",
    collection: "workout_sessions",
    entityId: sessionId,
    payload: {
      id: sessionId,
      routineId: routine1.id,
      status: "completed",
      notes: "Latest Edit from Gym Floor at 16:00",
      updatedAt: "2026-10-14T16:00:00.000Z",
    },
    timestamp: Date.now(),
    status: "pending",
    attempts: 0,
  };
  await db.syncQueue.add(newerItem);

  const newerPushRes = await pushPendingMutations(athleteA.id, tokenA);
  assert(newerPushRes.success === true, "Newer update push succeeded");
  assert(newerPushRes.pushedCount === 1, "Newer update counted as accepted pushedCount");

  const updatedSessionInMongo = mockSessions.get(sessionId);
  assert(updatedSessionInMongo.notes === "Latest Edit from Gym Floor at 16:00", "Cloud session notes updated to latest value");
  assert(updatedSessionInMongo.updatedAt === "2026-10-14T16:00:00.000Z", "Cloud session updatedAt advanced to 16:00");

  console.log("\n--- 8. Repeating an Already Accepted Update is Idempotent ---");
  // Repeat the exact same update with updatedAt: 16:00
  const repeatItem: SyncQueueItem = {
    id: "queue_repeat_edit",
    userId: athleteA.id,
    operation: "update",
    collection: "workout_sessions",
    entityId: sessionId,
    payload: {
      id: sessionId,
      routineId: routine1.id,
      status: "completed",
      notes: "Latest Edit from Gym Floor at 16:00",
      updatedAt: "2026-10-14T16:00:00.000Z",
    },
    timestamp: Date.now(),
    status: "pending",
    attempts: 0,
  };
  await db.syncQueue.add(repeatItem);

  const repeatRes = await pushPendingMutations(athleteA.id, tokenA);
  assert(repeatRes.success === true, "Repeating update succeeds idempotently");
  assert(repeatRes.pushedCount === 1, "Repeated update accepted");

  console.log("\n--- 9. Invalid Timestamps Handled Safely ---");
  const invalidTimeItem: SyncQueueItem = {
    id: "queue_invalid_time",
    userId: athleteA.id,
    operation: "update",
    collection: "workout_sessions",
    entityId: sessionId,
    payload: {
      id: sessionId,
      notes: "Corrupted timestamp payload",
      updatedAt: "not_a_valid_date_string",
    },
    timestamp: Date.now(),
    status: "pending",
    attempts: 0,
  };
  await db.syncQueue.add(invalidTimeItem);

  const invalidTimePush = await pushPendingMutations(athleteA.id, tokenA);
  assert(invalidTimePush.success === false, "Update with invalid timestamp rejected");

  const sessionUnmodified = mockSessions.get(sessionId);
  assert(sessionUnmodified.notes === "Latest Edit from Gym Floor at 16:00", "Cloud session untouched by invalid timestamp payload");

  const invalidQueueItem = await db.syncQueue.get("queue_invalid_time");
  assert(Boolean(invalidQueueItem), "Invalid item retained in queue for error inspection");
  assert(invalidQueueItem?.status === "failed", "Invalid item marked 'failed'");
  await db.syncQueue.delete("queue_invalid_time");

  console.log("\n--- 10. Cross-User Mutations are Rejected ---");
  // Athlete B tries to mutate Athlete A's workout session
  const crossUserItem: SyncQueueItem = {
    id: "queue_cross_attack",
    userId: athleteB.id,
    operation: "update",
    collection: "workout_sessions",
    entityId: sessionId, // Belongs to Athlete A
    payload: {
      id: sessionId,
      notes: "Hacked notes by Athlete B",
      updatedAt: "2026-10-14T18:00:00.000Z",
    },
    timestamp: Date.now(),
    status: "pending",
    attempts: 0,
  };
  await db.syncQueue.add(crossUserItem);

  const crossUserPush = await pushPendingMutations(athleteB.id, tokenB);
  assert(crossUserPush.success === false, "Cross-user mutation rejected");

  const sessionProtected = mockSessions.get(sessionId);
  assert(sessionProtected.userId === athleteA.id, "Session ownership untouched");
  assert(sessionProtected.notes === "Latest Edit from Gym Floor at 16:00", "Athlete A's notes protected from Athlete B");
  await db.syncQueue.delete("queue_cross_attack");

  console.log("\n--- 11. Mixed Batches Correctly Acknowledge Successes while Retaining Failures ---");
  const validSetItem: SyncQueueItem = {
    id: "queue_mixed_valid_1",
    userId: athleteA.id,
    operation: "insert",
    collection: "sets",
    entityId: "set_mixed_1",
    payload: {
      id: "set_mixed_1",
      userId: athleteA.id,
      workoutSessionId: sessionId,
      exerciseId: "ex_incline_press",
      setNumber: 1,
      weight: 185,
      reps: 8,
      rpe: 8,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    timestamp: Date.now(),
    status: "pending",
    attempts: 0,
  };

  const unsupportedColItem: SyncQueueItem = {
    id: "queue_mixed_unsupported_2",
    userId: athleteA.id,
    operation: "insert",
    collection: "unsupported_table" as any,
    entityId: "unsupported_entity_1",
    payload: { id: "unsupported_entity_1" },
    timestamp: Date.now(),
    status: "pending",
    attempts: 0,
  };

  const validRoutineExItem: SyncQueueItem = {
    id: "queue_mixed_valid_3",
    userId: athleteA.id,
    operation: "insert",
    collection: "routine_exercises",
    entityId: "re_mixed_3",
    payload: {
      id: "re_mixed_3",
      routineId: routine1.id,
      exerciseId: "ex_cable_fly",
      displayOrder: 4,
      targetSets: 3,
      targetReps: "12-15",
      restSeconds: 60,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    timestamp: Date.now(),
    status: "pending",
    attempts: 0,
  };

  await db.syncQueue.bulkAdd([validSetItem, unsupportedColItem, validRoutineExItem]);

  const mixedPushRes = await pushPendingMutations(athleteA.id, tokenA);
  assert(mixedPushRes.success === false, "Batch overall success false due to unsupported collection");
  assert(mixedPushRes.pushedCount === 2, "2 valid mutations successfully pushed and acknowledged");

  // Verify valid items removed from outbox
  const setPruned = await db.syncQueue.get("queue_mixed_valid_1");
  const routineExPruned = await db.syncQueue.get("queue_mixed_valid_3");
  assert(setPruned === undefined, "Valid set item pruned from outbox");
  assert(routineExPruned === undefined, "Valid routine_exercise pruned from outbox");

  // Verify unsupported item retained in outbox
  const unsupportedRetained = await db.syncQueue.get("queue_mixed_unsupported_2");
  assert(Boolean(unsupportedRetained), "Unsupported collection item retained in outbox");
  assert(unsupportedRetained?.status === "failed", "Unsupported item marked 'failed'");
  assert(unsupportedRetained?.attempts === 1, "Unsupported item attempt count incremented");

  // Verify valid records written to Mongo
  assert(mockSets.get("set_mixed_1") !== undefined, "Valid set persisted to MongoDB");
  assert(mockRoutineExercises.get("re_mixed_3") !== undefined, "Valid routine_exercise persisted to MongoDB");

  console.log("\n========================================================");
  console.log("✅ ALL 11 CLOUD SYNC INTEGRITY TESTS PASSED WITH 100% SUCCESS!");
  console.log("========================================================\n");
}

runTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
