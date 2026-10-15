// test/achievements-ranks-accountability.test.ts
import "fake-indexeddb/auto";
import { db } from "../lib/db/index";
import { createUser } from "../lib/db/user-repository";
import { createRoutine } from "../lib/db/routine-repository";
import {
  startWorkoutSession,
  completeWorkoutSession,
  logUserSet,
  backfillHistoricalWorkoutSession,
} from "../lib/db/workout-repository";
import {
  getMonthlyAccountabilitySummary,
  recordWorkoutSkip,
  cancelWorkoutSkip,
  recordFitnessAlternative,
  handleWorkoutCompletedOnDate,
  isPlannedWorkoutDay,
  FREE_SKIPS_PER_MONTH,
  MIN_ALTERNATIVE_MINUTES,
} from "../lib/accountability/accountability-service";
import {
  getLifetimeProgressionSummary,
  RANKS,
  ACHIEVEMENT_DEFINITIONS,
} from "../lib/progression/progression-service";
import { getCalendarMonthData } from "../lib/calendar/calendar-service";
import { createBackup, restoreBackup, validateBackup } from "../lib/db/backup";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`❌ Assertion Failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

async function runTests() {
  console.log("=== Sculp'd Task 05: Achievements, Ranks & Accountability Test Suite ===\n");

  const userA = await createUser({
    displayName: "Alex Vance",
    pin: "1234",
  });

  const userB = await createUser({
    displayName: "Sam Fisher",
    pin: "5678",
  });

  const routineA = await createRoutine(userA.id, {
    name: "Upper Hypertrophy",
    daysOfWeek: ["Monday", "Wednesday", "Friday"],
  });

  // -------------------------------------------------------------
  // Test 1: Monthly Free Skips Allowance & Non-Rollover
  // -------------------------------------------------------------
  console.log("Test 1: Monthly Free Skips Allowance & Non-Rollover");
  {
    const summaryOct = await getMonthlyAccountabilitySummary(userA.id, "2026-10-15");
    assert(summaryOct.freeSkipsTotal === 3, "User receives exactly 3 free skips per calendar month");
    assert(summaryOct.freeSkipsUsed === 0, "Initial free skips used is 0");
    assert(summaryOct.freeSkipsRemaining === 3, "Initial free skips remaining is 3");
    assert(summaryOct.earnedSkipsAvailable === 0, "No earned skips initially");
    assert(summaryOct.totalSkipsAvailable === 3, "Total skips available is 3");

    // Skip on 2026-10-05
    const skip1 = await recordWorkoutSkip(userA.id, {
      dateKey: "2026-10-05",
      routineName: routineA.name,
      routineId: routineA.id,
      reason: "Feeling exhausted after travel",
    });
    assert(skip1.skipType === "free", "First skip is designated as free skip");

    // Skip on 2026-10-07
    const skip2 = await recordWorkoutSkip(userA.id, {
      dateKey: "2026-10-07",
      routineName: routineA.name,
      reason: "Work deadline",
    });
    assert(skip2.skipType === "free", "Second skip is designated as free skip");

    // Check October allowance
    const updatedOct = await getMonthlyAccountabilitySummary(userA.id, "2026-10-15");
    assert(updatedOct.freeSkipsUsed === 2, "2 free skips used in October");
    assert(updatedOct.freeSkipsRemaining === 1, "1 free skip remaining in October");

    // Check November allowance (non-rollover: should still have full 3 free skips)
    const summaryNov = await getMonthlyAccountabilitySummary(userA.id, "2026-11-02");
    assert(summaryNov.freeSkipsUsed === 0, "November has 0 free skips used (non-rollover)");
    assert(summaryNov.freeSkipsRemaining === 3, "November has full 3 free skips remaining");
  }

  // -------------------------------------------------------------
  // Test 2: Fitness Alternatives & Permanent Earned Skips
  // -------------------------------------------------------------
  console.log("\nTest 2: Fitness Alternatives & Permanent Earned Skips");
  {
    // Activity < 20 min -> does NOT earn a skip
    const shortMobility = await recordFitnessAlternative(userA.id, {
      activityType: "mobility",
      title: "15-minute quick stretch",
      durationMinutes: 15,
      dateKey: "2026-10-06",
      notes: "Hamstring and shoulder flossing",
    });
    assert(!shortMobility.skipEarned, "Activity under 20 minutes does not earn a skip");

    // Activity >= 20 min -> earns 1 permanent skip
    const briskWalk = await recordFitnessAlternative(userA.id, {
      activityType: "walking",
      title: "Evening 35-minute outdoor walk",
      durationMinutes: 35,
      dateKey: "2026-10-08",
      notes: "Steady pace zone 1 walk",
    });
    assert(briskWalk.skipEarned, "Activity >= 20 minutes earns 1 skip");

    // Another qualifying activity: light cardio
    const lightCardio = await recordFitnessAlternative(userA.id, {
      activityType: "light_cardio",
      title: "Stationary bike zone 2",
      durationMinutes: 20,
      dateKey: "2026-10-09",
    });
    assert(lightCardio.skipEarned, "Exactly 20 minutes earns 1 skip");

    const summaryOct = await getMonthlyAccountabilitySummary(userA.id, "2026-10-15");
    assert(summaryOct.earnedSkipsTotal === 2, "Total earned skips is 2");
    assert(summaryOct.earnedSkipsAvailable === 2, "Earned skips available is 2");
    assert(summaryOct.totalSkipsAvailable === 3, "1 free remaining + 2 earned = 3 total skips available");

    // Verify earned skips carry over to November
    const summaryNov = await getMonthlyAccountabilitySummary(userA.id, "2026-11-02");
    assert(summaryNov.earnedSkipsAvailable === 2, "Earned skips carry over to subsequent months");
    assert(summaryNov.totalSkipsAvailable === 5, "November has 3 free + 2 earned = 5 total skips available");
  }

  // -------------------------------------------------------------
  // Test 3: Exhausting Free Skips and Consuming Earned Skips
  // -------------------------------------------------------------
  console.log("\nTest 3: Exhausting Free Skips and Consuming Earned Skips");
  {
    // October has 1 free skip remaining. Use it:
    const skip3 = await recordWorkoutSkip(userA.id, {
      dateKey: "2026-10-12",
      reason: "Family event",
    });
    assert(skip3.skipType === "free", "Third October skip exhausts free allowance");

    let summaryOct = await getMonthlyAccountabilitySummary(userA.id, "2026-10-15");
    assert(summaryOct.freeSkipsRemaining === 0, "Free skips remaining is now 0");
    assert(summaryOct.earnedSkipsAvailable === 2, "2 earned skips still available");

    // Fourth October skip -> consumes an earned skip!
    const skip4 = await recordWorkoutSkip(userA.id, {
      dateKey: "2026-10-14",
      reason: "Minor muscle soreness",
    });
    assert(skip4.skipType === "earned", "Fourth October skip consumes an earned skip");

    summaryOct = await getMonthlyAccountabilitySummary(userA.id, "2026-10-15");
    assert(summaryOct.freeSkipsRemaining === 0, "Free skips still 0");
    assert(summaryOct.earnedSkipsUsed === 1, "1 earned skip has been used");
    assert(summaryOct.earnedSkipsAvailable === 1, "1 earned skip remains available");

    // Fifth skip consumes last earned skip
    const skip5 = await recordWorkoutSkip(userA.id, {
      dateKey: "2026-10-16",
      reason: "Migraine",
    });
    assert(skip5.skipType === "earned", "Fifth skip consumes remaining earned skip");

    summaryOct = await getMonthlyAccountabilitySummary(userA.id, "2026-10-16");
    assert(summaryOct.totalSkipsAvailable === 0, "Total skips available is now 0");

    // Sixth skip must fail with allowance error
    let threwExhausted = false;
    try {
      await recordWorkoutSkip(userA.id, {
        dateKey: "2026-10-19",
        reason: "Tired",
      });
    } catch (err: any) {
      threwExhausted = true;
      assert(err.message.includes("No skips available"), "Clear error when skips are exhausted");
    }
    assert(threwExhausted, "Rejects skip when all free and earned skips are exhausted");

    // Duplicate skip rejection on same dateKey
    let threwDuplicate = false;
    try {
      await recordWorkoutSkip(userA.id, {
        dateKey: "2026-10-16", // already skipped
        reason: "Duplicate attempt",
      });
    } catch (err: any) {
      threwDuplicate = true;
      assert(err.message.includes("already marked as skipped"), "Clear error on duplicate skip for same date");
    }
    assert(threwDuplicate, "Rejects duplicate skip on the same date");
  }

  // -------------------------------------------------------------
  // Test 4: Un-skipping and Workout Completion Superseding
  // -------------------------------------------------------------
  console.log("\nTest 4: Un-skipping and Workout Completion Superseding");
  {
    // Cancel skip5 (which was earned) -> refunds the earned credit
    const skip5 = (await db.skips.where({ userId: userA.id, dateKey: "2026-10-16" }).first())!;
    await cancelWorkoutSkip(userA.id, skip5.id);

    let summaryOct = await getMonthlyAccountabilitySummary(userA.id, "2026-10-16");
    assert(summaryOct.earnedSkipsAvailable === 1, "Cancelling skip restored 1 earned skip credit");
    assert(summaryOct.totalSkipsAvailable === 1, "Total available is back to 1");

    // Athlete skipped 2026-10-14, but then decides to train anyway and logs a workout!
    await handleWorkoutCompletedOnDate(userA.id, "2026-10-14");

    const skip4 = (await db.skips.where({ userId: userA.id, dateKey: "2026-10-14" }).first())!;
    assert(Boolean(skip4.supersededBySessionId), "Skip record is marked superseded: true");

    summaryOct = await getMonthlyAccountabilitySummary(userA.id, "2026-10-14");
    assert(summaryOct.earnedSkipsAvailable === 2, "Completing workout refunded the earned skip credit");
    assert(summaryOct.totalSkipsAvailable === 2, "Total available is now 2");
  }

  // -------------------------------------------------------------
  // Test 5: Planned Workout Day Recognition
  // -------------------------------------------------------------
  console.log("\nTest 5: Planned Workout Day Recognition");
  {
    // Routine A daysOfWeek: Monday, Wednesday, Friday
    // 2026-10-12 is a Monday
    const mondayCheck = await isPlannedWorkoutDay(userA.id, "2026-10-12");
    assert(mondayCheck.isPlanned === true, "Monday recognized as planned workout day");
    assert(mondayCheck.routineName === "Upper Hypertrophy", "Identified scheduled routine name");

    // 2026-10-13 is a Tuesday
    const tuesdayCheck = await isPlannedWorkoutDay(userA.id, "2026-10-13");
    assert(tuesdayCheck.isPlanned === false, "Tuesday recognized as non-planned rest day");
  }

  // -------------------------------------------------------------
  // Test 6: Calendar Month Integration
  // -------------------------------------------------------------
  console.log("\nTest 6: Calendar Month Integration");
  {
    const monthData = await getCalendarMonthData(userA.id, 2026, 9); // October is month index 9
    assert(monthData.daysWithSkippedWorkouts.has("2026-10-05"), "Calendar flags skipped workout date 2026-10-05");
    assert(monthData.daysWithAlternatives.has("2026-10-08"), "Calendar flags fitness alternative date 2026-10-08");

    const skipOnOct5 = monthData.skipsByDate.get("2026-10-05");
    assert(Boolean(skipOnOct5), "Calendar indexes skip detail for 2026-10-05");
    assert(skipOnOct5?.reason === "Feeling exhausted after travel", "Preserves skip reason in calendar index");

    const altsOnOct8 = monthData.alternativesByDate.get("2026-10-08");
    assert(Array.isArray(altsOnOct8) && altsOnOct8.length === 1, "Calendar indexes alternative detail for 2026-10-08");
    assert(altsOnOct8?.[0].type === "walking", "Preserves alternative type in calendar index");
  }

  // -------------------------------------------------------------
  // Test 7: Lifter Ranks Multi-Metric Progression
  // -------------------------------------------------------------
  console.log("\nTest 7: Lifter Ranks Multi-Metric Progression");
  {
    // Clean user with 0 sessions
    const emptyProgression = await getLifetimeProgressionSummary(userB.id);
    assert(emptyProgression.rank.currentRank.level === 1, "Initial rank is Level 1 Bronze Lifter");
    assert(emptyProgression.rank.nextRank?.level === 2, "Next rank target is Level 2 Silver Lifter");
    assert(emptyProgression.rank.progressPercent === 0, "Progress percent to silver is 0%");
    assert(emptyProgression.rank.requirementsNeeded?.workoutsRemaining === 5, "Needs 5 workouts for Silver");
    assert(emptyProgression.rank.requirementsNeeded?.prsRemaining === 1, "Needs 1 PR for Silver");
    assert(emptyProgression.rank.requirementsNeeded?.volumeRemaining === 5000, "Needs 5,000 lb volume for Silver");

    const routineB = await createRoutine(userB.id, {
      name: "Full Body Iron",
    });

    // Log 5 completed workouts with progressive overload for User B:
    // Session 1 establishes baseline at 150 lb (not a PR)
    // Session 2 beats prior baseline at 160 lb (verified Weight PR!)
    // Sessions 3, 4, 5 continue training at 160 lb
    for (let i = 1; i <= 5; i++) {
      const session = await backfillHistoricalWorkoutSession(userB.id, {
        routineId: routineB.id,
        historicalDate: `2026-09-0${i}`,
      });

      const weightToLift = i === 1 ? 150 : 160;
      await logUserSet(
        userB.id,
        session.id,
        "std_ex_bench_press",
        weightToLift,
        10
      );
    }

    const fiveWorkoutProgression = await getLifetimeProgressionSummary(userB.id);
    assert(fiveWorkoutProgression.totalCompletedWorkouts === 5, "Completed 5 workouts");
    assert(fiveWorkoutProgression.totalVolume === 7900, "Accumulated 7,900 lb volume (>5,000 min requirement)");
    assert(fiveWorkoutProgression.verifiedPRCount === 1, "Session 2 beats baseline to earn 1 verified PR");
    assert(fiveWorkoutProgression.rank.currentRank.level === 2, "Advanced to Level 2 Silver Lifter with 5 workouts, 1 PR, and >5,000 lb");
    assert(fiveWorkoutProgression.rank.currentRank.title === "Silver Lifter", "Silver Lifter title confirmed");
  }

  // -------------------------------------------------------------
  // Test 8: Deterministic Achievement Unlocking
  // -------------------------------------------------------------
  console.log("\nTest 8: Deterministic Achievement Unlocking");
  {
    const summary = await getLifetimeProgressionSummary(userB.id);
    const firstStep = summary.achievements.find((a) => a.id === "consistency_first_workout")!;
    assert(firstStep.isUnlocked === true, "First Step achievement is unlocked");
    assert(Boolean(firstStep.unlockedAt), "Achievement has accurate unlockedAt timestamp");

    const prFirst = summary.achievements.find((a) => a.id === "pr_first")!;
    assert(prFirst.isUnlocked === true, "First PR achievement is unlocked");

    const tenDown = summary.achievements.find((a) => a.id === "milestone_10")!;
    assert(tenDown.isUnlocked === false, "10 Workouts Milestone is in progress");
    assert(tenDown.progressPercent === 50, "10 Workouts Milestone reflects 50% progress");

    const centuryClub = summary.achievements.find((a) => a.id === "milestone_100")!;
    assert(centuryClub.isUnlocked === false, "100 Workouts Milestone remains locked");
    assert(centuryClub.progressPercent === 5, "Century Club reflects exact 5% progress");

    // Idempotence: recalculating produces identical unlock count
    const recalc = await getLifetimeProgressionSummary(userB.id);
    assert(recalc.unlockedAchievementsCount === summary.unlockedAchievementsCount, "Recalculation is completely idempotent with 0 duplicates");
  }

  // -------------------------------------------------------------
  // Test 9: Backup and Restore Integrity
  // -------------------------------------------------------------
  console.log("\nTest 9: Backup and Restore Integrity");
  {
    const backup = await createBackup();
    assert(Array.isArray(backup.data.skips) && backup.data.skips.length > 0, "Backup includes skips store records");
    assert(Array.isArray(backup.data.fitnessAlternatives) && backup.data.fitnessAlternatives.length > 0, "Backup includes fitnessAlternatives store records");

    const jsonString = JSON.stringify(backup);
    const restoreResult = await restoreBackup(jsonString, { strategy: "replace" });
    assert(restoreResult.success, "Backup restore succeeded");

    const restoredSkipsCount = await db.skips.count();
    const restoredAltsCount = await db.fitnessAlternatives.count();
    assert(restoredSkipsCount > 0, "Restored skips into database");
    assert(restoredAltsCount > 0, "Restored fitness alternatives into database");
    assert(restoredSkipsCount === backup.data.skips.length, "All skips preserved during restore");
  }

  // -------------------------------------------------------------
  // Test 10: Strict User Isolation
  // -------------------------------------------------------------
  console.log("\nTest 10: Strict User Isolation");
  {
    const userASummary = await getMonthlyAccountabilitySummary(userA.id, "2026-10-15");
    const userBSummary = await getMonthlyAccountabilitySummary(userB.id, "2026-10-15");

    assert(userASummary.earnedSkipsTotal === 2, "User A has 2 earned skips");
    assert(userBSummary.earnedSkipsTotal === 0, "User B has 0 earned skips (no data bleed)");

    let threwEmptyUserId = false;
    try {
      await recordWorkoutSkip("   ", {
        dateKey: "2026-10-15",
      });
    } catch {
      threwEmptyUserId = true;
    }
    assert(threwEmptyUserId, "Strict User Isolation blocks empty userId on skip mutations");

    let threwEmptyAltUserId = false;
    try {
      await recordFitnessAlternative("", {
        activityType: "walking",
        title: "Walk",
        durationMinutes: 30,
        dateKey: "2026-10-15",
      });
    } catch {
      threwEmptyAltUserId = true;
    }
    assert(threwEmptyAltUserId, "Strict User Isolation blocks empty userId on alternative mutations");
  }

  console.log("\n🎉 All 10 Task 05 verification test suites passed successfully!");
}

runTests().catch((err) => {
  console.error("FATAL TEST FAILURE:", err);
  process.exit(1);
});
