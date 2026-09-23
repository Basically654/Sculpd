// test/bodyweight-exercises.test.ts
import "fake-indexeddb/auto";
import { db } from "../lib/db/index";
import { createUser, updateUserBodyweight, getUserById } from "../lib/db/user-repository";
import {
  seedExerciseCatalog,
  getExercises,
  createCustomExercise,
} from "../lib/db/exercise-repository";
import {
  createRoutine,
  getRoutineWithExercises,
} from "../lib/db/routine-repository";
import {
  startWorkoutSession,
  logUserSet,
  getUserSetsForSession,
  completeWorkoutSession,
  getUserSyncQueue,
} from "../lib/db/workout-repository";
import {
  isBodyweightExercise,
  getEffectiveLoad,
  formatSetLoad,
  formatSetSummary,
} from "../lib/load/load-utils";
import { detectPersonalRecord } from "../lib/pr/pr-detector";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`❌ Assertion Failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

async function runBodyweightTests() {
  console.log("\n============================================================");
  console.log("SCULP'D 2.0: FIRST-CLASS BODYWEIGHT & ADDED-WEIGHT EXERCISE TESTS");
  console.log("============================================================\n");

  // 1. Seed Exercise Catalog & Verify Load Type Classification
  console.log("--- 1. Exercise Catalog Load Type Classification ---");
  await seedExerciseCatalog();
  const catalog = await getExercises();

  const pullUps = catalog.find((e) => e.name === "Pull-Ups");
  const benchPress = catalog.find((e) => e.name === "Barbell Bench Press");
  const chestDips = catalog.find((e) => e.name === "Chest Dips");
  const pushUps = catalog.find((e) => e.name === "Push-Ups");

  assert(pullUps !== undefined, "Pull-Ups found in catalog");
  assert(pullUps?.loadType === "bodyweight", "Pull-Ups marked with loadType: 'bodyweight'");
  assert(isBodyweightExercise(pullUps), "isBodyweightExercise(pullUps) returns true");

  assert(chestDips?.loadType === "bodyweight", "Chest Dips marked with loadType: 'bodyweight'");
  assert(pushUps?.loadType === "bodyweight", "Push-Ups marked with loadType: 'bodyweight'");

  assert(benchPress !== undefined, "Barbell Bench Press found in catalog");
  assert(benchPress?.loadType === "weighted", "Bench Press marked with loadType: 'weighted'");
  assert(!isBodyweightExercise(benchPress), "isBodyweightExercise(benchPress) returns false");

  // Custom bodyweight exercise creation
  const customChinUps = await createCustomExercise("athlete-bw-1", {
    name: "Weighted Neutral Chin-Ups",
    category: "Back",
    equipment: "Bodyweight",
    loadType: "bodyweight",
  });
  assert(customChinUps.loadType === "bodyweight", "Custom Chin-Ups created with loadType: 'bodyweight'");
  assert(isBodyweightExercise(customChinUps), "isBodyweightExercise(customChinUps) returns true");

  // 2. Athlete Profile Creation with Profile Bodyweight
  console.log("\n--- 2. Athlete Profile Creation & Bodyweight Storage ---");
  const athlete = await createUser({
    displayName: "Marcus Strong",
    pin: "1234",
    avatarColor: "emerald",
    bodyweight: 195,
  });

  assert(athlete.bodyweight === 195, "Athlete profile stores bodyweight (195 lbs)");
  const fetchedUser = await getUserById(athlete.id);
  assert(fetchedUser?.bodyweight === 195, "IndexedDB user record confirms bodyweight 195 lbs");

  // 3. Routine Builder with Bodyweight & Weighted Exercises
  console.log("\n--- 3. Routine Configuration & Load Type Persistence ---");
  const routine = await createRoutine(athlete.id, {
    name: "Upper Power & Calisthenics",
    exercises: [
      {
        exerciseId: benchPress!.id,
        targetSets: 3,
        targetReps: "5",
        loadType: "weighted",
      },
      {
        exerciseId: pullUps!.id,
        targetSets: 3,
        targetReps: "8",
        loadType: "bodyweight",
      },
    ],
  });

  const routineWithEx = await getRoutineWithExercises(routine.id);
  assert(routineWithEx !== undefined, "Routine created with joined exercises");
  assert(routineWithEx!.exercises.length === 2, "Routine contains 2 exercises");
  assert(routineWithEx!.exercises[0].loadType === "weighted", "Exercise 1 config has loadType 'weighted'");
  assert(routineWithEx!.exercises[1].loadType === "bodyweight", "Exercise 2 config has loadType 'bodyweight'");

  // 4. Workout Session Snapshotting
  console.log("\n--- 4. Workout Session Snapshotting with Load Type ---");
  const session1 = await startWorkoutSession(athlete.id, routine.id);
  assert(session1.exerciseSnapshots !== undefined, "Session created immutable exercise snapshots");
  assert(session1.exerciseSnapshots!.length === 2, "Session snapshotted 2 exercises");
  assert(session1.exerciseSnapshots![0].loadType === "weighted", "Snapshot 1 preserved loadType: weighted");
  assert(session1.exerciseSnapshots![1].loadType === "bodyweight", "Snapshot 2 preserved loadType: bodyweight");

  // 5. Standard Weighted Exercise Logging (Bench Press: 185 lb × 5)
  console.log("\n--- 5. Standard Weighted Exercise Logging ---");
  const benchSet = await logUserSet(
    athlete.id,
    session1.id,
    benchPress!.id,
    185,
    5
  );

  assert(benchSet.weight === 185, "Bench set weight is 185 lbs");
  assert(benchSet.bodyweight === undefined, "Bench set bodyweight is undefined");
  assert(benchSet.addedWeight === undefined, "Bench set addedWeight is undefined");
  assert(getEffectiveLoad(benchSet) === 185, "Effective load for bench press is 185 lbs");
  assert(formatSetLoad(benchSet, false) === "185 lbs", "formatSetLoad returns '185 lbs'");
  assert(formatSetSummary(benchSet, false) === "185 lbs × 5", "formatSetSummary returns '185 lbs × 5'");

  // 6. Bodyweight Exercise Logging (Pull Ups: 195 lb BW × 8)
  console.log("\n--- 6. Pure Bodyweight Exercise Logging (0 Added Weight) ---");
  const bwSet = await logUserSet(
    athlete.id,
    session1.id,
    pullUps!.id,
    0, // 0 lbs added weight entered by athlete
    8,
    null,
    athlete.bodyweight, // 195 lbs profile bodyweight snapshot
    0 // addedWeight = 0
  );

  assert(bwSet.weight === 0, "Set raw weight is 0");
  assert(bwSet.bodyweight === 195, "Set captured athlete profile bodyweight (195 lbs)");
  assert(bwSet.addedWeight === 0, "Set addedWeight is 0");
  assert(getEffectiveLoad(bwSet) === 195, "Effective load for pure BW is 195 lbs (195 + 0)");
  assert(formatSetLoad(bwSet, true) === "BW", "formatSetLoad returns 'BW'");
  assert(formatSetSummary(bwSet, true) === "BW × 8", "formatSetSummary returns 'BW × 8'");

  // 7. Bodyweight + Added Load Logging (Pull Ups: 195 lb BW + 15 lb × 8)
  console.log("\n--- 7. Bodyweight + Added Load Logging (BW + 15 lbs) ---");
  const weightedBwSet = await logUserSet(
    athlete.id,
    session1.id,
    pullUps!.id,
    15, // 15 lbs added weight
    8,
    null,
    athlete.bodyweight, // 195 lbs profile bodyweight snapshot
    15 // addedWeight = 15
  );

  assert(weightedBwSet.weight === 15, "Set raw weight is 15");
  assert(weightedBwSet.bodyweight === 195, "Set captured athlete profile bodyweight (195 lbs)");
  assert(weightedBwSet.addedWeight === 15, "Set addedWeight is 15");
  assert(getEffectiveLoad(weightedBwSet) === 210, "Effective load is 210 lbs (195 + 15)");
  assert(formatSetLoad(weightedBwSet, true) === "BW + 15 lbs", "formatSetLoad returns 'BW + 15 lbs'");
  assert(formatSetSummary(weightedBwSet, true) === "BW + 15 lbs × 8", "formatSetSummary returns 'BW + 15 lbs × 8'");

  // Complete session 1
  await completeWorkoutSession(athlete.id, session1.id);

  // 8. Profile Bodyweight Modification Immutability
  console.log("\n--- 8. Immutability of Historical Sets on Profile Bodyweight Change ---");
  // Athlete gains weight next month (195 -> 205 lbs)
  await updateUserBodyweight(athlete.id, 205);
  const updatedAthlete = await getUserById(athlete.id);
  assert(updatedAthlete?.bodyweight === 205, "Athlete profile bodyweight updated to 205 lbs");

  // Retrieve historical sets from session 1
  const session1Sets = await getUserSetsForSession(athlete.id, session1.id);
  const historicalBwSet = session1Sets.find((s) => s.id === bwSet.id);
  const historicalWeightedBwSet = session1Sets.find((s) => s.id === weightedBwSet.id);

  assert(historicalBwSet?.bodyweight === 195, "Historical BW set bodyweight remains 195 lbs (NOT mutated to 205)");
  assert(getEffectiveLoad(historicalBwSet!) === 195, "Historical BW set effective load remains 195 lbs");
  assert(historicalWeightedBwSet?.bodyweight === 195, "Historical BW+15 set bodyweight remains 195 lbs");
  assert(getEffectiveLoad(historicalWeightedBwSet!) === 210, "Historical BW+15 set effective load remains 210 lbs");

  // 9. Total Volume Calculation with Effective Load
  console.log("\n--- 9. Effective Load Total Volume Calculation ---");
  // Session 1 sets:
  // Bench: 185 lbs × 5 reps = 925 lbs
  // Pull-Ups set 1: (195 + 0) × 8 reps = 1560 lbs
  // Pull-Ups set 2: (195 + 15) × 8 reps = 1680 lbs
  // Expected Total Volume: 925 + 1560 + 1680 = 4165 lbs
  const totalVolume = session1Sets.reduce(
    (sum, s) => sum + getEffectiveLoad(s) * s.reps,
    0
  );
  assert(totalVolume === 4165, `Total session volume is exactly 4165 lbs (got ${totalVolume})`);

  // 10. Personal Record (PR) Detection for Bodyweight Exercises
  console.log("\n--- 10. PR Detection for Bodyweight Exercises ---");
  // Prior sets for Pull-Ups:
  // Set 1: BW + 0 lbs × 8 reps (effective: 195 lbs)
  // Set 2: BW + 15 lbs × 8 reps (effective: 210 lbs)
  const priorPullUpSets = [historicalBwSet!, historicalWeightedBwSet!];

  // Case A: Submaximal set (BW + 0 lbs × 6 reps) -> Non-PR
  const submaxCheck = detectPersonalRecord(
    { weight: 0, reps: 6, bodyweight: 205, addedWeight: 0 },
    "Pull-Ups",
    priorPullUpSets,
    true
  );
  assert(submaxCheck.isPR === false, "Submaximal bodyweight set (BW × 6 vs prior BW × 8) is NOT a PR");

  // Case B: Rep PR at Same Load (BW + 15 lbs × 10 reps vs prior BW + 15 lbs × 8 reps)
  const repPRCheck = detectPersonalRecord(
    { weight: 15, reps: 10, bodyweight: 195, addedWeight: 15 },
    "Pull-Ups",
    priorPullUpSets,
    true
  );
  assert(repPRCheck.isPR === true, "BW + 15 lbs × 10 vs BW + 15 lbs × 8 detected as PR");
  assert(repPRCheck.prType === "reps", "PR type is 'reps'");
  assert(repPRCheck.badgeText === "+2 reps", "PR badge indicates '+2 reps'");
  assert(repPRCheck.current?.displayText === "BW + 15 lbs", "Current display text is 'BW + 15 lbs'");

  // Case C: Weight PR (BW + 25 lbs × 5 reps vs prior max BW + 15 lbs)
  const weightPRCheck = detectPersonalRecord(
    { weight: 25, reps: 5, bodyweight: 195, addedWeight: 25 },
    "Pull-Ups",
    priorPullUpSets,
    true
  );
  assert(weightPRCheck.isPR === true, "BW + 25 lbs vs prior BW + 15 lbs detected as PR");
  assert(weightPRCheck.prType === "weight", "PR type is 'weight'");
  assert(weightPRCheck.badgeText === "+10 lbs", "PR badge indicates '+10 lbs'");
  assert(weightPRCheck.current?.displayText === "BW + 25 lbs", "Current display text is 'BW + 25 lbs'");
  assert(weightPRCheck.previous?.displayText === "BW + 15 lbs", "Previous display text is 'BW + 15 lbs'");

  // 11. Sync Queue Preservation
  console.log("\n--- 11. Sync Payload Preservation of Bodyweight Data ---");
  const syncQueue = await getUserSyncQueue(athlete.id);
  const syncSets = syncQueue.filter((q) => q.collection === "sets");

  const syncBwSet = syncSets.find((q) => q.entityId === bwSet.id);
  const syncWeightedBwSet = syncSets.find((q) => q.entityId === weightedBwSet.id);

  assert(syncBwSet !== undefined, "Pure BW set queued for sync");
  assert(syncBwSet?.payload.bodyweight === 195, "Sync payload preserved bodyweight: 195");
  assert(syncBwSet?.payload.addedWeight === 0, "Sync payload preserved addedWeight: 0");

  assert(syncWeightedBwSet !== undefined, "BW+15 set queued for sync");
  assert(syncWeightedBwSet?.payload.bodyweight === 195, "Sync payload preserved bodyweight: 195");
  assert(syncWeightedBwSet?.payload.addedWeight === 15, "Sync payload preserved addedWeight: 15");

  console.log("\n============================================================");
  console.log("✅ ALL BODYWEIGHT & ADDED-WEIGHT EXERCISE TESTS PASSED 100%!");
  console.log("============================================================\n");
}

runBodyweightTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
