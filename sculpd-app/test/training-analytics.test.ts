// test/training-analytics.test.ts
import "fake-indexeddb/auto";
import { db } from "../lib/db/index";
import { createUser } from "../lib/db/user-repository";
import { createRoutine } from "../lib/db/routine-repository";
import { createCustomExercise } from "../lib/db/exercise-repository";
import {
  startWorkoutSession,
  logUserSet,
  completeWorkoutSession,
  cancelWorkoutSession,
} from "../lib/db/workout-repository";
import {
  getAnalyticsExercises,
  getExerciseProgression,
  getWorkoutConsistency,
  getVolumeTrends,
  getAllPRHistory,
} from "../lib/analytics/analytics-service";
import { calculateE1RM } from "../lib/pr/pr-detector";
import { getEffectiveLoad, formatSetSummary } from "../lib/load/load-utils";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`❌ Assertion Failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

async function runTrainingAnalyticsTests() {
  console.log("\n============================================================");
  console.log("SCULP'D 2.0: TRAINING ANALYTICS & PROGRESSION TEST SUITE");
  console.log("============================================================\n");

  // Setup Athlete
  const user = await createUser({
    displayName: "Analytics Athlete",
    pin: "4321",
    avatarColor: "violet",
    bodyweight: 190,
  });
  const userId = user.id;

  // Setup Exercises
  const benchExercise = await createCustomExercise(userId, {
    name: "Bench Press",
    category: "Chest",
    equipment: "Barbell",
    loadType: "weighted",
  });

  const pullupExercise = await createCustomExercise(userId, {
    name: "Pull Ups",
    category: "Back",
    equipment: "Bodyweight",
    loadType: "bodyweight",
  });

  const squatExercise = await createCustomExercise(userId, {
    name: "Barbell Squat",
    category: "Legs",
    equipment: "Barbell",
    loadType: "weighted",
  });

  const routine = await createRoutine(userId, {
    name: "Full Body Telemetry",
  });

  // --- 1. Empty & Sparse Data Handling ---
  console.log("--- 1. Empty & Sparse Data Handling ---");
  const emptyExercises = await getAnalyticsExercises(userId);
  assert(Array.isArray(emptyExercises), "getAnalyticsExercises returns an empty array for new athlete");
  assert(emptyExercises.length === 0, "No exercises reported before any completed workouts");

  const emptyProgression = await getExerciseProgression(userId, benchExercise.id);
  assert(emptyProgression === null, "getExerciseProgression returns null when no completed sessions exist for exercise");

  const emptyConsistency = await getWorkoutConsistency(userId);
  assert(emptyConsistency.totalCompletedWorkouts === 0, "0 completed workouts reported");
  assert(emptyConsistency.workoutsThisWeek === 0, "0 workouts this week reported");
  assert(emptyConsistency.workoutsThisMonth === 0, "0 workouts this month reported");
  assert(emptyConsistency.averageWorkoutsPerWeek === 0, "0 avg workouts/week without NaN");
  assert(emptyConsistency.daysSinceLastWorkout === null, "daysSinceLastWorkout is null");

  const emptyVolume = await getVolumeTrends(userId);
  assert(emptyVolume.allTimeTotalVolume === 0, "allTimeTotalVolume is 0 for empty history");
  assert(emptyVolume.workoutVolumePoints.length === 0, "workoutVolumePoints empty");
  assert(emptyVolume.weeklyVolumePoints.length === 0, "weeklyVolumePoints empty");

  const emptyPRs = await getAllPRHistory(userId);
  assert(Array.isArray(emptyPRs), "getAllPRHistory returns empty array");
  assert(emptyPRs.length === 0, "No PRs reported before workouts");

  // --- 2. Incomplete Session Exclusion ---
  console.log("\n--- 2. Incomplete Session Exclusion (Gym Floor Isolation) ---");
  // Start an active in-progress workout and log sets
  const activeSession = await startWorkoutSession(userId, routine.id);
  await logUserSet(userId, activeSession.id, benchExercise.id, 185, 5);

  // Start another session and cancel it
  const cancelledSession = await startWorkoutSession(userId, routine.id);
  await logUserSet(userId, cancelledSession.id, benchExercise.id, 225, 10);
  await cancelWorkoutSession(userId, cancelledSession.id);

  // Verify analytics strictly ignores active and cancelled sessions
  const activeCheckExercises = await getAnalyticsExercises(userId);
  assert(activeCheckExercises.length === 0, "In-progress and cancelled sessions are strictly excluded from analytics");

  const activeCheckProgression = await getExerciseProgression(userId, benchExercise.id);
  assert(activeCheckProgression === null, "Progression ignores uncompleted sets");

  // Clean up the active session before real workouts
  await cancelWorkoutSession(userId, activeSession.id);

  // --- 3. First Workout (Establishing Baseline) ---
  console.log("\n--- 3. First Workout (Establishing Baseline) ---");
  // Session 1: Sep 10, 2026
  const s1 = await startWorkoutSession(userId, routine.id);
  await logUserSet(userId, s1.id, benchExercise.id, 175, 5);
  await logUserSet(userId, s1.id, benchExercise.id, 175, 5);
  await logUserSet(userId, s1.id, pullupExercise.id, 0, 8, null, 190, 0);
  await completeWorkoutSession(userId, s1.id);

  // Update session timestamps for historical sequencing
  await db.workoutSessions.update(s1.id, {
    startedAt: "2026-09-10T14:00:00.000Z",
    completedAt: "2026-09-10T14:40:00.000Z",
  });

  // Verify baseline does NOT award false PRs (Sculp'd rule: first workout establishes baseline)
  const s1PRs = await getAllPRHistory(userId);
  assert(s1PRs.length === 0, "First workout sets baseline: 0 PRs awarded");

  // Verify exercises list
  const exercisesAfterS1 = await getAnalyticsExercises(userId);
  assert(exercisesAfterS1.length === 2, "2 exercises listed in analytics");
  assert(exercisesAfterS1.some((e) => e.name === "Bench Press"), "Bench Press is listed");
  assert(exercisesAfterS1.some((e) => e.name === "Pull Ups"), "Pull Ups is listed");

  // --- 4. Exercise Progression Aggregation ---
  console.log("\n--- 4. Exercise Progression Aggregation ---");
  // Session 2: Sep 14, 2026 - Bench 180x5 (Weight PR!), Pullups BW+10x6 (Added Weight PR!)
  const s2 = await startWorkoutSession(userId, routine.id);
  await logUserSet(userId, s2.id, benchExercise.id, 180, 5);
  await logUserSet(userId, s2.id, benchExercise.id, 180, 4);
  await logUserSet(userId, s2.id, pullupExercise.id, 10, 6, null, 190, 10);
  await completeWorkoutSession(userId, s2.id);
  await db.workoutSessions.update(s2.id, {
    startedAt: "2026-09-14T15:00:00.000Z",
    completedAt: "2026-09-14T15:45:00.000Z",
  });

  // Session 3: Sep 18, 2026 - Bench 180x6 (Rep PR!), Squat 225x5 (Baseline)
  const s3 = await startWorkoutSession(userId, routine.id);
  await logUserSet(userId, s3.id, benchExercise.id, 180, 6);
  await logUserSet(userId, s3.id, squatExercise.id, 225, 5);
  await completeWorkoutSession(userId, s3.id);
  await db.workoutSessions.update(s3.id, {
    startedAt: "2026-09-18T16:00:00.000Z",
    completedAt: "2026-09-18T16:50:00.000Z",
  });

  // Session 4: Sep 21, 2026 - Bench 185x5 (Weight PR!), Pullups BW+15x8 (Added Weight & Rep PR!)
  const s4 = await startWorkoutSession(userId, routine.id);
  await logUserSet(userId, s4.id, benchExercise.id, 185, 5);
  await logUserSet(userId, s4.id, pullupExercise.id, 15, 8, null, 190, 15);
  await completeWorkoutSession(userId, s4.id);
  await db.workoutSessions.update(s4.id, {
    startedAt: "2026-09-21T17:00:00.000Z",
    completedAt: "2026-09-21T17:55:00.000Z",
  });

  // Query Bench Press progression
  const benchProgression = await getExerciseProgression(userId, benchExercise.id);
  assert(benchProgression !== null, "Bench Press progression retrieved");
  assert(benchProgression!.totalWorkouts === 4, "4 completed workouts recorded for Bench Press");
  assert(benchProgression!.totalSets === 6, "6 total sets recorded for Bench Press");
  assert(benchProgression!.allTimeBestWeight?.weight === 185, "All-time best weight is 185 lbs");
  assert(benchProgression!.allTimeBestWeight?.reps === 5, "Best weight set reps is 5");
  assert(benchProgression!.history.length === 4, "Chronological history has 4 points");

  // Verify history list matches example:
  // Sep 21 185 x 5, Sep 18 180 x 6, Sep 14 180 x 5, Sep 10 175 x 5
  assert(benchProgression!.recentHistory[0].topSet.weight === 185, "Recent top set 1 is 185");
  assert(benchProgression!.recentHistory[1].topSet.weight === 180, "Recent top set 2 is 180");
  assert(benchProgression!.recentHistory[1].topSet.reps === 6, "Recent top set 2 reps is 6");
  assert(benchProgression!.recentHistory[2].topSet.weight === 180, "Recent top set 3 is 180");
  assert(benchProgression!.recentHistory[3].topSet.weight === 175, "Recent top set 4 is 175");

  // --- 5. Estimated 1RM Calculation ---
  console.log("\n--- 5. Estimated 1RM Calculation (Epley Formula) ---");
  // Test Epley formula standalone: weight * (1 + reps/30)
  // 185 x 5 => 185 * (1 + 5/30) = 185 * 1.166666... = 215.83 => round to 216
  const testE1RM = calculateE1RM(185, 5);
  assert(Math.round(testE1RM) === 216, "185 x 5 E1RM is 216 lbs");
  // 1 rep should return exact weight
  assert(calculateE1RM(200, 1) === 200, "1 rep E1RM returns exact weight (200)");

  // Progression best E1RM
  assert(benchProgression!.allTimeBestE1RM?.e1rm === 216, "Bench Press all-time best E1RM is 216 lb");
  assert(benchProgression!.recentE1RM?.e1rm === 216, "Recent E1RM is 216 lb");

  // --- 6. Bodyweight Exercise Calculations (BW + Added Weight) ---
  console.log("\n--- 6. Bodyweight Exercise Calculations ---");
  const pullupProgression = await getExerciseProgression(userId, pullupExercise.id);
  assert(pullupProgression !== null, "Pull Ups progression retrieved");
  assert(pullupProgression!.isBodyweight === true, "Pull Ups recognized as bodyweight");
  assert(pullupProgression!.loadType === "bodyweight", "loadType is bodyweight");

  // Best added weight was 15 lbs (at 190 bodyweight = 205 lbs effective)
  assert(pullupProgression!.allTimeBestWeight?.displayText === "BW + 15 lbs", "Best weight displays as BW + 15 lbs");
  assert(pullupProgression!.allTimeBestWeight?.effectiveWeight === 205, "Effective weight accounts for bodyweight (190 + 15 = 205)");

  // Pullup set 1: BW (190) x 8 = 1520 lbs
  // Pullup set 2: BW+10 (200) x 6 = 1200 lbs
  // Pullup set 3: BW+15 (205) x 8 = 1640 lbs
  // Total volume: 1520 + 1200 + 1640 = 4360 lbs
  assert(pullupProgression!.totalVolume === 4360, "Pullup total volume accurately calculates BW + added weight (4,360 lb)");

  // Pullup E1RM: 205 * (1 + 8/30) = 205 * 1.26666... = 259.66 => 260
  assert(pullupProgression!.allTimeBestE1RM?.e1rm === 260, "Pullup E1RM accurately factors in full effective load (260 lb)");

  // --- 7. Total Volume Calculation Across Workouts ---
  console.log("\n--- 7. Total Volume Calculation Across Workouts ---");
  const volumeTrends = await getVolumeTrends(userId);
  assert(volumeTrends.workoutVolumePoints.length === 4, "4 completed workouts in volume trend");
  assert(volumeTrends.allTimeTotalVolume > 0, "Cumulative volume calculated");
  assert(volumeTrends.averageWorkoutVolume > 0, "Average workout volume calculated");

  // Session 1 volume: Bench 175x5 (875) + 175x5 (875) + Pullup 190x8 (1520) = 3270 lbs
  const s1Point = volumeTrends.workoutVolumePoints.find((p) => p.sessionId === s1.id);
  assert(s1Point?.volume === 3270, "Session 1 volume matches expected (3,270 lb)");

  // Session 3 volume: Bench 180x6 (1080) + Squat 225x5 (1125) = 2205 lbs
  const s3Point = volumeTrends.workoutVolumePoints.find((p) => p.sessionId === s3.id);
  assert(s3Point?.volume === 2205, "Session 3 volume matches expected (2,205 lb)");

  // --- 8. PR History Verification ---
  console.log("\n--- 8. Chronological PR History ---");
  const allPRs = await getAllPRHistory(userId);
  assert(allPRs.length >= 3, `PRs detected across training history (found ${allPRs.length})`);

  // Most recent PR should be at the top (Sep 21)
  assert(allPRs[0].sessionId === s4.id, "Most recent PR is from Session 4");
  const benchPRs = allPRs.filter((p) => p.exerciseName === "Bench Press");
  assert(benchPRs.length >= 2, "Multiple Bench Press PRs logged (180x5, 180x6, 185x5)");

  const pullupPRs = allPRs.filter((p) => p.exerciseName === "Pull Ups");
  assert(pullupPRs.length >= 1, "Pullup PRs logged with BW context");
  assert(pullupPRs[0].isBodyweight === true, "Pullup PR flagged as bodyweight");
  assert(pullupPRs[0].setSummary.includes("BW"), "Pullup PR summary contains BW");

  // Specific exercise PR filter
  const benchSpecificPRs = await getAllPRHistory(userId, benchExercise.id);
  assert(benchSpecificPRs.every((p) => p.exerciseId === benchExercise.id), "Filtered PRs contain only Bench Press");

  // --- 9. Workout Consistency & Cadence ---
  console.log("\n--- 9. Workout Consistency & Cadence ---");
  const consistency = await getWorkoutConsistency(userId);
  assert(consistency.totalCompletedWorkouts === 4, "Total completed workouts is 4");
  assert(consistency.averageWorkoutsPerWeek > 0, "Average workouts per week calculated");
  assert(consistency.weeklyFrequency.length > 0, "Weekly frequency points populated");
  assert(typeof consistency.daysSinceLastWorkout === "number", "Days since last workout is a number");

  // --- 10. Immutability Verification ---
  console.log("\n--- 10. Historical Data Immutability ---");
  // Ensure that querying analytics did NOT alter or mutate any sessions or sets in IndexedDB
  const finalSessionsCount = await db.workoutSessions.where("userId").equals(userId).count();
  const finalSetsCount = await db.sets.where("userId").equals(userId).count();
  assert(finalSessionsCount === 5, "Total sessions in DB preserved exactly (4 completed + 1 cancelled)");
  assert(finalSetsCount === 12, "Total sets in DB preserved exactly without mutation");

  // Verify session 1 sets are untouched
  const s1FinalSets = await db.sets
    .where("workoutSessionId")
    .equals(s1.id)
    .toArray();
  assert(s1FinalSets.length === 3, "Session 1 sets unmodified");
  const s1BenchSets = s1FinalSets.filter((s) => s.exerciseId === benchExercise.id);
  assert(s1BenchSets.length === 2, "Session 1 has exactly 2 bench sets");
  assert(
    s1BenchSets.every((s) => s.weight === 175 && s.reps === 5),
    "Session 1 set values strictly immutable"
  );

  console.log("\n============================================================");
  console.log("✅ ALL TRAINING ANALYTICS & PROGRESSION TESTS PASSED 100%!");
  console.log("============================================================\n");
}

runTrainingAnalyticsTests().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
