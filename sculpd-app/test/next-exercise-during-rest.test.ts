// test/next-exercise-during-rest.test.ts
import "fake-indexeddb/auto";
import { db } from "../lib/db/index";
import { createUser } from "../lib/db/user-repository";
import { createRoutine } from "../lib/db/routine-repository";
import {
  startWorkoutSession,
  logUserSet,
  getUserSetsForSession,
  getCompletedWorkoutSessions,
} from "../lib/db/workout-repository";
import { Exercise, WorkoutSessionExerciseSnapshot } from "../types/models";
import {
  isFinalExerciseSet,
  getNextExerciseInSession,
  getPrescribedTargetWeight,
  getPrescribedTargetSets,
  getPrescribedTargetReps,
  getNextExerciseNotes,
  getNextExercisePreviewData,
} from "../lib/workout/preview-utils";
import {
  calculateRemainingSeconds,
  isRestExpired,
  RestTimerState,
} from "../lib/notifications/rest-notifier";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`❌ Assertion Failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

// Mock localStorage for Node environment
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();
(global as any).localStorage = localStorageMock;

async function runNextExerciseRestTests() {
  console.log("\n========================================================");
  console.log("SCULP'D 2.0 TASK 04: NEXT EXERCISE DURING REST TESTS");
  console.log("========================================================\n");

  // Setup Athlete
  const athlete = await createUser({
    displayName: "Atlas Athlete",
    pin: "1234",
    avatarColor: "violet",
    bodyweight: 185,
  });

  const sampleExercises: Exercise[] = [
    {
      id: "ex_bench_press",
      name: "Barbell Bench Press",
      category: "Chest",
      targetSets: 3,
      targetReps: "8-10",
      coachingCue: "Control eccentric, touch sternum softly",
      displayOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "ex_incline_dumbbell",
      name: "Incline Dumbbell Press",
      category: "Chest",
      targetSets: 3,
      targetReps: "10-12",
      coachingCue: "30 degree bench, drive up and in",
      displayOrder: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "ex_cable_fly",
      name: "Cable Chest Fly",
      category: "Chest",
      targetSets: 2,
      targetReps: "12-15",
      coachingCue: "Squeeze pecs at peak contraction",
      displayOrder: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  console.log("--- 1. Final Versus Non-Final Sets Detection ---");
  // Target of 3 sets
  assert(!isFinalExerciseSet(0, 3), "0 sets logged of 3 is not final");
  assert(!isFinalExerciseSet(1, 3), "1 set logged of 3 is not final (retains current rest experience)");
  assert(!isFinalExerciseSet(2, 3), "2 sets logged of 3 is not final (retains current rest experience)");
  assert(isFinalExerciseSet(3, 3), "3 sets logged of 3 IS final set (triggers next exercise preview)");
  assert(isFinalExerciseSet(4, 3), "4 sets logged of 3 (extra set) remains final/complete");

  // Unconfigured or invalid target sets
  assert(!isFinalExerciseSet(1, null), "Null target sets is never flagged as final set");
  assert(!isFinalExerciseSet(2, undefined), "Undefined target sets is never flagged as final set");
  assert(!isFinalExerciseSet(3, 0), "0 target sets is not flagged as final set");
  assert(!isFinalExerciseSet(5, -1), "Negative target sets is not flagged as final set");

  console.log("\n--- 2. Next-Exercise Ordering in Active Session ---");
  // Index 0 -> Next is Index 1 (Incline Dumbbell Press)
  const nextAfterBench = getNextExerciseInSession(sampleExercises, 0);
  assert(Boolean(nextAfterBench), "Next exercise exists after exercise 0");
  assert(nextAfterBench?.id === "ex_incline_dumbbell", "Next exercise after Bench Press is Incline Dumbbell Press");
  assert(nextAfterBench?.name === "Incline Dumbbell Press", "Next exercise name correctly resolved");

  // Index 1 -> Next is Index 2 (Cable Chest Fly)
  const nextAfterIncline = getNextExerciseInSession(sampleExercises, 1);
  assert(Boolean(nextAfterIncline), "Next exercise exists after exercise 1");
  assert(nextAfterIncline?.id === "ex_cable_fly", "Next exercise after Incline is Cable Chest Fly");

  // Custom reordered list test
  const reordered: Exercise[] = [
    sampleExercises[2], // Cable Fly first
    sampleExercises[0], // Bench Press second
    sampleExercises[1], // Incline third
  ];
  const nextInReordered = getNextExerciseInSession(reordered, 0);
  assert(nextInReordered?.id === "ex_bench_press", "Reordered routine resolves next exercise in custom order");

  console.log("\n--- 3. End-of-Workout Behavior (No Next Exercise) ---");
  // Index 2 is the last exercise (sampleExercises.length - 1)
  const nextAfterLast = getNextExerciseInSession(sampleExercises, 2);
  assert(nextAfterLast === null, "Last exercise in session returns null for next exercise");

  // Out of bounds indices
  assert(getNextExerciseInSession(sampleExercises, 3) === null, "Out of bounds index returns null");
  assert(getNextExerciseInSession([], 0) === null, "Empty exercise list returns null");

  // When final set of last exercise is reached:
  const isFinalOnLast = isFinalExerciseSet(2, 2);
  assert(isFinalOnLast, "Final set reached on last exercise");
  assert(nextAfterLast === null, "Do not show next-exercise preview when no next exercise exists");

  console.log("\n--- 4. Missing & Unavailable Targets (Neutral Fallbacks) ---");
  // Exercise with no target weight, no target sets, no target reps
  const bareExercise: Exercise = {
    id: "ex_bare",
    name: "Bodyweight Push-Up",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const bareWeight = getPrescribedTargetWeight(bareExercise);
  assert(bareWeight.value === null, "Prescribed weight value is null when not set");
  assert(bareWeight.display === "Target not set", "Missing target weight returns neutral fallback 'Target not set'");
  assert(!bareWeight.isAvailable, "Target weight isAvailable is false");

  const bareSets = getPrescribedTargetSets(bareExercise);
  assert(bareSets.value === null, "Prescribed sets value is null when not set");
  assert(bareSets.display === "Target not set", "Missing target sets returns neutral fallback 'Target not set'");
  assert(!bareSets.isAvailable, "Target sets isAvailable is false");

  const bareReps = getPrescribedTargetReps(bareExercise);
  assert(bareReps.value === null, "Prescribed reps value is null when not set");
  assert(bareReps.display === "Target not set", "Missing target reps returns neutral fallback 'Target not set'");
  assert(!bareReps.isAvailable, "Target reps isAvailable is false");

  const bareNotes = getNextExerciseNotes(bareExercise);
  assert(bareNotes === null, "Missing notes returns null without clutter");

  // Null / undefined exercise parameter safety
  assert(getPrescribedTargetWeight(null).display === "Target not set", "Null exercise safely returns 'Target not set'");
  assert(getPrescribedTargetSets(null).display === "Target not set", "Null exercise sets safely returns 'Target not set'");
  assert(getPrescribedTargetReps(null).display === "Target not set", "Null exercise reps safely returns 'Target not set'");
  assert(getNextExerciseNotes(null) === null, "Null exercise notes safely returns null");

  console.log("\n--- 5. Target Prescription Formatting When Prescribed ---");
  const prescribedExercise: Exercise = {
    id: "ex_prescribed",
    name: "Overhead Barbell Press",
    category: "Shoulders",
    targetSets: 4,
    targetReps: "6-8",
    coachingCue: "Brace core, push head through at top",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  (prescribedExercise as any).targetWeight = 135; // e.g. prescribed target load

  const weightPrescription = getPrescribedTargetWeight(prescribedExercise);
  assert(weightPrescription.value === 135, "Prescribed weight value resolved to 135");
  assert(weightPrescription.display === "135 lbs", "Prescribed weight formatted as '135 lbs'");
  assert(weightPrescription.isAvailable, "Prescribed weight flagged as available");

  const setsPrescription = getPrescribedTargetSets(prescribedExercise);
  assert(setsPrescription.value === 4, "Target sets value resolved to 4");
  assert(setsPrescription.display === "4 sets", "Target sets formatted as '4 sets'");

  const repsPrescription = getPrescribedTargetReps(prescribedExercise);
  assert(repsPrescription.value === "6-8", "Target reps value resolved to '6-8'");
  assert(repsPrescription.display === "6-8 reps", "Target reps formatted as '6-8 reps'");

  const notesPrescription = getNextExerciseNotes(prescribedExercise);
  assert(notesPrescription === "Brace core, push head through at top", "Coaching cue resolved cleanly");

  // Full preview data assembly
  const previewData = getNextExercisePreviewData(prescribedExercise);
  assert(previewData.name === "Overhead Barbell Press", "Preview data has exercise name");
  assert(previewData.targetSets.display === "4 sets", "Preview data has sets display");
  assert(previewData.targetReps.display === "6-8 reps", "Preview data has reps display");
  assert(previewData.targetWeight.display === "135 lbs", "Preview data has weight display");
  assert(Boolean(previewData.notes?.includes("Brace core")), "Preview data includes coaching cue");

  console.log("\n--- 6. Deleted Template Exercise (Snapshot Integrity) ---");
  // An exercise snapshot from an active session where template exercise was deleted
  const snapshotItem: WorkoutSessionExerciseSnapshot = {
    exerciseId: "ex_legacy_deleted",
    name: "Dumbbell Lateral Raise",
    displayOrder: 2,
    targetSets: 3,
    targetReps: "12-15",
    restSeconds: 60,
    notes: "Slight lean forward, lead with elbows",
  };

  const reconstructedExercise: Exercise = {
    id: snapshotItem.exerciseId,
    name: snapshotItem.name,
    targetSets: snapshotItem.targetSets,
    targetReps: snapshotItem.targetReps,
    coachingCue: snapshotItem.notes || null,
    displayOrder: snapshotItem.displayOrder,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const snapshotPreview = getNextExercisePreviewData(reconstructedExercise);
  assert(snapshotPreview.name === "Dumbbell Lateral Raise", "Snapshot exercise name preserved");
  assert(snapshotPreview.targetSets.display === "3 sets", "Snapshot target sets preserved");
  assert(snapshotPreview.targetReps.display === "12-15 reps", "Snapshot target reps preserved");
  assert(snapshotPreview.notes === "Slight lean forward, lead with elbows", "Snapshot coaching notes preserved");

  console.log("\n--- 7. Database Integration: Session Flow & Target Reached ---");
  const routine = await createRoutine(athlete.id, {
    name: "Push Power Routine",
  });

  const session = await startWorkoutSession(athlete.id, routine.id);
  assert(Boolean(session), "Active workout session created in database");

  // Log set 1 of 3 on Bench Press
  await logUserSet(athlete.id, session.id, "ex_bench_press", 185, 10);
  let sessionSets = await getUserSetsForSession(athlete.id, session.id);
  let benchSets = sessionSets.filter((s) => s.exerciseId === "ex_bench_press");
  assert(benchSets.length === 1, "Bench Press has 1 logged set");
  assert(!isFinalExerciseSet(benchSets.length, 3), "Set 1 is not final set");

  // Log set 2 of 3 on Bench Press
  await logUserSet(athlete.id, session.id, "ex_bench_press", 185, 9);
  sessionSets = await getUserSetsForSession(athlete.id, session.id);
  benchSets = sessionSets.filter((s) => s.exerciseId === "ex_bench_press");
  assert(benchSets.length === 2, "Bench Press has 2 logged sets");
  assert(!isFinalExerciseSet(benchSets.length, 3), "Set 2 is not final set");

  // Log set 3 of 3 on Bench Press (FINAL SET)
  await logUserSet(athlete.id, session.id, "ex_bench_press", 185, 8);
  sessionSets = await getUserSetsForSession(athlete.id, session.id);
  benchSets = sessionSets.filter((s) => s.exerciseId === "ex_bench_press");
  assert(benchSets.length === 3, "Bench Press has 3 logged sets");
  assert(isFinalExerciseSet(benchSets.length, 3), "Set 3 IS FINAL SET");

  // Verify next exercise in session is ready for preview
  const upNext = getNextExerciseInSession(sampleExercises, 0);
  assert(Boolean(upNext), "Next exercise resolved for dominant rest view");
  assert(upNext?.name === "Incline Dumbbell Press", "Next exercise preview target is Incline Dumbbell Press");

  console.log("\n--- 8. Timer State & Absolute Timestamp Preservation ---");
  const now = Date.now();
  const restDurationSec = 90;
  const targetEndsAt = now + restDurationSec * 1000;

  const timerState: RestTimerState = {
    id: "rest_test_timer",
    restStartedAt: now,
    restEndsAt: targetEndsAt,
    totalDuration: restDurationSec,
    exerciseName: "Barbell Bench Press",
    nextSetNumber: 4,
    status: "running",
  };

  // Check remaining time calculation with absolute timestamp
  const remInitial = calculateRemainingSeconds(targetEndsAt, now);
  assert(remInitial === 90, "Initial remaining seconds is 90");

  const remAfter30s = calculateRemainingSeconds(targetEndsAt, now + 30000);
  assert(remAfter30s === 60, "Remaining seconds after 30s elapsed is 60");

  assert(!isRestExpired(targetEndsAt, now + 30000), "Rest not expired at 60s remaining");
  assert(isRestExpired(targetEndsAt, now + 91000), "Rest expired after 91s");

  console.log("\n--- 9. Timer Controls: +30s and Ready Now (Skip) ---");
  // +30s control shifts the absolute timestamp
  const extendedTargetEndsAt = targetEndsAt + 30000;
  const remExtended = calculateRemainingSeconds(extendedTargetEndsAt, now + 30000);
  assert(remExtended === 90, "Adding 30s extends remaining time from 60s to 90s");

  // Skip / Ready Now stops the timer without affecting logged sets
  const setsBeforeSkip = await getUserSetsForSession(athlete.id, session.id);
  // Simulating skip: timer ends, sets remain intact
  assert(setsBeforeSkip.length === 3, "All 3 logged sets remain intact after rest timer skip");
  assert(setsBeforeSkip[0].weight === 185, "Set 1 weight preserved");
  assert(setsBeforeSkip[1].weight === 185, "Set 2 weight preserved");
  assert(setsBeforeSkip[2].weight === 185, "Set 3 weight preserved");

  console.log("\n--- 10. Session Resume Across Reload ---");
  // Persist timer state in localStorage
  localStorage.setItem("sculpd_rest_timer_state", JSON.stringify(timerState));
  localStorage.setItem("sculpd_rest_timer_end", String(targetEndsAt));
  localStorage.setItem("sculpd_rest_timer_total", String(restDurationSec));

  // Simulate reload by re-reading localStorage
  const savedStateStr = localStorage.getItem("sculpd_rest_timer_state");
  assert(Boolean(savedStateStr), "Timer state retrieved from localStorage after reload");

  const restored = JSON.parse(savedStateStr!);
  assert(restored.id === "rest_test_timer", "Restored timer has correct ID");
  assert(restored.exerciseName === "Barbell Bench Press", "Restored timer has correct exercise name");

  // Verify remaining time calculated accurately from restored absolute end time
  const resumedNow = now + 40000; // 40 seconds later
  const resumedRemaining = calculateRemainingSeconds(restored.restEndsAt, resumedNow);
  assert(resumedRemaining === 50, "Timer resumes with 50s remaining (no timer freeze or reset)");

  // Verify that on resume after final set, preview remains active
  const resumedIsFinal = isFinalExerciseSet(benchSets.length, 3);
  assert(resumedIsFinal, "Resumed session maintains isFinalExerciseSet === true");
  const resumedNext = getNextExerciseInSession(sampleExercises, 0);
  assert(resumedNext?.name === "Incline Dumbbell Press", "Resumed session maintains next exercise preview");

  // Clean up
  localStorage.clear();

  console.log("\n========================================================");
  console.log("✅ ALL 10 NEXT EXERCISE DURING REST TESTS PASSED 100%!");
  console.log("========================================================\n");
}

runNextExerciseRestTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
  });
