// test/phase5-workout-overhaul.test.ts
import "fake-indexeddb/auto";
import { db } from "../lib/db/index";
import { createUser } from "../lib/db/user-repository";
import {
  seedExerciseCatalog,
  getExercises,
  searchExercises,
  createCustomExercise,
  getExerciseById,
} from "../lib/db/exercise-repository";
import {
  getUserRoutines,
  createRoutine,
  updateRoutine,
  deleteRoutine,
  reorderRoutineExercises,
  getRoutineById,
  getRoutineWithExercises,
} from "../lib/db/routine-repository";
import {
  startWorkoutSession,
  getActiveWorkoutSession,
  getWorkoutSessionById,
  completeWorkoutSession,
  logUserSet,
  getUserSetsForSession,
  getUserPreviousSet,
  getUserSyncQueue,
} from "../lib/db/workout-repository";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`❌ Assertion Failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

async function runPhase5Tests() {
  console.log("\n============================================================");
  console.log("SCULP'D 2.0 PHASE 5: WORKOUT SYSTEM OVERHAUL TESTS");
  console.log("============================================================\n");

  // 1. Clear database state to test fresh install behavior
  await db.delete();
  await db.open();

  console.log("--- 1. Empty Workout Library on Fresh Database ---");
  const athleteA = await createUser({
    displayName: "Athlete A",
    pin: "1234",
    avatarColor: "emerald",
  });

  const athleteB = await createUser({
    displayName: "Athlete B",
    pin: "5678",
    avatarColor: "violet",
  });

  const initialRoutinesA = await getUserRoutines(athleteA.id);
  assert(
    initialRoutinesA.length === 0,
    "Fresh install starts with an empty workout library (0 routines, no hardcoded Monday-Friday)"
  );

  const initialRoutinesInDb = await db.routines.count();
  assert(
    initialRoutinesInDb === 0,
    "db.routines table has 0 rows on fresh start"
  );

  console.log("\n--- 2. Exercise Catalog Seeding & Search ---");
  await seedExerciseCatalog();
  const allExercises = await getExercises(athleteA.id);
  assert(
    allExercises.length >= 25,
    `Standard starter catalog seeded into IndexedDB (${allExercises.length} exercises)`
  );

  const benchPress = allExercises.find((e) => e.name === "Barbell Bench Press");
  assert(Boolean(benchPress), "Catalog includes 'Barbell Bench Press'");
  assert(benchPress?.category === "Chest", "Bench Press category is 'Chest'");

  // Test exercise search by name
  const searchResults = await searchExercises("press", undefined, athleteA.id);
  assert(
    searchResults.length >= 3,
    `Search for "press" returned ${searchResults.length} matching exercises`
  );
  assert(
    searchResults.every((e) => e.name.toLowerCase().includes("press")),
    "All search results match query substring"
  );

  // Test exercise search by category
  const chestOnly = await searchExercises("", "Chest", athleteA.id);
  assert(
    chestOnly.every((e) => e.category === "Chest"),
    "Category filter returns only Chest exercises"
  );

  console.log("\n--- 3. Custom Exercise Creation ---");
  const customExercise = await createCustomExercise(athleteA.id, {
    name: "Deficit Trap Bar Deadlift",
    category: "Back",
    equipment: "Barbell",
  });
  assert(Boolean(customExercise.id), "Custom exercise has a generated UUID");
  assert(
    customExercise.userId === athleteA.id,
    "Custom exercise is associated with Athlete A"
  );
  assert(
    customExercise.name === "Deficit Trap Bar Deadlift",
    "Custom exercise name is persisted"
  );

  // Verify custom exercise in IndexedDB
  const storedCustom = await getExerciseById(customExercise.id);
  assert(storedCustom !== undefined, "Custom exercise readable from IndexedDB");

  // Verify custom exercise appears in Athlete A's library
  const athleteAExercises = await getExercises(athleteA.id);
  assert(
    athleteAExercises.some((e) => e.id === customExercise.id),
    "Athlete A includes custom exercise in their library"
  );

  // Verify custom exercise is isolated from Athlete B
  const athleteBExercises = await getExercises(athleteB.id);
  assert(
    !athleteBExercises.some((e) => e.id === customExercise.id),
    "Athlete B does NOT see Athlete A's custom exercise (exercise isolation)"
  );

  // Verify sync queue mutation queued for custom exercise
  const syncQueueA1 = await getUserSyncQueue(athleteA.id);
  const customExSync = syncQueueA1.find(
    (item) => item.collection === "exercises" && item.entityId === customExercise.id
  );
  assert(Boolean(customExSync), "Sync queue mutation created for custom exercise");
  assert(customExSync?.operation === "insert", "Sync operation is 'insert'");

  console.log("\n--- 4. Create User Routine with Configured Exercises ---");
  const latPulldown = allExercises.find((e) => e.name === "Neutral Grip Lat Pulldown")!;
  const overheadPress = allExercises.find((e) => e.name === "Overhead Barbell Press")!;

  const createdRoutine = await createRoutine(athleteA.id, {
    name: "Upper Power A",
    description: "Strength & hypertrophy upper body split",
    exercises: [
      {
        exerciseId: benchPress!.id,
        targetSets: 4,
        targetReps: "5",
        restSeconds: 180,
        notes: "Pause on chest 1s",
      },
      {
        exerciseId: latPulldown.id,
        targetSets: 3,
        targetReps: "8-10",
        restSeconds: 90,
      },
      {
        exerciseId: customExercise.id,
        targetSets: 3,
        targetReps: "6-8",
        restSeconds: 120,
        notes: "Drive through heels from 2-inch deficit",
      },
    ],
  });

  assert(Boolean(createdRoutine.id), "Routine has a generated UUID");
  assert(createdRoutine.userId === athleteA.id, "Routine belongs to Athlete A");
  assert(createdRoutine.name === "Upper Power A", "Routine name saved");
  assert(createdRoutine.displayOrder === 1, "Routine displayOrder is 1");

  // Verify joined routine with ordered exercises
  const routineWithDetails = await getRoutineWithExercises(createdRoutine.id);
  assert(routineWithDetails !== undefined, "Loaded routine with joined exercises");
  assert(
    routineWithDetails!.exercises.length === 3,
    "Routine has exactly 3 configured exercises"
  );
  assert(
    routineWithDetails!.exercises[0].exercise.name === "Barbell Bench Press",
    "Exercise 1 is Barbell Bench Press"
  );
  assert(
    routineWithDetails!.exercises[0].targetSets === 4,
    "Exercise 1 targetSets is 4"
  );
  assert(
    routineWithDetails!.exercises[0].targetReps === "5",
    "Exercise 1 targetReps is 5"
  );
  assert(
    routineWithDetails!.exercises[0].restSeconds === 180,
    "Exercise 1 restSeconds configured to 180s"
  );
  assert(
    routineWithDetails!.exercises[2].exercise.name === "Deficit Trap Bar Deadlift",
    "Exercise 3 is custom exercise"
  );

  console.log("\n--- 5. Exercise Reordering & Order Persistence ---");
  const exConfigs = routineWithDetails!.exercises;
  // Reorder from [Bench, Lat, Custom] to [Custom, Bench, Lat]
  const newOrderConfigIds = [exConfigs[2].id, exConfigs[0].id, exConfigs[1].id];
  await reorderRoutineExercises(athleteA.id, createdRoutine.id, newOrderConfigIds);

  const reorderedRoutine = await getRoutineWithExercises(createdRoutine.id);
  assert(
    reorderedRoutine!.exercises[0].exercise.name === "Deficit Trap Bar Deadlift",
    "First exercise is now Deficit Trap Bar Deadlift"
  );
  assert(
    reorderedRoutine!.exercises[0].displayOrder === 1,
    "First exercise displayOrder is 1"
  );
  assert(
    reorderedRoutine!.exercises[1].exercise.name === "Barbell Bench Press",
    "Second exercise is Barbell Bench Press (displayOrder 2)"
  );
  assert(
    reorderedRoutine!.exercises[2].exercise.name === "Neutral Grip Lat Pulldown",
    "Third exercise is Neutral Grip Lat Pulldown (displayOrder 3)"
  );

  console.log("\n--- 6. Delete / Remove Exercise from Routine ---");
  // Update routine keeping only Deficit Deadlift and Bench Press (removing Lat Pulldown)
  await updateRoutine(athleteA.id, createdRoutine.id, {
    exercises: [
      {
        id: exConfigs[2].id,
        exerciseId: customExercise.id,
        targetSets: 3,
        targetReps: "6-8",
        restSeconds: 120,
      },
      {
        id: exConfigs[0].id,
        exerciseId: benchPress!.id,
        targetSets: 4,
        targetReps: "5",
        restSeconds: 180,
      },
    ],
  });

  const updatedAfterRemove = await getRoutineWithExercises(createdRoutine.id);
  assert(
    updatedAfterRemove!.exercises.length === 2,
    "Routine now has 2 exercises after Lat Pulldown was removed"
  );
  assert(
    !updatedAfterRemove!.exercises.some((e) => e.exerciseId === latPulldown.id),
    "Lat Pulldown is completely removed from routine"
  );

  console.log("\n--- 7. Edit Routine Name & Description ---");
  const editedRoutine = await updateRoutine(athleteA.id, createdRoutine.id, {
    name: "Heavy Upper & Deadlift",
    description: "Modified heavy power day",
  });
  assert(
    editedRoutine.name === "Heavy Upper & Deadlift",
    "Routine name successfully edited"
  );
  assert(
    editedRoutine.description === "Modified heavy power day",
    "Routine description successfully edited"
  );

  console.log("\n--- 8. Offline Routine Creation & Sync Queueing ---");
  const syncQueueA2 = await getUserSyncQueue(athleteA.id);
  const routineInserts = syncQueueA2.filter(
    (item) => item.collection === "routines" && item.operation === "insert"
  );
  const routineExerciseInserts = syncQueueA2.filter(
    (item) => item.collection === "routine_exercises" && item.operation === "insert"
  );
  assert(routineInserts.length === 1, "Routine creation queued for sync");
  assert(
    routineExerciseInserts.length >= 3,
    "Routine exercises creation queued for sync"
  );

  console.log("\n--- 9. Routine Persistence Across Simulated App Restart ---");
  // Simulate app restart / reload by closing and reopening Dexie
  await db.close();
  await db.open();

  const reloadedRoutines = await getUserRoutines(athleteA.id);
  assert(
    reloadedRoutines.length === 1,
    "Exactly 1 routine preserved after database restart"
  );
  assert(
    reloadedRoutines[0].name === "Heavy Upper & Deadlift",
    "Persisted routine retained edited name"
  );

  const reloadedWithExercises = await getRoutineWithExercises(createdRoutine.id);
  assert(
    reloadedWithExercises!.exercises.length === 2,
    "Exercise configurations preserved after database restart"
  );

  console.log("\n--- 10. Start Workout Session: Routine & Exercise Snapshotting ---");
  const session1 = await startWorkoutSession(athleteA.id, createdRoutine.id);
  assert(session1.userId === athleteA.id, "Session belongs to Athlete A");
  assert(
    session1.routineName === "Heavy Upper & Deadlift",
    "Session snapshotted current routine name"
  );
  assert(
    Boolean(session1.exerciseSnapshots && session1.exerciseSnapshots.length === 2),
    "Session snapshotted 2 exercise configurations"
  );
  assert(
    session1.exerciseSnapshots![0].name === "Deficit Trap Bar Deadlift",
    "Snapshot preserved exercise 1 name"
  );
  assert(
    session1.exerciseSnapshots![0].restSeconds === 120,
    "Snapshot preserved exercise 1 restSeconds (120s)"
  );

  // Log sets during this workout session
  const set1 = await logUserSet(athleteA.id, session1.id, customExercise.id, 405, 5);
  assert(set1.setNumber === 1, "Set 1 recorded (405 lbs × 5)");

  const set2 = await logUserSet(athleteA.id, session1.id, benchPress!.id, 245, 5);
  assert(set2.setNumber === 1, "Set 1 for bench press recorded (245 lbs × 5)");

  // Complete workout session
  const completedSession = await completeWorkoutSession(
    athleteA.id,
    session1.id,
    "Felt explosive on deadlifts"
  );
  assert(completedSession.status === "completed", "Workout session completed");

  console.log("\n--- 11. Immutability of Historical Workouts when Routine is Edited Later ---");
  // Athlete A now completely rewrites the routine template in the builder:
  // 1. Changes name to "Chest & Shoulders Only"
  // 2. Removes the custom Deficit Deadlift entirely
  // 3. Changes Bench Press targetSets from 4 to 10
  await updateRoutine(athleteA.id, createdRoutine.id, {
    name: "Chest & Shoulders Only",
    exercises: [
      {
        exerciseId: benchPress!.id,
        targetSets: 10,
        targetReps: "12",
        restSeconds: 60,
      },
    ],
  });

  // Verify the routine template was indeed changed:
  const alteredRoutine = await getRoutineWithExercises(createdRoutine.id);
  assert(
    alteredRoutine!.name === "Chest & Shoulders Only",
    "Routine template name is now 'Chest & Shoulders Only'"
  );
  assert(
    alteredRoutine!.exercises.length === 1,
    "Routine template now has only 1 exercise"
  );

  // CRITICAL CHECK: Verify the completed workout session was NOT altered by routine editing!
  const historicalSession = await getWorkoutSessionById(athleteA.id, session1.id);
  assert(
    historicalSession !== undefined,
    "Historical session retrieved from IndexedDB"
  );
  assert(
    historicalSession?.routineName === "Heavy Upper & Deadlift",
    "Historical session retains original routine name ('Heavy Upper & Deadlift')!"
  );
  assert(
    historicalSession?.exerciseSnapshots?.length === 2,
    "Historical session still contains both original exercises in its snapshot!"
  );
  assert(
    historicalSession?.exerciseSnapshots?.[0].name === "Deficit Trap Bar Deadlift",
    "Historical session still references Deficit Deadlift even though deleted from template!"
  );
  assert(
    historicalSession?.exerciseSnapshots?.[1].targetSets === 4,
    "Historical session still shows targetSets 4 (NOT 10)!"
  );

  // Verify historical sets remain completely intact
  const historicalSets = await getUserSetsForSession(athleteA.id, session1.id);
  assert(
    historicalSets.length === 2,
    "Both logged sets remain intact in historical workout"
  );

  console.log("\n--- 12. Progressive Overload Across Sessions with Custom Exercises ---");
  // Athlete A starts a new session next week for the same routine
  const session2 = await startWorkoutSession(athleteA.id, createdRoutine.id);
  assert(session2.id !== session1.id, "New session created");

  // Query previous performance for custom exercise
  const prevCustomSet = await getUserPreviousSet(
    athleteA.id,
    customExercise.id,
    session2.id
  );
  assert(
    prevCustomSet !== undefined,
    "Previous performance found for custom exercise"
  );
  assert(
    prevCustomSet?.weight === 405 && prevCustomSet?.reps === 5,
    "Previous performance accurately returned 405 lbs × 5 reps"
  );

  console.log("\n--- 13. Strict User Isolation Boundaries ---");
  // Athlete B cannot view Athlete A's routines
  const athleteBRoutines = await getUserRoutines(athleteB.id);
  assert(
    athleteBRoutines.length === 0,
    "Athlete B has 0 routines (Athlete A's routines are hidden)"
  );

  // Athlete B cannot edit Athlete A's routine
  let athleteBCrossEditBlocked = false;
  try {
    await updateRoutine(athleteB.id, createdRoutine.id, { name: "Hacked Routine" });
  } catch (err: any) {
    athleteBCrossEditBlocked = true;
  }
  assert(
    athleteBCrossEditBlocked,
    "Athlete B cannot edit Athlete A's routine (blocked with authorization error)"
  );

  // Athlete B cannot delete Athlete A's routine
  const deleteResultB = await deleteRoutine(athleteB.id, createdRoutine.id);
  assert(
    deleteResultB === false,
    "Athlete B cannot delete Athlete A's routine (returned false)"
  );

  // Athlete B's sync queue contains ZERO items from Athlete A
  const athleteBSyncQueue = await getUserSyncQueue(athleteB.id);
  const crossUserSyncLeak = athleteBSyncQueue.some(
    (item) => item.userId !== athleteB.id
  );
  assert(
    !crossUserSyncLeak,
    "Athlete B sync queue contains 0 items from Athlete A"
  );

  console.log("\n--- 14. Routine Deletion & Cascade Clean-up ---");
  const deleteSuccess = await deleteRoutine(athleteA.id, createdRoutine.id);
  assert(deleteSuccess === true, "Routine deletion returned true");

  const deletedRoutineCheck = await getRoutineById(createdRoutine.id);
  assert(deletedRoutineCheck === undefined, "Routine removed from db.routines");

  const deletedConfigsCheck = await db.routineExercises
    .where("routineId")
    .equals(createdRoutine.id)
    .toArray();
  assert(
    deletedConfigsCheck.length === 0,
    "Routine exercise configs removed from db.routineExercises"
  );

  // Sync queue item queued for deletion
  const syncQueueAfterDelete = await getUserSyncQueue(athleteA.id);
  const routineDelItem = syncQueueAfterDelete.find(
    (item) => item.operation === "delete" && item.collection === "routines" && item.entityId === createdRoutine.id
  );
  assert(Boolean(routineDelItem), "Delete operation queued in syncQueue for routine");

  console.log("\n============================================================");
  console.log("✅ ALL PHASE 5 WORKOUT SYSTEM OVERHAUL TESTS PASSED 100%!");
  console.log("============================================================\n");
}

runPhase5Tests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
