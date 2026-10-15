// test/workout-calendar-backfill.test.ts
import "fake-indexeddb/auto";
import { db } from "../lib/db/index";
import { createUser } from "../lib/db/user-repository";
import { createRoutine } from "../lib/db/routine-repository";
import {
  startWorkoutSession,
  completeWorkoutSession,
  logUserSet,
  getUserSetsForSession,
  updateWorkoutSessionDate,
  backfillHistoricalWorkoutSession,
  getWorkoutSessionById,
} from "../lib/db/workout-repository";
import {
  getLocalDateKey,
  parseLocalDateKey,
  formatCalendarDate,
  getCalendarMonthDays,
  getCalendarMonthData,
} from "../lib/calendar/calendar-service";
import {
  getCompletedWorkoutSummaries,
  getCompletedWorkoutDetail,
} from "../lib/history/history-service";
import { getAllPRHistory } from "../lib/analytics/analytics-service";
import { createSessionToken } from "../lib/auth/session-token";
import { pushPendingMutations } from "../lib/sync/sync-client";
import { POST } from "../app/api/sync/push/route";

process.env.MONGODB_URI = "mongodb://mock-cloud-atlas:27017/sculpd";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`❌ Assertion Failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

// In-memory mock Mongo collection for sync verification
class MockMongoCollection {
  private store: Map<string, any> = new Map();

  clear() {
    this.store.clear();
  }

  async createIndex() {
    return "ok";
  }

  async findOne(query: Record<string, any>) {
    for (const doc of this.store.values()) {
      if (query.id && doc.id !== query.id) continue;
      if (query.userId && doc.userId !== query.userId) continue;
      return JSON.parse(JSON.stringify(doc));
    }
    return null;
  }

  async updateOne(query: Record<string, any>, update: { $set: any }, options?: { upsert?: boolean }) {
    for (const [key, doc] of this.store.entries()) {
      if (query.id && doc.id === query.id) {
        if (query.$or) {
          const matchesOr = query.$or.some((cond: any) => {
            if (cond.updatedAt?.$exists === false) return doc.updatedAt === undefined;
            if (cond.updatedAt?.$lte !== undefined) return doc.updatedAt <= cond.updatedAt.$lte;
            return true;
          });
          if (!matchesOr) return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
        }
        const updated = { ...doc, ...update.$set };
        this.store.set(key, updated);
        return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
      }
    }
    if (options?.upsert) {
      const id = update.$set?.id || query.id;
      const doc = { ...query, ...update.$set, id };
      delete doc.$or;
      this.store.set(id, doc);
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
    }
    return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
  }

  get(id: string) {
    const doc = this.store.get(id);
    return doc ? JSON.parse(JSON.stringify(doc)) : undefined;
  }
}

const mockSessions = new MockMongoCollection();
const mockSets = new MockMongoCollection();
const mockRoutines = new MockMongoCollection();
const mockRoutineExercises = new MockMongoCollection();
const mockUsers = new MockMongoCollection();
const mockExercises = new MockMongoCollection();
const mockPushSubscriptions = new MockMongoCollection();
const mockRestNotifications = new MockMongoCollection();

const mockDb = {
  collection: (name: string) => {
    switch (name) {
      case "workout_sessions":
        return mockSessions;
      case "sets":
        return mockSets;
      case "routines":
        return mockRoutines;
      case "routine_exercises":
        return mockRoutineExercises;
      case "users":
        return mockUsers;
      case "exercises":
        return mockExercises;
      case "push_subscriptions":
        return mockPushSubscriptions;
      case "rest_notifications":
        return mockRestNotifications;
      default:
        throw new Error(`Unknown collection: ${name}`);
    }
  },
};

(global as any)._mongoClientPromise = Promise.resolve({
  db: () => mockDb,
});

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
    return new Response("Not Found", { status: 404 });
  };
}

async function runCalendarTests() {
  console.log("\n========================================================");
  console.log("SCULP'D 2.0 TASK 03: WORKOUT CALENDAR & BACKFILL TESTS");
  console.log("========================================================\n");

  setupFetchMock();

  await db.delete();
  await db.open();

  mockSessions.clear();
  mockSets.clear();
  mockRoutines.clear();
  mockRoutineExercises.clear();
  mockUsers.clear();
  mockExercises.clear();

  // Create test athlete
  const athlete = await createUser({
    displayName: "Maya",
    pin: "1234",
    avatarColor: "violet",
  });
  const token = await createSessionToken(athlete.id);

  // Create test routine
  const routine = await createRoutine(athlete.id, {
    name: "Lower Body Focus",
    description: "Glutes & Hamstrings",
    exercises: [
      {
        exerciseId: "ex_squat",
        targetSets: 3,
        targetReps: "8-10",
        restSeconds: 90,
      },
      {
        exerciseId: "ex_rdl",
        targetSets: 3,
        targetReps: "10-12",
        restSeconds: 60,
      },
    ],
  });

  console.log("--- 1. Correct Calendar Markers for Completed Sessions ---");
  // Create a completed workout session on 2026-10-10
  const session1 = await startWorkoutSession(athlete.id, routine.id);
  await logUserSet(athlete.id, session1.id, "ex_squat", 185, 8);
  await completeWorkoutSession(athlete.id, session1.id);
  // Shift to 2026-10-10
  await updateWorkoutSessionDate(athlete.id, session1.id, "2026-10-10");

  const monthData1 = await getCalendarMonthData(athlete.id, 2026, 9); // Month 9 is October
  assert(monthData1.daysWithCompletedWorkouts.has("2026-10-10"), "October 10 marked with completed workout");
  assert(!monthData1.daysWithInProgressWorkouts.has("2026-10-10"), "October 10 is not marked in-progress");
  assert(monthData1.monthStats.totalCompletedWorkouts === 1, "Month stats reports 1 completed workout");
  assert(monthData1.monthStats.activeDaysCount === 1, "Month stats reports 1 active training day");

  console.log("\n--- 2. Multiple Sessions on One Day ---");
  // Log second workout on same day (October 10)
  const session2 = await startWorkoutSession(athlete.id, routine.id);
  await logUserSet(athlete.id, session2.id, "ex_rdl", 135, 10);
  await completeWorkoutSession(athlete.id, session2.id);
  await updateWorkoutSessionDate(athlete.id, session2.id, "2026-10-10");

  const monthData2 = await getCalendarMonthData(athlete.id, 2026, 9);
  const oct10Sessions = monthData2.sessionsByDate.get("2026-10-10");
  assert(Boolean(oct10Sessions), "October 10 has sessions list");
  assert(oct10Sessions?.length === 2, "October 10 contains exactly 2 sessions");
  assert(monthData2.monthStats.totalCompletedWorkouts === 2, "Month stats reports 2 completed workouts");
  assert(monthData2.monthStats.activeDaysCount === 1, "Month stats still reports 1 active day (multiple sessions on 1 day)");

  console.log("\n--- 3. In-Progress Versus Completed Sessions ---");
  // Start an in-progress session on October 12
  const inProgressSession = await startWorkoutSession(athlete.id, routine.id);
  await updateWorkoutSessionDate(athlete.id, inProgressSession.id, "2026-10-12");

  const monthData3 = await getCalendarMonthData(athlete.id, 2026, 9);
  assert(monthData3.daysWithInProgressWorkouts.has("2026-10-12"), "October 12 marked as in-progress workout");
  assert(!monthData3.daysWithCompletedWorkouts.has("2026-10-12"), "October 12 not marked as completed yet");

  // Complete the in-progress session
  await completeWorkoutSession(athlete.id, inProgressSession.id);
  const monthData3Completed = await getCalendarMonthData(athlete.id, 2026, 9);
  assert(monthData3Completed.daysWithCompletedWorkouts.has("2026-10-12"), "October 12 now marked as completed");
  assert(!monthData3Completed.daysWithInProgressWorkouts.has("2026-10-12"), "October 12 no longer in-progress");

  console.log("\n--- 4. Month Boundaries, Leap Years & Local Time-Zone Behavior ---");
  // Leap year: February 2028 has 29 days
  const feb2028Days = getCalendarMonthDays(2028, 1); // Month 1 is February
  const feb2028CurrentMonthDays = feb2028Days.filter((d) => d.isCurrentMonth);
  assert(feb2028CurrentMonthDays.length === 29, "Leap year February 2028 has 29 days");
  assert(feb2028CurrentMonthDays.some((d) => d.dateKey === "2028-02-29"), "February 29 exists in leap year 2028");

  // Non-leap year: February 2026 has 28 days
  const feb2026Days = getCalendarMonthDays(2026, 1);
  const feb2026CurrentMonthDays = feb2026Days.filter((d) => d.isCurrentMonth);
  assert(feb2026CurrentMonthDays.length === 28, "Non-leap year February 2026 has 28 days");

  // Month boundary padding: grid is multiple of 7
  assert(feb2028Days.length % 7 === 0, "Grid size is a multiple of 7 (full weeks)");

  // Local time zone date calculation
  // Create a local date at 11:45 PM
  const lateNight = new Date(2026, 9, 14, 23, 45, 0); // Oct 14, 11:45 PM local
  const localKey = getLocalDateKey(lateNight);
  assert(localKey === "2026-10-14", "Late night local workout retains local date (not shifted to next day UTC)");

  console.log("\n--- 5. Empty History and Future Dates ---");
  const athleteEmpty = await createUser({
    displayName: "New Athlete",
    pin: "4321",
    avatarColor: "cyan",
  });
  const emptyMonthData = await getCalendarMonthData(athleteEmpty.id, 2026, 9);
  assert(emptyMonthData.daysWithCompletedWorkouts.size === 0, "Empty history has 0 completed workout days");
  assert(emptyMonthData.monthStats.totalCompletedWorkouts === 0, "Empty history reports 0 total completed workouts");
  assert(emptyMonthData.monthStats.activeDaysCount === 0, "Empty history reports 0 active days");

  // Future dates check
  const futureDays = emptyMonthData.days.filter((d) => d.isFuture);
  assert(futureDays.length > 0, "Future calendar days correctly identified");
  const firstFuture = futureDays[0];
  assert(firstFuture.isFuture === true, "Day marked with isFuture: true");

  console.log("\n--- 6. Backfilling a Historical Workout Date ---");
  const backfilledSession = await backfillHistoricalWorkoutSession(athlete.id, {
    routineId: routine.id,
    historicalDate: "2026-09-15",
    durationMinutes: 50,
    notes: "Completed while traveling in September",
  });
  assert(Boolean(backfilledSession), "Backfilled session created");
  assert(backfilledSession.status === "completed", "Backfilled session has status 'completed'");
  assert(getLocalDateKey(backfilledSession.startedAt) === "2026-09-15", "Backfilled session startedAt is 2026-09-15");
  assert(backfilledSession.notes === "Completed while traveling in September", "Preserved session notes");
  assert(backfilledSession.routineName === "Lower Body Focus", "Snapshotted routine name");
  assert(Boolean(backfilledSession.exerciseSnapshots && backfilledSession.exerciseSnapshots.length === 2), "Captured exercise snapshots");

  // Verify September calendar reflects backfilled session
  const sepMonthData = await getCalendarMonthData(athlete.id, 2026, 8); // Month 8 is September
  assert(sepMonthData.daysWithCompletedWorkouts.has("2026-09-15"), "September calendar shows completed workout on 2026-09-15");

  console.log("\n--- 7. Correcting a Session Date Without Corrupting Sets or Snapshots ---");
  // Start session today, log sets, complete it
  const sessionToday = await startWorkoutSession(athlete.id, routine.id);
  const set1 = await logUserSet(athlete.id, sessionToday.id, "ex_squat", 205, 6);
  const set2 = await logUserSet(athlete.id, sessionToday.id, "ex_squat", 215, 4);
  const completedToday = await completeWorkoutSession(athlete.id, sessionToday.id);

  const initialDurationMs =
    new Date(completedToday.completedAt!).getTime() - new Date(completedToday.startedAt).getTime();

  // Correct date to 2026-10-05
  const correctedSession = await updateWorkoutSessionDate(athlete.id, sessionToday.id, "2026-10-05");
  assert(getLocalDateKey(correctedSession.startedAt) === "2026-10-05", "startedAt corrected to 2026-10-05");
  assert(getLocalDateKey(correctedSession.completedAt!) === "2026-10-05", "completedAt corrected to 2026-10-05");

  // Verify duration preserved exactly
  const correctedDurationMs =
    new Date(correctedSession.completedAt!).getTime() - new Date(correctedSession.startedAt).getTime();
  assert(correctedDurationMs === initialDurationMs, "Session duration strictly preserved across date correction");

  // Verify sets were NOT corrupted or rewritten
  const setsAfterDateCorrection = await getUserSetsForSession(athlete.id, sessionToday.id);
  assert(setsAfterDateCorrection.length === 2, "Exactly 2 sets preserved");
  assert(setsAfterDateCorrection[0].id === set1.id, "Set 1 ID unchanged");
  assert(setsAfterDateCorrection[0].weight === 205, "Set 1 weight unchanged");
  assert(setsAfterDateCorrection[0].reps === 6, "Set 1 reps unchanged");
  assert(setsAfterDateCorrection[0].createdAt === set1.createdAt, "Set 1 createdAt timestamp strictly preserved (not rewritten)");
  assert(setsAfterDateCorrection[1].id === set2.id, "Set 2 ID unchanged");
  assert(setsAfterDateCorrection[1].weight === 215, "Set 2 weight unchanged");
  assert(setsAfterDateCorrection[1].createdAt === set2.createdAt, "Set 2 createdAt timestamp strictly preserved");

  // Verify calendar updated to new date
  const octAfterCorrection = await getCalendarMonthData(athlete.id, 2026, 9);
  assert(octAfterCorrection.daysWithCompletedWorkouts.has("2026-10-05"), "Session now appears on October 5 in calendar");

  console.log("\n--- 8. Persistence After Reload ---");
  // Simulate reload by closing and reopening IndexedDB
  await db.close();
  await db.open();

  const reloadedSession = await getWorkoutSessionById(athlete.id, sessionToday.id);
  assert(Boolean(reloadedSession), "Session retrieved after reload");
  assert(getLocalDateKey(reloadedSession!.startedAt) === "2026-10-05", "Corrected date persists after reload");

  const reloadedSets = await getUserSetsForSession(athlete.id, sessionToday.id);
  assert(reloadedSets.length === 2, "Sets persist after reload");
  assert(reloadedSets[0].weight === 205, "Set weights persist after reload");

  console.log("\n--- 9. Sync Queue Behavior and Remote Persistence ---");
  // Verify syncQueue contains update item for the corrected session
  const queueItems = (await db.syncQueue
    .where("userId")
    .equals(athlete.id)
    .filter((q) => q.entityId === sessionToday.id && q.operation === "update")
    .toArray()).sort((a, b) => a.timestamp - b.timestamp);
  assert(queueItems.length >= 1, "SyncQueue contains update mutation for corrected session");
  const lastUpdateQueueItem = queueItems[queueItems.length - 1];
  assert(getLocalDateKey(lastUpdateQueueItem.payload.startedAt) === "2026-10-05", "Queue payload has corrected date");
  assert(Boolean(lastUpdateQueueItem.payload.updatedAt), "Queue payload has fresh updatedAt timestamp");

  // Push to remote mock MongoDB
  const pushRes = await pushPendingMutations(athlete.id, token);
  assert(pushRes.success === true, "Push request succeeded");

  // Check mock MongoDB session record
  const mongoSession = mockSessions.get(sessionToday.id);
  assert(Boolean(mongoSession), "Session synced to MongoDB");
  assert(getLocalDateKey(mongoSession.startedAt) === "2026-10-05", "MongoDB session record has corrected date 2026-10-05");

  console.log("\n--- 10. Existing PR Calculations & Workout History Remaining Correct ---");
  // Verify workout history summaries
  const summaries = await getCompletedWorkoutSummaries(athlete.id);
  assert(summaries.length >= 4, "Summaries contain all completed workouts");

  // Verify reverse chronological ordering
  for (let i = 0; i < summaries.length - 1; i++) {
    const timeA = new Date(summaries[i].completedAt).getTime();
    const timeB = new Date(summaries[i + 1].completedAt).getTime();
    assert(timeA >= timeB, "Workout summaries strictly ordered reverse chronologically");
  }

  // Verify detail view of corrected session
  const detail = await getCompletedWorkoutDetail(athlete.id, sessionToday.id);
  assert(Boolean(detail), "Completed detail retrieved");
  assert(detail?.totalSets === 2, "Detail has 2 sets");
  assert(Boolean(detail?.formattedDate.includes("October 5")), "Detail formatted date reflects corrected date (October 5)");

  // Verify PR history evaluation
  const prs = await getAllPRHistory(athlete.id);
  assert(Array.isArray(prs), "PR history retrieved successfully");

  console.log("\n========================================================");
  console.log("✅ ALL 10 WORKOUT CALENDAR & BACKFILL TESTS PASSED 100%!");
  console.log("========================================================\n");
}

runCalendarTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
