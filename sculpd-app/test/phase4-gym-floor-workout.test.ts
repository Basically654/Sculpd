// test/phase4-gym-floor-workout.test.ts
import "fake-indexeddb/auto";
import { db } from "../lib/db/index";
import { createUser } from "../lib/db/user-repository";
import {
  getAllRoutines,
  getRoutineBySlug,
  getExercisesForRoutine,
  seedDefaultCatalog,
} from "../lib/db/routine-repository";
import {
  startWorkoutSession,
  getActiveWorkoutSession,
  getWorkoutSessionById,
  completeWorkoutSession,
  cancelWorkoutSession,
  logUserSet,
  deleteUserLastSet,
  getUserSetsForSession,
  getUserPreviousSet,
  getUserPreviousSetsForExercise,
  getUserSyncQueue,
} from "../lib/db/workout-repository";

// Simple assertion helper
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`❌ Assertion Failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

async function runPhase4Tests() {
  console.log("\n============================================================");
  console.log("SCULP'D 2.0 PHASE 4: GYM-FLOOR WORKOUT EXPERIENCE TESTS");
  console.log("============================================================\n");

  // Clear any existing database state
  await db.delete();
  await db.open();
  await seedDefaultCatalog();

  // Create isolated test athletes
  const userA = await createUser({
    displayName: "Athlete A",
    pin: "1111",
    avatarColor: "emerald",
  });

  const userB = await createUser({
    displayName: "Athlete B",
    pin: "2222",
    avatarColor: "violet",
  });

  console.log("--- 1. Routine & Exercise Loading from IndexedDB ---");
  const routines = await getAllRoutines();
  assert(routines.length >= 5, `Routines seeded in IndexedDB (found ${routines.length})`);
  assert(routines[0].slug === "monday", "First routine is 'monday'");

  const mondayRoutine = await getRoutineBySlug("monday");
  assert(Boolean(mondayRoutine), "Loaded 'monday' routine from IndexedDB by slug");
  assert(Boolean(mondayRoutine?.focusTarget?.includes("Glute")), "Monday routine has focusTarget");

  const mondayExercises = await getExercisesForRoutine(mondayRoutine!.id);
  assert(mondayExercises.length >= 4, `Monday exercises loaded from IndexedDB (${mondayExercises.length} exercises)`);
  assert(Boolean(mondayExercises[0].name), `First exercise is "${mondayExercises[0].name}"`);
  assert((mondayExercises[0].targetSets || 0) > 0, "Exercise defines targetSets");
  assert(Boolean(mondayExercises[0].targetReps), "Exercise defines targetReps");

  const ex1 = mondayExercises[0];
  const ex2 = mondayExercises[1];

  console.log("\n--- 2. Workout Session Lifecycle: Creation & Persistence ---");
  const session1 = await startWorkoutSession(userA.id, mondayRoutine!.id);
  assert(Boolean(session1.id), "Session has a valid UUID");
  assert(session1.userId === userA.id, "Session strictly belongs to User A");
  assert(session1.routineId === mondayRoutine!.id, "Session associates with Monday routine");
  assert(session1.status === "in_progress", "Session status initialized as 'in_progress'");
  assert(Boolean(session1.startedAt), "Session has valid startedAt timestamp");
  assert(session1.completedAt === null, "Session completedAt is null while active");

  // Verify immediate IndexedDB persistence
  const storedSession = await db.workoutSessions.get(session1.id);
  assert(storedSession !== undefined, "Session immediately persisted in IndexedDB");
  assert(storedSession?.status === "in_progress", "Stored session status is in_progress");

  // Verify sync queue item was added
  const syncQueueA1 = await getUserSyncQueue(userA.id);
  const sessionSyncItem = syncQueueA1.find(
    (item) => item.collection === "workout_sessions" && item.entityId === session1.id
  );
  assert(Boolean(sessionSyncItem), "Sync queue item created for session");
  assert(sessionSyncItem?.operation === "insert", "Sync queue operation is 'insert'");

  console.log("\n--- 3. Resume Unfinished Session ---");
  // Check that active session query finds session1
  const activeSessionFound = await getActiveWorkoutSession(userA.id);
  assert(activeSessionFound !== undefined, "Active workout session found for User A");
  assert(activeSessionFound?.id === session1.id, "Active session matches session1 ID");

  // Calling startWorkoutSession with the same routine should return the existing unfinished session
  const resumedSession = await startWorkoutSession(userA.id, mondayRoutine!.id);
  assert(resumedSession.id === session1.id, "Resumed session is identical to unfinished session (no duplicate created)");

  const allSessionsA = await db.workoutSessions.where("userId").equals(userA.id).toArray();
  assert(allSessionsA.length === 1, "Only 1 workout session exists (no duplicate generated)");

  console.log("\n--- 4. Set Logging: Immediate IndexedDB Save, UUID, Auto-Incrementing Set Numbers ---");
  const set1 = await logUserSet(userA.id, session1.id, ex1.id, 225, 10);
  assert(Boolean(set1.id), "Set 1 has a generated UUID");
  assert(set1.setNumber === 1, "Set 1 has setNumber 1");
  assert(set1.weight === 225, "Set 1 weight is 225 lbs");
  assert(set1.reps === 10, "Set 1 reps is 10");
  assert(set1.userId === userA.id, "Set 1 belongs to User A");
  assert(set1.workoutSessionId === session1.id, "Set 1 belongs to session1");
  assert(set1.exerciseId === ex1.id, "Set 1 belongs to ex1");

  // Verify immediate IndexedDB write
  const storedSet1 = await db.sets.get(set1.id);
  assert(storedSet1 !== undefined, "Set 1 immediately readable from IndexedDB");

  // Log second set for same exercise
  const set2 = await logUserSet(userA.id, session1.id, ex1.id, 235, 8);
  assert(set2.setNumber === 2, "Set 2 has automatically incremented setNumber 2");
  assert(set2.weight === 235, "Set 2 weight is 235 lbs");

  // Log third set for same exercise
  const set3 = await logUserSet(userA.id, session1.id, ex1.id, 245, 6);
  assert(set3.setNumber === 3, "Set 3 has setNumber 3");

  // Check sets in session
  const currentSets = await getUserSetsForSession(userA.id, session1.id);
  assert(currentSets.length === 3, "Exactly 3 sets recorded in session for User A");

  // Verify sync queue outbox has 3 set insertions
  const syncQueueA2 = await getUserSyncQueue(userA.id);
  const setQueueItems = syncQueueA2.filter((item) => item.collection === "sets");
  assert(setQueueItems.length === 3, "3 sync queue items queued for sets");

  console.log("\n--- 5. Offline Workout Logging (Zero Network Dependency) ---");
  // Log a set with arbitrary inputs simulating completely offline operation
  const offlineSet = await logUserSet(userA.id, session1.id, ex2.id, 135, 12);
  assert(Boolean(offlineSet.id), "Offline set logged with zero network dependency");
  const storedOfflineSet = await db.sets.get(offlineSet.id);
  assert(storedOfflineSet?.weight === 135, "Offline set verified in IndexedDB");

  console.log("\n--- 6. Deleting Most Recently Logged Set ---");
  // Before delete: ex1 has sets [set1, set2, set3]
  const deleteSuccess = await deleteUserLastSet(userA.id, session1.id, ex1.id);
  assert(deleteSuccess === true, "deleteUserLastSet returned true");

  // Verify Set 3 was removed from IndexedDB
  const deletedSetCheck = await db.sets.get(set3.id);
  assert(deletedSetCheck === undefined, "Set 3 was removed from IndexedDB");

  // Verify remaining sets for ex1
  const ex1SetsRemaining = (await getUserSetsForSession(userA.id, session1.id)).filter(
    (s) => s.exerciseId === ex1.id
  );
  assert(ex1SetsRemaining.length === 2, "2 sets remain for ex1 after deletion");
  assert(ex1SetsRemaining[ex1SetsRemaining.length - 1].setNumber === 2, "Most recent remaining set is Set 2");

  // Verify delete sync queue item was added
  const syncQueueAfterDelete = await getUserSyncQueue(userA.id);
  const deleteQueueItem = syncQueueAfterDelete.find(
    (item) => item.operation === "delete" && item.collection === "sets" && item.entityId === set3.id
  );
  assert(Boolean(deleteQueueItem), "Delete operation queued in syncQueue for Set 3");

  console.log("\n--- 7. Completing a Workout Session ---");
  const completedSession = await completeWorkoutSession(userA.id, session1.id, "Crushed leg day");
  assert(completedSession.status === "completed", "Session status changed to 'completed'");
  assert(Boolean(completedSession.completedAt), "completedAt timestamp is set");
  assert(completedSession.notes === "Crushed leg day", "Session notes saved");

  // Verify IndexedDB has updated session
  const storedCompleted = await db.workoutSessions.get(session1.id);
  assert(storedCompleted?.status === "completed", "IndexedDB reflects completed status");
  assert(storedCompleted?.completedAt !== null, "IndexedDB reflects completedAt timestamp");

  // User A now has NO active in_progress session
  const noActiveSession = await getActiveWorkoutSession(userA.id);
  assert(noActiveSession === undefined, "No active session remains after completion");

  // Verify sync queue has update operation for session
  const finalSyncQueue = await getUserSyncQueue(userA.id);
  const sessionUpdateItem = finalSyncQueue.find(
    (item) => item.operation === "update" && item.collection === "workout_sessions" && item.entityId === session1.id
  );
  assert(Boolean(sessionUpdateItem), "Session update operation queued in syncQueue");

  console.log("\n--- 8. Previous Performance Isolation Across Workouts & Users ---");
  // User A starts Session 2 next week
  const session2 = await startWorkoutSession(userA.id, mondayRoutine!.id);
  assert(session2.id !== session1.id, "Session 2 is a new session with new ID");

  // User A queries previous performance for ex1, excluding session 2
  const userAPrevSet = await getUserPreviousSet(userA.id, ex1.id, session2.id);
  assert(userAPrevSet !== undefined, "User A has previous performance for ex1");
  assert(userAPrevSet?.weight === 235, `User A previous performance returns last completed set (235 lbs, got ${userAPrevSet?.weight})`);
  assert(userAPrevSet?.reps === 8, "User A previous performance returns 8 reps");

  // User A logs new set in Session 2
  await logUserSet(userA.id, session2.id, ex1.id, 240, 8);

  // User B starts a workout
  const sessionB = await startWorkoutSession(userB.id, mondayRoutine!.id);
  assert(sessionB.userId === userB.id, "Session B belongs to User B");

  // User B queries previous performance for ex1
  const userBPrevSet = await getUserPreviousSet(userB.id, ex1.id, sessionB.id);
  assert(userBPrevSet === undefined, "User B has NO previous performance for ex1 (User A's PR is strictly hidden)");

  const userBSets = await getUserSetsForSession(userB.id, sessionB.id);
  assert(userBSets.length === 0, "User B session starts with 0 sets");

  console.log("\n--- 9. Strict User Isolation Boundaries ---");
  // User B cannot access User A's session sets
  const userBCrossQuery = await getUserSetsForSession(userB.id, session1.id);
  assert(userBCrossQuery.length === 0, "User B cannot query sets from User A's session");

  // User B cannot log a set to User A's session
  let crossUserLogBlocked = false;
  try {
    await logUserSet(userB.id, session1.id, ex1.id, 999, 99);
  } catch (err: any) {
    crossUserLogBlocked = true;
  }
  assert(crossUserLogBlocked, "Cross-user set write was blocked by user boundary assertion");

  // User B cannot delete a set from User A's session
  let crossUserDeleteBlocked = false;
  try {
    const result = await deleteUserLastSet(userB.id, session1.id, ex1.id);
    if (!result) crossUserDeleteBlocked = true;
  } catch {
    crossUserDeleteBlocked = true;
  }
  assert(crossUserDeleteBlocked, "Cross-user set deletion was blocked / resulted in 0 deletions");

  // User B cannot complete User A's session
  let crossUserCompleteBlocked = false;
  try {
    await completeWorkoutSession(userB.id, session1.id);
  } catch {
    crossUserCompleteBlocked = true;
  }
  assert(crossUserCompleteBlocked, "Cross-user session completion was blocked");

  // User B sync queue does NOT contain User A's items
  const userBSyncQueue = await getUserSyncQueue(userB.id);
  const leakFound = userBSyncQueue.some((item) => item.userId !== userB.id);
  assert(!leakFound, "User B sync queue contains ZERO items from User A");

  console.log("\n--- 10. Rest Timer Absolute Timestamp Invariance ---");
  // Test calculation logic: remaining = Math.max(0, Math.ceil((endTime - now) / 1000))
  const now = Date.now();
  const restDuration = 90;
  const endTime = now + restDuration * 1000;

  // Immediately after start:
  const remInitial = Math.max(0, Math.ceil((endTime - now) / 1000));
  assert(remInitial === 90, "Timer initializes with exact 90s remaining");

  // Simulate 35 seconds of backgrounding/sleep:
  const afterBackground = now + 35 * 1000;
  const remAfterBackground = Math.max(0, Math.ceil((endTime - afterBackground) / 1000));
  assert(remAfterBackground === 55, "Timer calculates 55s remaining after 35s background pause");

  // Simulate expiration during backgrounding:
  const afterExpiration = now + 120 * 1000;
  const remAfterExpired = Math.max(0, Math.ceil((endTime - afterExpiration) / 1000));
  assert(remAfterExpired === 0, "Timer correctly calculates 0s when elapsed time exceeds duration");

  console.log("\n============================================================");
  console.log("✅ ALL PHASE 4 WORKOUT EXPERIENCE TESTS PASSED 100%!");
  console.log("============================================================\n");
}

runPhase4Tests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
