// test/multi-set-clarity.test.ts
import "fake-indexeddb/auto";
import { db } from "../lib/db/index";
import { createUser } from "../lib/db/user-repository";
import { createRoutine } from "../lib/db/routine-repository";
import {
  startWorkoutSession,
  logUserSet,
  getUserSetsForSession,
  deleteUserLastSet,
  completeWorkoutSession,
  getWorkoutSessionById,
} from "../lib/db/workout-repository";
import {
  getSetProgressLabel,
  getSetProgressHeadline,
  isTargetReached,
  formatSetSummary,
} from "../lib/load/load-utils";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`❌ Assertion Failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

async function runMultiSetClarityTests() {
  console.log("\n============================================================");
  console.log("SCULP'D 2.0: MULTI-SET CLARITY & PROGRESSION TESTS");
  console.log("============================================================\n");

  // 1. Unit Tests: Set Progress Label and Headline formatting
  console.log("--- 1. Set Progress Label Formatter Tests ---");
  // Target of 3 sets
  assert(getSetProgressLabel(1, 3) === "Set 1 of 3", "First set of 3 returns 'Set 1 of 3'");
  assert(getSetProgressHeadline(1, 3) === "Set 1 of 3", "Headline for set 1 returns 'Set 1 of 3'");
  assert(!isTargetReached(0, 3), "Target not reached before any sets");

  assert(getSetProgressLabel(2, 3) === "Set 2 of 3", "Second set of 3 returns 'Set 2 of 3'");
  assert(getSetProgressHeadline(2, 3) === "Set 2 of 3", "Headline for set 2 returns 'Set 2 of 3'");
  assert(!isTargetReached(1, 3), "Target not reached after 1 of 3 sets");

  assert(getSetProgressLabel(3, 3) === "Set 3 of 3", "Third set of 3 returns 'Set 3 of 3'");
  assert(getSetProgressHeadline(3, 3) === "Set 3 of 3", "Headline for set 3 returns 'Set 3 of 3'");
  assert(!isTargetReached(2, 3), "Target not reached after 2 of 3 sets");

  // Final set completed (3 of 3)
  assert(isTargetReached(3, 3), "Target is reached when completed sets equals target sets (3 of 3)");

  // Extra sets beyond target
  assert(getSetProgressLabel(4, 3) === "Set 4", "Fourth set returns 'Set 4' without repeating target count");
  assert(getSetProgressHeadline(4, 3) === "Set 4 (Extra)", "Headline for fourth set returns 'Set 4 (Extra)'");
  assert(isTargetReached(4, 3), "Target remains reached when extra sets are logged");

  // Routine with no target sets configured (null or undefined)
  assert(getSetProgressLabel(1, null) === "Set 1", "No target sets returns 'Set 1'");
  assert(getSetProgressLabel(2, null) === "Set 2", "No target sets returns 'Set 2'");
  assert(getSetProgressLabel(1, 0) === "Set 1", "Zero target sets returns 'Set 1'");
  assert(!isTargetReached(1, null), "Target never flagged as reached when no target is configured");

  console.log("\n--- 2. First Set Displays Correctly ---");
  await db.delete();
  await db.open();

  const user = await createUser({
    displayName: "Clarity Test Athlete",
    pin: "9999",
    bodyweight: 185,
  });

  const routine = await createRoutine(user.id, {
    name: "Clarity Push Routine",
    exercises: [
      {
        exerciseId: "std_ex_bench_press",
        targetSets: 3,
        targetReps: "5",
        restSeconds: 90,
      },
    ],
  });

  const session = await startWorkoutSession(user.id, routine.id);
  const initialSets = await getUserSetsForSession(user.id, session.id);
  assert(initialSets.length === 0, "No sets logged initially");

  const currentSetNum0 = initialSets.length + 1;
  const targetSets0 = 3;
  assert(currentSetNum0 === 1, "Current set number is 1 before logging");
  assert(getSetProgressLabel(currentSetNum0, targetSets0) === "Set 1 of 3", "Displays 'Set 1 of 3' before first set");

  console.log("\n--- 3. Logging Increments the Current Set ---");
  const set1 = await logUserSet(user.id, session.id, "std_ex_bench_press", 185, 5);
  assert(set1.setNumber === 1, "First set assigned setNumber 1");
  assert(set1.weight === 185 && set1.reps === 5, "Set 1 recorded weight 185 and reps 5");

  const setsAfter1 = await getUserSetsForSession(user.id, session.id);
  assert(setsAfter1.length === 1, "Exactly 1 set in session");
  const currentSetNum1 = setsAfter1.length + 1;
  assert(currentSetNum1 === 2, "Current set number increments to 2");
  assert(getSetProgressLabel(currentSetNum1, targetSets0) === "Set 2 of 3", "Displays 'Set 2 of 3' after first set");

  console.log("\n--- 4. Multiple Completed Sets Remain Visible ---");
  const set2 = await logUserSet(user.id, session.id, "std_ex_bench_press", 185, 5);
  assert(set2.setNumber === 2, "Second set assigned setNumber 2");

  const setsAfter2 = await getUserSetsForSession(user.id, session.id);
  assert(setsAfter2.length === 2, "Both sets retrieved from database");
  assert(setsAfter2[0].setNumber === 1 && setsAfter2[0].weight === 185, "Set 1 visible with correct telemetry");
  assert(setsAfter2[1].setNumber === 2 && setsAfter2[1].weight === 185, "Set 2 visible with correct telemetry");
  assert(formatSetSummary(setsAfter2[0]) === "185 lbs × 5", "Set 1 formatted correctly as '185 lbs × 5'");
  assert(formatSetSummary(setsAfter2[1]) === "185 lbs × 5", "Set 2 formatted correctly as '185 lbs × 5'");

  const currentSetNum2 = setsAfter2.length + 1;
  assert(currentSetNum2 === 3, "Current set number increments to 3");
  assert(getSetProgressLabel(currentSetNum2, targetSets0) === "Set 3 of 3", "Displays 'Set 3 of 3' before final target set");
  assert(!isTargetReached(setsAfter2.length, targetSets0), "Target is not yet reached with 2 of 3 sets");

  console.log("\n--- 5. Final Target Set Behaves Correctly ---");
  const set3 = await logUserSet(user.id, session.id, "std_ex_bench_press", 185, 5);
  assert(set3.setNumber === 3, "Third set assigned setNumber 3");

  const setsAfter3 = await getUserSetsForSession(user.id, session.id);
  assert(setsAfter3.length === 3, "All 3 target sets retrieved from database");
  assert(isTargetReached(setsAfter3.length, targetSets0), "isTargetReached is true after completing 3 of 3 sets");
  assert(
    setsAfter3.map((s) => s.setNumber).join(",") === "1,2,3",
    "All completed sets remain visible in chronological order: 1, 2, 3"
  );

  console.log("\n--- 6. Extra Sets Are Allowed Without Corrupting Workout ---");
  const currentSetNum3 = setsAfter3.length + 1;
  assert(currentSetNum3 === 4, "Current set number for extra set is 4");
  assert(getSetProgressLabel(currentSetNum3, targetSets0) === "Set 4", "Extra set progress text displays 'Set 4'");
  assert(getSetProgressHeadline(currentSetNum3, targetSets0) === "Set 4 (Extra)", "Extra set headline displays 'Set 4 (Extra)'");

  const set4 = await logUserSet(user.id, session.id, "std_ex_bench_press", 195, 3);
  assert(set4.setNumber === 4, "Extra set assigned setNumber 4");
  assert(set4.weight === 195 && set4.reps === 3, "Set 4 logged 195 lbs × 3");

  const setsAfter4 = await getUserSetsForSession(user.id, session.id);
  assert(setsAfter4.length === 4, "All 4 sets persisted in database");
  assert(isTargetReached(setsAfter4.length, targetSets0), "Target reached remains true after extra set");

  console.log("\n--- 7. Existing Session Persistence Still Works ---");
  const deleted = await deleteUserLastSet(user.id, session.id, "std_ex_bench_press");
  assert(deleted, "Undo / delete last set succeeds");

  const setsAfterUndo = await getUserSetsForSession(user.id, session.id);
  assert(setsAfterUndo.length === 3, "Reverts cleanly to 3 sets after deleting set 4");
  assert(setsAfterUndo[setsAfterUndo.length - 1].setNumber === 3, "Last set is now set 3");

  const completedSession = await completeWorkoutSession(user.id, session.id, "Smooth 3-set bench press");
  assert(completedSession.status === "completed", "Workout session status is 'completed'");
  assert(completedSession.completedAt !== null, "completedAt timestamp is saved");

  const persistedSession = await getWorkoutSessionById(user.id, session.id);
  assert(persistedSession?.status === "completed", "Persisted session in IndexedDB is marked completed");

  const finalSets = await getUserSetsForSession(user.id, session.id);
  assert(finalSets.length === 3, "All 3 sets preserved with completed session");

  console.log("\n============================================================");
  console.log("✅ ALL MULTI-SET CLARITY & PROGRESSION TESTS PASSED 100%!");
  console.log("============================================================\n");
}

runMultiSetClarityTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
