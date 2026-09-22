// test/pr-detection.test.ts
import { detectPersonalRecord, calculateE1RM } from "../lib/pr/pr-detector";
import { WorkoutSet } from "../types/models";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`❌ Assertion Failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

function createMockSet(weight: number, reps: number): WorkoutSet {
  return {
    id: globalThis.crypto.randomUUID(),
    userId: "user-test",
    workoutSessionId: "session-test",
    exerciseId: "exercise-test",
    setNumber: 1,
    weight,
    reps,
    rpe: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function runPRTests() {
  console.log("\n============================================================");
  console.log("SCULP'D 2.0: PERSONAL RECORD (PR) DETECTION TESTS");
  console.log("============================================================\n");

  console.log("--- 1. First-Time Exercise (Baseline Non-PR) ---");
  const baselineResult = detectPersonalRecord(
    { weight: 225, reps: 5 },
    "Bench Press",
    []
  );
  assert(baselineResult.isPR === false, "First set ever does NOT trigger PR (establishes baseline)");

  console.log("\n--- 2. Ordinary Submaximal Sets (Non-PR) ---");
  const priorHistory = [
    createMockMock("prior-1", 185, 5),
    createMockMock("prior-2", 205, 5),
    createMockMock("prior-3", 225, 3), // E1RM ~ 247.5
  ];

  function createMockMock(id: string, weight: number, reps: number): WorkoutSet {
    return {
      ...createMockSet(weight, reps),
      id,
    };
  }

  const warmupSet = detectPersonalRecord(
    { weight: 135, reps: 10 },
    "Bench Press",
    priorHistory
  );
  assert(warmupSet.isPR === false, "Warmup set (135 × 10) is NOT a PR");

  const submaxSet = detectPersonalRecord(
    { weight: 205, reps: 3 },
    "Bench Press",
    priorHistory
  );
  assert(submaxSet.isPR === false, "Submaximal set (205 × 3 vs 205 × 5) is NOT a PR");

  const identicalSet = detectPersonalRecord(
    { weight: 225, reps: 3 },
    "Bench Press",
    priorHistory
  );
  assert(identicalSet.isPR === false, "Identical set (225 × 3 vs 225 × 3) is NOT a PR");

  console.log("\n--- 3. Legitimate Weight PR at Equal Reps ---");
  // Prior was 225 × 3; User lifts 230 × 3
  const weightPR = detectPersonalRecord(
    { weight: 230, reps: 3 },
    "Bench Press",
    priorHistory
  );
  assert(weightPR.isPR === true, "230 × 3 vs prior 225 × 3 correctly detected as PR");
  assert(weightPR.previous?.weight === 225, "Previous weight correctly resolved as 225");
  assert(weightPR.previous?.reps === 3, "Previous reps correctly resolved as 3");
  assert(weightPR.current?.weight === 230, "Current weight is 230");
  assert(weightPR.badgeText === "+5 lbs", "Badge indicates '+5 lbs'");

  console.log("\n--- 4. Legitimate Rep PR at Equal Weight ---");
  // Prior was 225 × 3; User lifts 225 × 5
  const repPR = detectPersonalRecord(
    { weight: 225, reps: 5 },
    "Bench Press",
    priorHistory
  );
  assert(repPR.isPR === true, "225 × 5 vs prior 225 × 3 correctly detected as PR");
  assert(repPR.previous?.reps === 3, "Previous reps was 3");
  assert(repPR.current?.reps === 5, "Current reps is 5");
  assert(repPR.badgeText === "+2 reps", "Badge indicates '+2 reps'");

  console.log("\n--- 5. All-Time Estimated 1RM PR ---");
  // Prior best E1RM was 225 × 3 = 247.5 lbs
  // User lifts 245 × 2: E1RM = 245 * (1 + 2/30) = 261.3 lbs
  const e1rmPR = detectPersonalRecord(
    { weight: 245, reps: 2 },
    "Bench Press",
    priorHistory
  );
  assert(e1rmPR.isPR === true, "245 × 2 correctly detected as PR (e1RM 261 lbs vs 247 lbs)");

  console.log("\n============================================================");
  console.log("✅ ALL PR DETECTION TESTS PASSED 100%!");
  console.log("============================================================\n");
}

runPRTests();
