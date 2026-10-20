// test/workout-import-export.test.ts
import "fake-indexeddb/auto";
import { SculpdDatabase } from "../lib/db/index";
import { createUser } from "../lib/db/user-repository";
import {
  exportWorkout,
  exportAllWorkouts,
  exportWorkoutSessionAsRoutine,
  validateWorkoutData,
  importWorkout,
  importWorkoutBundle,
  workoutToJson,
  slugify,
  getWorkoutFilename,
  getWorkoutBundleFilename,
} from "../lib/workout/workout-transfer-service";
import {
  WORKOUT_EXPORT_IDENTIFIER,
  WORKOUT_BUNDLE_IDENTIFIER,
  WORKOUT_TRANSFER_VERSION,
  SculpdWorkoutExport,
  SculpdWorkoutBundleExport,
  ExportedWorkout,
} from "../types/transfer";
import { Routine, Exercise, RoutineExerciseConfig, WorkoutSession, WorkoutSet } from "../types/models";
import { generateUUID } from "../lib/crypto/uuid";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`❌ Assertion Failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

async function runTests() {
  console.log("\n============================================================");
  console.log("SCULP'D: WORKOUT IMPORT & EXPORT TEST SUITE");
  console.log("============================================================\n");

  const testDb = new SculpdDatabase("sculpd_test_transfer");
  await testDb.open();

  // Clean database
  await Promise.all([
    testDb.users.clear(),
    testDb.routines.clear(),
    testDb.routineExercises.clear(),
    testDb.exercises.clear(),
    testDb.workoutSessions.clear(),
    testDb.sets.clear(),
    testDb.syncQueue.clear(),
  ]);

  // Seed standard catalog exercise into testDb
  const benchExercise: Exercise = {
    id: "std_ex_bench_press",
    name: "Barbell Bench Press",
    category: "Chest",
    equipment: "Barbell",
    loadType: "weighted",
    userId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  await testDb.exercises.add(benchExercise);

  // 1. Create Athletes
  console.log("--- 1. Testing Athlete Setup ---");
  const userA = await createUser({
    displayName: "Coach Alex",
    pin: "1234",
    avatarColor: "emerald",
  }, testDb);

  const userB = await createUser({
    displayName: "Athlete Sam",
    pin: "5678",
    avatarColor: "violet",
  }, testDb);

  assert(userA.displayName === "Coach Alex", "Coach Alex profile created");
  assert(userB.displayName === "Athlete Sam", "Athlete Sam profile created");

  // 2. Setup a routine with standard and custom exercises for Coach Alex
  console.log("\n--- 2. Setting Up Routine for Coach Alex ---");
  const routineAId = generateUUID();
  const customExAId = generateUUID();

  // Custom exercise created by Alex
  const customExA: Exercise = {
    id: customExAId,
    name: "Alex Bulgarian Ring Dip",
    category: "Chest",
    equipment: "Bodyweight",
    loadType: "bodyweight",
    userId: userA.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await testDb.exercises.add(customExA);

  const routineA: Routine = {
    id: routineAId,
    userId: userA.id,
    name: "Elite Chest & Triceps",
    description: "High intensity hypertrophy workout",
    displayOrder: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await testDb.routines.add(routineA);

  const cfg1: RoutineExerciseConfig = {
    id: generateUUID(),
    routineId: routineAId,
    exerciseId: benchExercise.id,
    displayOrder: 1,
    targetSets: 4,
    targetReps: "6-8",
    restSeconds: 120,
    loadType: "weighted",
    notes: "Pause 1s on chest",
    userId: userA.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const cfg2: RoutineExerciseConfig = {
    id: generateUUID(),
    routineId: routineAId,
    exerciseId: customExA.id,
    displayOrder: 2,
    targetSets: 3,
    targetReps: "10-12",
    restSeconds: 90,
    loadType: "bodyweight",
    notes: "Full lockout at top",
    userId: userA.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await testDb.routineExercises.bulkAdd([cfg1, cfg2]);
  assert(true, "Routine and exercises seeded successfully");

  // Temporarily replace db singleton with testDb for transfer service tests
  const originalDb = (await import("../lib/db")).db;
  Object.assign(originalDb, testDb);

  // 3. Export Single Workout
  console.log("\n--- 3. Testing Export Single Workout ---");
  const exported = await exportWorkout(routineAId);
  assert(exported.format === WORKOUT_EXPORT_IDENTIFIER, "Export format is 'sculpd-workout'");
  assert(exported.version === WORKOUT_TRANSFER_VERSION, "Export version is 1");
  assert(exported.workout.name === "Elite Chest & Triceps", "Workout name matches");
  assert(exported.workout.description === "High intensity hypertrophy workout", "Description matches");
  assert(exported.workout.exercises.length === 2, "2 exercises exported");

  const ex1 = exported.workout.exercises[0];
  assert(ex1.name === "Barbell Bench Press", "Exercise 1 name matches");
  assert(ex1.targetSets === 4, "Exercise 1 target sets matches");
  assert(ex1.targetReps === "6-8", "Exercise 1 target reps matches");
  assert(ex1.restSeconds === 120, "Exercise 1 rest seconds matches");
  assert(ex1.notes === "Pause 1s on chest", "Exercise 1 notes matches");

  const ex2 = exported.workout.exercises[1];
  assert(ex2.name === "Alex Bulgarian Ring Dip", "Exercise 2 name matches");
  assert(ex2.loadType === "bodyweight", "Exercise 2 loadType is bodyweight");
  assert(ex2.targetSets === 3, "Exercise 2 target sets matches");

  // Verify internal IDs were stripped
  assert((ex1 as any).id === undefined, "Internal exercise ID stripped");
  assert((ex1 as any).routineId === undefined, "Internal routine ID stripped");
  assert((exported.workout as any).userId === undefined, "User ID stripped from exported workout");

  // 4. Filename & Serialization helpers
  console.log("\n--- 4. Testing Filename & Serialization Helpers ---");
  assert(slugify("Elite Chest & Triceps!") === "elite-chest-triceps", "slugify formats correctly");
  const testDate = new Date(2026, 9, 20); // Month is 0-indexed: 9 = October
  const filename = getWorkoutFilename("Elite Chest & Triceps", testDate);
  assert(filename.startsWith("sculpd-workout-elite-chest-triceps-20261020"), "Filename formatted correctly");

  const bundleFilename = getWorkoutBundleFilename(testDate);
  assert(bundleFilename.startsWith("sculpd-workouts-bundle-20261020"), "Bundle filename formatted correctly");

  const jsonStr = workoutToJson(exported);
  assert(typeof jsonStr === "string" && jsonStr.includes("sculpd-workout"), "workoutToJson serialized correctly");

  // 5. Validation Logic
  console.log("\n--- 5. Testing Validation Logic ---");
  const validCheck = validateWorkoutData(jsonStr);
  assert(validCheck.valid === true, "Valid JSON string passes validation");
  assert(validCheck.isBundle === false, "Detected as single workout (not bundle)");
  assert(validCheck.workouts?.length === 1, "Contains 1 workout in result");

  // Raw workout object without wrapper
  const rawObj: ExportedWorkout = {
    name: "Leg Day Destroyer",
    exercises: [
      { name: "Barbell Back Squat", targetSets: 5, targetReps: "5", restSeconds: 180 },
    ],
  };
  const rawCheck = validateWorkoutData(rawObj);
  assert(rawCheck.valid === true, "Raw workout object without wrapper is valid");
  assert(rawCheck.workouts?.[0].name === "Leg Day Destroyer", "Raw workout name parsed");

  // Invalid JSON strings
  const badJsonCheck = validateWorkoutData("{ bad: json");
  assert(badJsonCheck.valid === false, "Bad JSON rejected");
  assert(badJsonCheck.error?.includes("Invalid JSON") === true, "Clear error message on invalid JSON");

  // Empty data
  const emptyCheck = validateWorkoutData("");
  assert(emptyCheck.valid === false, "Empty string rejected");

  // 6. Import Workout into Athlete Sam's Profile (User B)
  console.log("\n--- 6. Testing Import Workout for Athlete Sam (User B) ---");
  const importRes = await importWorkout(userB.id, exported.workout);
  assert(importRes.success === true, "Workout imported successfully");
  assert(importRes.routineName === "Elite Chest & Triceps", "Imported routine name preserved");
  assert(importRes.exerciseCount === 2, "2 exercise configurations created");
  assert(importRes.reusedExercisesCount === 1, "Reused existing Barbell Bench Press from catalog");
  assert(importRes.createdCustomExercisesCount === 1, "Created 1 custom exercise for unknown movement");

  // Verify Sam's routine in database
  const samRoutines = await testDb.routines.where("userId").equals(userB.id).toArray();
  assert(samRoutines.length === 1, "Sam now has 1 routine in database");
  assert(samRoutines[0].name === "Elite Chest & Triceps", "Sam's routine name is correct");

  // Verify Sam's exercise configs in database
  const samConfigs = await testDb.routineExercises
    .where("routineId")
    .equals(samRoutines[0].id)
    .sortBy("displayOrder");
  assert(samConfigs.length === 2, "Sam has 2 exercise configs");
  assert(samConfigs[0].exerciseId === benchExercise.id, "First exercise linked to standard Bench Press");
  assert(samConfigs[0].targetSets === 4, "Target sets preserved");
  assert(samConfigs[0].targetReps === "6-8", "Target reps preserved");
  assert(samConfigs[0].notes === "Pause 1s on chest", "Coaching notes preserved");

  // Verify custom exercise created specifically for Sam
  const samCustomEx = await testDb.exercises.get(samConfigs[1].exerciseId);
  assert(samCustomEx !== undefined, "Custom exercise exists in database");
  assert(samCustomEx?.name === "Alex Bulgarian Ring Dip", "Custom exercise name correct");
  assert(samCustomEx?.userId === userB.id, "Custom exercise strictly isolated to Sam's userId");
  assert(samCustomEx?.loadType === "bodyweight", "Custom exercise loadType preserved as bodyweight");

  // Verify syncQueue entries for cloud sync integrity
  const samSyncQueue = await testDb.syncQueue.where("userId").equals(userB.id).toArray();
  assert(samSyncQueue.length >= 4, "Sync queue entries generated (custom ex + routine + 2 configs)");
  const collectionsInQueue = samSyncQueue.map((item) => item.collection);
  assert(collectionsInQueue.includes("routines"), "Routine queued for cloud sync");
  assert(collectionsInQueue.includes("routine_exercises"), "Configs queued for cloud sync");
  assert(collectionsInQueue.includes("exercises"), "New custom exercise queued for cloud sync");

  // 7. Testing Duplicate Import Auto-Naming
  console.log("\n--- 7. Testing Duplicate Import Auto-Naming ---");
  const secondImportRes = await importWorkout(userB.id, exported.workout);
  assert(secondImportRes.success === true, "Second import succeeded");
  assert(secondImportRes.routineName === "Elite Chest & Triceps (Imported)", "Auto-appended '(Imported)' on name conflict");

  // Custom name override
  const customNameRes = await importWorkout(userB.id, exported.workout, {
    customName: "Sam's Super Push",
  });
  assert(customNameRes.success === true, "Custom named import succeeded");
  assert(customNameRes.routineName === "Sam's Super Push", "Custom name honored");

  const samTotalRoutines = await testDb.routines.where("userId").equals(userB.id).count();
  assert(samTotalRoutines === 3, "Sam now has 3 routines total");

  // 8. Testing Multi-Workout Bundle Export and Import
  console.log("\n--- 8. Testing Multi-Workout Bundle Export and Import ---");
  const bundleExport = await exportAllWorkouts(userB.id);
  assert(bundleExport.format === WORKOUT_BUNDLE_IDENTIFIER, "Bundle export format is 'sculpd-workout-bundle'");
  assert(bundleExport.workouts.length === 3, "Bundle contains all 3 of Sam's routines");

  const bundleValidation = validateWorkoutData(bundleExport);
  assert(bundleValidation.valid === true, "Bundle passes validation");
  assert(bundleValidation.isBundle === true, "Detected as bundle");
  assert(bundleValidation.workouts?.length === 3, "3 workouts found in bundle");

  // Create User C (Athlete Jordan) and import bundle
  const userC = await createUser({
    displayName: "Athlete Jordan",
    pin: "9999",
    avatarColor: "rose",
  }, testDb);

  const bundleImportRes = await importWorkoutBundle(userC.id, bundleExport.workouts);
  assert(bundleImportRes.success === true, "Bundle imported for Athlete Jordan");
  assert(bundleImportRes.importedWorkoutsCount === 3, "All 3 workouts imported successfully");

  const jordanRoutines = await testDb.routines.where("userId").equals(userC.id).count();
  assert(jordanRoutines === 3, "Jordan has 3 routines in database");

  // 9. Testing Export Completed Workout Session from History
  console.log("\n--- 9. Testing Export Completed Workout Session from History ---");
  const sessionAId = generateUUID();
  const sessionA: WorkoutSession = {
    id: sessionAId,
    userId: userA.id,
    routineId: routineAId,
    routineName: "Alex Heavy Bench Day",
    exerciseSnapshots: [
      {
        exerciseId: benchExercise.id,
        name: "Barbell Bench Press",
        displayOrder: 1,
        targetSets: 3,
        targetReps: "5",
        restSeconds: 180,
      },
    ],
    startedAt: "2026-10-18T10:00:00.000Z",
    completedAt: "2026-10-18T11:00:00.000Z",
    status: "completed",
    notes: "Felt strong, hit 225 easily",
    updatedAt: "2026-10-18T11:00:00.000Z",
  };
  await testDb.workoutSessions.add(sessionA);

  const sessionExport = await exportWorkoutSessionAsRoutine(userA.id, sessionAId);
  assert(sessionExport.format === WORKOUT_EXPORT_IDENTIFIER, "Session export is valid workout format");
  assert(sessionExport.workout.name === "Alex Heavy Bench Day", "Session routine name preserved");
  assert(sessionExport.workout.exercises.length === 1, "Session exercises preserved");
  assert(sessionExport.workout.exercises[0].name === "Barbell Bench Press", "Exercise name matches snapshot");

  // 10. Strict User Isolation on Transfer
  console.log("\n--- 10. Testing Strict User Isolation ---");
  let isolationCaught = false;
  try {
    await exportAllWorkouts("");
  } catch (err: any) {
    isolationCaught = true;
    assert(err.message.includes("Strict User Isolation Error"), "Blocked exportAllWorkouts with empty userId");
  }
  assert(isolationCaught, "Empty userId correctly rejected on export");

  let importIsolationCaught = false;
  try {
    await importWorkout("", exported.workout);
  } catch (err: any) {
    importIsolationCaught = true;
    assert(err.message.includes("Strict User Isolation Error"), "Blocked importWorkout with empty userId");
  }
  assert(importIsolationCaught, "Empty userId correctly rejected on import");

  console.log("\n============================================================");
  console.log("✅ ALL WORKOUT IMPORT & EXPORT TESTS PASSED 100%!");
  console.log("============================================================\n");
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
