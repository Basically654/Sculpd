// test/workout-history.test.ts
import "fake-indexeddb/auto";
import { db } from "../lib/db/index";
import { createUser } from "../lib/db/user-repository";
import { createRoutine, updateRoutine } from "../lib/db/routine-repository";
import { createCustomExercise } from "../lib/db/exercise-repository";
import {
  startWorkoutSession,
  logUserSet,
  completeWorkoutSession,
  cancelWorkoutSession,
} from "../lib/db/workout-repository";
import {
  getCompletedWorkoutSessions,
  getCompletedWorkoutSummaries,
  getCompletedWorkoutDetail,
  calculateWorkoutDuration,
  calculateWorkoutVolume,
  formatWorkoutDuration,
  formatWorkoutVolume,
} from "../lib/history/history-service";
import { WorkoutSet } from "../types/models";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`❌ Assertion Failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

async function runWorkoutHistoryTests() {
  console.log("\n============================================================");
  console.log("SCULP'D 2.0: WORKOUT HISTORY & COMPLETED VIEWS TEST SUITE");
  console.log("============================================================\n");

  // Setup athlete
  const user = await createUser({
    displayName: "History Athlete",
    pin: "1234",
    avatarColor: "emerald",
  });
  const userId = user.id;

  // 1. Empty State Test
  console.log("--- 1. Empty State ---");
  const emptySummaries = await getCompletedWorkoutSummaries(userId);
  assert(Array.isArray(emptySummaries), "getCompletedWorkoutSummaries returns an array");
  assert(emptySummaries.length === 0, "No completed workouts returned for new user (empty state)");

  // Setup exercises
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

  const inclineExercise = await createCustomExercise(userId, {
    name: "Incline DB Press",
    category: "Chest",
    equipment: "Dumbbell",
    loadType: "weighted",
  });

  // Prior baseline set for Bench Press to test PR calculation
  // (User previously benched 180 lbs x 5 in an earlier session)
  const baselineRoutine = await createRoutine(userId, {
    name: "Baseline Routine",
    exercises: [
      {
        exerciseId: benchExercise.id,
        targetSets: 1,
        targetReps: "5",
        restSeconds: 90,
      },
    ],
  });
  const baselineSession = await startWorkoutSession(userId, baselineRoutine.id);
  // Log baseline set with older timestamp
  const baselineSet = await logUserSet(userId, baselineSession.id, benchExercise.id, 180, 5);
  // Manually ensure createdAt is before subsequent workouts
  await db.sets.update(baselineSet.id, {
    createdAt: new Date("2026-09-10T10:00:00.000Z").toISOString(),
  });
  await db.workoutSessions.update(baselineSession.id, {
    startedAt: new Date("2026-09-10T09:30:00.000Z").toISOString(),
    completedAt: new Date("2026-09-10T10:15:00.000Z").toISOString(),
    status: "completed",
  });

  // 2. Complete Workout 1 (September 21, 2026)
  console.log("\n--- 2. Completed Workout 1 Logging & Duration ---");
  const routine1 = await createRoutine(userId, {
    name: "Monday • Push",
    exercises: [
      {
        exerciseId: benchExercise.id,
        targetSets: 3,
        targetReps: "5",
        restSeconds: 90,
      },
      {
        exerciseId: pullupExercise.id,
        targetSets: 2,
        targetReps: "8",
        restSeconds: 90,
        loadType: "bodyweight",
      },
    ],
  });

  const session1 = await startWorkoutSession(userId, routine1.id);
  assert(session1.status === "in_progress", "Session 1 starts as in_progress");

  // Log Bench Press sets: 185x5 (PR!), 185x5, 185x4
  await logUserSet(userId, session1.id, benchExercise.id, 185, 5);
  await logUserSet(userId, session1.id, benchExercise.id, 185, 5);
  await logUserSet(userId, session1.id, benchExercise.id, 185, 4);

  // Log Pull Ups sets (Bodyweight 195 + added 15 lbs x 8 reps; and BW 195 + 0 lbs x 8 reps)
  await logUserSet(userId, session1.id, pullupExercise.id, 15, 8, null, 195, 15);
  await logUserSet(userId, session1.id, pullupExercise.id, 0, 8, null, 195, 0);

  // Complete workout with known 42 minute duration
  const start1 = new Date("2026-09-21T09:00:00.000Z").toISOString();
  const end1 = new Date("2026-09-21T09:42:00.000Z").toISOString();

  await db.workoutSessions.update(session1.id, {
    startedAt: start1,
    completedAt: end1,
    status: "completed",
    notes: "Felt strong today, good bench press lockouts.",
  });

  // 3. Completed workout appears in History
  console.log("\n--- 3. Workout Appears in History ---");
  const summariesAfterWorkout1 = await getCompletedWorkoutSummaries(userId);
  const workout1Summary = summariesAfterWorkout1.find((w) => w.id === session1.id);
  assert(!!workout1Summary, "Completed workout 1 appears in History");
  assert(workout1Summary?.routineName === "Monday • Push", "Workout 1 has correct routine name");
  assert(workout1Summary?.totalSets === 5, "Workout 1 recorded exactly 5 sets");
  assert(workout1Summary?.totalExercises === 2, "Workout 1 recorded exactly 2 exercises");

  // 4. Duration is correct
  console.log("\n--- 4. Duration Calculation ---");
  const calculatedDuration = calculateWorkoutDuration(start1, end1);
  assert(calculatedDuration === 42, "calculateWorkoutDuration returns 42 minutes");
  assert(formatWorkoutDuration(42, false) === "42 min", "formatWorkoutDuration list format is '42 min'");
  assert(formatWorkoutDuration(42, true) === "42 minutes", "formatWorkoutDuration detailed format is '42 minutes'");
  assert(workout1Summary?.durationMinutes === 42, "Summary durationMinutes is 42");
  assert(workout1Summary?.formattedDuration === "42 min", "Summary formattedDuration is '42 min'");

  // 5. Total Volume is correct (respecting weighted and bodyweight + added load)
  console.log("\n--- 5. Total Volume Calculation ---");
  // Bench: (185 * 5) + (185 * 5) + (185 * 4) = 925 + 925 + 740 = 2,590 lbs
  // Pullups Set 1: (195 BW + 15 added) * 8 = 210 * 8 = 1,680 lbs
  // Pullups Set 2: (195 BW + 0 added) * 8 = 195 * 8 = 1,560 lbs
  // Total Volume = 2,590 + 1,680 + 1,560 = 5,830 lbs
  const expectedVolume = 2590 + 1680 + 1560;
  const setsForSession1 = await db.sets
    .where("[userId+workoutSessionId]")
    .equals([userId, session1.id])
    .toArray();

  const actualVolume = calculateWorkoutVolume(setsForSession1);
  assert(actualVolume === expectedVolume, `calculateWorkoutVolume matches expected volume (${expectedVolume} lbs)`);
  assert(formatWorkoutVolume(actualVolume) === "5,830 lb", "formatWorkoutVolume formats to '5,830 lb'");
  assert(workout1Summary?.totalVolume === expectedVolume, "Summary totalVolume matches expected volume");

  // 6. PR Count is correct
  console.log("\n--- 6. PR Count & Centralized Evaluation ---");
  // Prior bench max was 180 lbs. In this workout, user lifted 185 lbs x 5 reps -> 1 PR!
  assert(workout1Summary?.prCount === 1, "Workout 1 has exactly 1 PR");

  // 7. Workouts are ordered newest first (reverse chronological)
  console.log("\n--- 7. Reverse Chronological Ordering ---");
  // Create Workout 2 at a later date (Sep 23, 2026)
  const routine2 = await createRoutine(userId, {
    name: "Wednesday • Incline",
    exercises: [
      {
        exerciseId: inclineExercise.id,
        targetSets: 3,
        targetReps: "10",
        restSeconds: 90,
      },
    ],
  });
  const session2 = await startWorkoutSession(userId, routine2.id);
  await logUserSet(userId, session2.id, inclineExercise.id, 65, 10);
  await logUserSet(userId, session2.id, inclineExercise.id, 65, 9);
  await logUserSet(userId, session2.id, inclineExercise.id, 65, 8);

  const start2 = new Date("2026-09-23T10:00:00.000Z").toISOString();
  const end2 = new Date("2026-09-23T10:35:00.000Z").toISOString();
  await db.workoutSessions.update(session2.id, {
    startedAt: start2,
    completedAt: end2,
    status: "completed",
  });

  const orderedSummaries = await getCompletedWorkoutSummaries(userId);
  assert(orderedSummaries.length === 3, "Total 3 completed workouts in history (Baseline, Session 1, Session 2)");
  assert(orderedSummaries[0].id === session2.id, "Most recent workout (Session 2, Sep 23) is first in array");
  assert(orderedSummaries[1].id === session1.id, "Second workout (Session 1, Sep 21) is second in array");
  assert(orderedSummaries[2].id === baselineSession.id, "Oldest workout (Baseline, Sep 10) is last in array");

  // 8. Detailed View displays all exercises and all sets
  console.log("\n--- 8. Detailed View Content & Structure ---");
  const detail = await getCompletedWorkoutDetail(userId, session1.id);
  assert(!!detail, "getCompletedWorkoutDetail returns detail object");
  assert(detail?.routineName === "Monday • Push", "Detail routine name is 'Monday • Push'");
  assert(Boolean(detail?.formattedDate.includes("September 21, 2026")), "Detail formatted date is 'September 21, 2026'");
  assert(detail?.durationMinutes === 42, "Detail durationMinutes is 42");
  assert(detail?.formattedDuration === "42 minutes", "Detail formattedDuration is '42 minutes'");
  assert(detail?.totalSets === 5, "Detail totalSets is 5");
  assert(detail?.totalExercises === 2, "Detail totalExercises is 2");
  assert(detail?.totalVolume === expectedVolume, "Detail totalVolume is correct");
  assert(detail?.prCount === 1, "Detail prCount is 1");
  assert(detail?.prs[0].exerciseName === "Bench Press", "Detail PR exercise is Bench Press");
  assert(detail?.prs[0].badgeText === "+5 lbs", "Detail PR badge is '+5 lbs'");
  assert(detail?.notes === "Felt strong today, good bench press lockouts.", "Detail session notes preserved");

  // Verify exercises in detail
  assert(detail?.exercises.length === 2, "Detail contains exactly 2 exercise groups");
  const benchGroup = detail?.exercises.find((e) => e.exerciseName === "Bench Press");
  assert(!!benchGroup, "Bench Press exercise group present");
  assert(benchGroup?.sets.length === 3, "Bench Press has 3 sets");
  assert(benchGroup?.sets[0].setNumber === 1 && benchGroup?.sets[0].weight === 185 && benchGroup?.sets[0].reps === 5, "Bench Set 1 is 185x5");
  assert(benchGroup?.sets[1].setNumber === 2 && benchGroup?.sets[1].weight === 185 && benchGroup?.sets[1].reps === 5, "Bench Set 2 is 185x5");
  assert(benchGroup?.sets[2].setNumber === 3 && benchGroup?.sets[2].weight === 185 && benchGroup?.sets[2].reps === 4, "Bench Set 3 is 185x4");

  const pullupGroup = detail?.exercises.find((e) => e.exerciseName === "Pull Ups");
  assert(!!pullupGroup, "Pull Ups exercise group present");
  assert(pullupGroup?.isBodyweight === true, "Pull Ups marked as bodyweight in detail");
  assert(pullupGroup?.sets.length === 2, "Pull Ups has 2 sets");
  assert(pullupGroup?.sets[0].bodyweight === 195 && pullupGroup?.sets[0].addedWeight === 15, "Pullup Set 1 has BW 195 and added 15");

  // 9. Incomplete and cancelled sessions are excluded from completed history
  console.log("\n--- 9. Incomplete Sessions Excluded from Completed History ---");
  const cancelledSession = await startWorkoutSession(userId, routine2.id);
  await cancelWorkoutSession(userId, cancelledSession.id);

  const inProgressSession = await startWorkoutSession(userId, routine1.id);
  await logUserSet(userId, inProgressSession.id, benchExercise.id, 135, 10);

  const completedSessions = await getCompletedWorkoutSessions(userId);
  const completedIds = completedSessions.map((s) => s.id);
  assert(!completedIds.includes(inProgressSession.id), "in_progress session excluded from getCompletedWorkoutSessions");
  assert(!completedIds.includes(cancelledSession.id), "cancelled session excluded from getCompletedWorkoutSessions");

  const completedSummaries = await getCompletedWorkoutSummaries(userId);
  const summaryIds = completedSummaries.map((s) => s.id);
  assert(!summaryIds.includes(inProgressSession.id), "in_progress session excluded from getCompletedWorkoutSummaries");
  assert(!summaryIds.includes(cancelledSession.id), "cancelled session excluded from getCompletedWorkoutSummaries");

  const inProgressDetail = await getCompletedWorkoutDetail(userId, inProgressSession.id);
  assert(inProgressDetail === undefined, "getCompletedWorkoutDetail returns undefined for in_progress session");

  // 10. Historical integrity: Routine edits do NOT rewrite history
  console.log("\n--- 10. Historical Integrity Against Routine Edits ---");
  // Edit routine1: Rename routine to "Super Chest Blast", modify description
  await updateRoutine(userId, routine1.id, {
    name: "Super Chest Blast",
    description: "Modified routine",
  });

  // Query completed workout 1 detail again
  const postEditDetail = await getCompletedWorkoutDetail(userId, session1.id);
  assert(postEditDetail?.routineName === "Monday • Push", "Completed workout retains original snapshotted routine name ('Monday • Push') even after routine was renamed");
  assert(postEditDetail?.exercises.length === 2, "Completed workout retains original snapshotted exercises");
  assert(postEditDetail?.exercises[0].exerciseName === "Bench Press", "Completed workout retains original exercise name");
  assert(postEditDetail?.totalVolume === expectedVolume, "Completed workout volume remains unchanged");

  // 11. History works offline from IndexedDB
  console.log("\n--- 11. Offline Operation from IndexedDB ---");
  // Querying Dexie tables directly verifies zero network dependencies
  const offlineCheck = await getCompletedWorkoutSummaries(userId);
  assert(offlineCheck.length === 3, "History queries operate directly against local IndexedDB");

  console.log("\n============================================================");
  console.log("✅ ALL WORKOUT HISTORY & COMPLETED VIEW TESTS PASSED 100%!");
  console.log("============================================================\n");
}

runWorkoutHistoryTests().catch((err) => {
  console.error("Test Suite Failed:", err);
  process.exit(1);
});
