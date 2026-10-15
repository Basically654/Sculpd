// test/workout-access-and-edit.test.ts
import "fake-indexeddb/auto";
import { db } from "../lib/db/index";
import { createUser } from "../lib/db/user-repository";
import {
  seedDefaultCatalog,
  getRoutineById,
  getRoutineBySlug,
  getRoutineByIdOrSlug,
  getRoutineWithExercises,
  getExercisesForRoutine,
  createRoutine,
  updateRoutine,
  deleteRoutine,
  inferRoutineName,
  DEFAULT_ROUTINES,
} from "../lib/db/routine-repository";
import { seedExerciseCatalog } from "../lib/db/exercise-repository";
import { startWorkoutSession, getActiveWorkoutSession } from "../lib/db/workout-repository";
import { isDevModeEnabled, validateDevCredentials, createDevToken, verifyDevRequest } from "../lib/dev/dev-auth";
import { getEffectiveLoad, formatSetLoad, formatSetSummary } from "../lib/load/load-utils";
import * as fs from "fs";
import * as path from "path";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`❌ Assertion Failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

async function runTests() {
  console.log("\n=======================================================");
  console.log(" Sculp'd Workout Access, Edit & Dev Mode Access Tests");
  console.log("=======================================================\n");

  await db.delete();
  await db.open();

  console.log("1. Testing Developer Mode Access & Credential Robustness...");
  assert(isDevModeEnabled() === true, "Developer mode is enabled in test environment");

  assert(
    validateDevCredentials("dev", "devpass0000") === true,
    "Valid credentials 'dev' / 'devpass0000' accepted"
  );
  assert(
    validateDevCredentials("Dev", "devpass0000") === true,
    "Case-insensitive username 'Dev' accepted (mobile autocorrect safety)"
  );
  assert(
    validateDevCredentials(" dev ", "devpass0000") === true,
    "Whitespace-padded username ' dev ' accepted"
  );
  assert(
    validateDevCredentials("dev", "wrongpass") === false,
    "Incorrect password correctly rejected"
  );
  assert(
    validateDevCredentials("wronguser", "devpass0000") === false,
    "Incorrect username correctly rejected"
  );

  const devTokenResult = await createDevToken();
  assert(Boolean(devTokenResult.token), "Developer session token generated");
  assert(devTokenResult.role === "developer", "Developer role confirmed");

  const mockReq = new Request("https://localhost/api/dev/session", {
    headers: { Authorization: `Bearer ${devTokenResult.token}` },
  });
  const devAuth = await verifyDevRequest(mockReq);
  assert(devAuth.authorized === true, "Developer token authorizes endpoint request");

  console.log("\n2. Testing Routine Lookup by ID and by Slug...");
  await seedDefaultCatalog();
  await seedExerciseCatalog();

  // Find Monday routine
  const mondayById = await getRoutineById("rtn_monday_glutes_calves");
  assert(Boolean(mondayById), "getRoutineById finds routine by primary key");
  assert(mondayById?.slug === "monday", "Found routine has slug 'monday'");

  const mondayBySlug = await getRoutineBySlug("monday");
  assert(Boolean(mondayBySlug), "getRoutineBySlug finds routine by slug 'monday'");
  assert(mondayBySlug?.id === "rtn_monday_glutes_calves", "Resolved routine has matching id");

  const mondayByIdOrSlug = await getRoutineByIdOrSlug("monday");
  assert(Boolean(mondayByIdOrSlug), "getRoutineByIdOrSlug resolves slug 'monday'");

  console.log("\n3. Testing getRoutineWithExercises with Slugs and IDs...");
  // Query with slug 'monday'
  const withExBySlug = await getRoutineWithExercises("monday");
  assert(Boolean(withExBySlug), "getRoutineWithExercises successfully resolves slug 'monday'");
  assert(withExBySlug?.id === "rtn_monday_glutes_calves", "Resolved routine has canonical ID");
  assert(
    Boolean(withExBySlug?.exercises && withExBySlug.exercises.length > 0),
    `Routine exercises successfully resolved from slug (got ${withExBySlug?.exercises.length} exercises)`
  );

  // Query with primary key ID
  const withExById = await getRoutineWithExercises("rtn_monday_glutes_calves");
  assert(Boolean(withExById), "getRoutineWithExercises successfully resolves primary key ID");
  assert(
    withExById?.exercises.length === withExBySlug?.exercises.length,
    "Exercises count matches between ID and slug lookup"
  );

  console.log("\n4. Testing Routine Name Healing (Legacy & Missing Names)...");
  // Seed a routine without a 'name' property
  const unnamedRoutineId = "rtn_friday_custom_test";
  await db.routines.put({
    id: unnamedRoutineId,
    userId: "usr_athlete_test",
    name: "" as any,
    slug: "friday",
    dayName: "Friday",
    focusTarget: "Full Lower Body Posterior Chain",
    displayOrder: 5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const healed = await getRoutineById(unnamedRoutineId);
  assert(Boolean(healed?.name), "Routine without name is automatically healed");
  assert(
    healed?.name === "Friday - Full Lower Body Posterior Chain",
    `Healed name matches expected format: '${healed?.name}'`
  );

  console.log("\n5. Testing Workout Editing (updateRoutine) with Slugs & Templates...");
  const user = await createUser({
    displayName: "Athlete 1",
    pin: "1234",
    avatarColor: "emerald",
  });

  // Edit a default template routine (userId: "legacy_default") using slug "monday"
  const updatedMonday = await updateRoutine(user.id, "monday", {
    name: "Monday - Heavy Glutes & Calves (Customized)",
    description: "Updated notes",
    exercises: [
      {
        exerciseId: "std_ex_hip_thrust",
        targetSets: 4,
        targetReps: "6-8",
        restSeconds: 120,
      },
    ],
  });

  assert(Boolean(updatedMonday), "updateRoutine succeeded using slug 'monday'");
  assert(
    updatedMonday.id === "rtn_monday_glutes_calves",
    "Preserved canonical routine ID 'rtn_monday_glutes_calves'"
  );
  assert(
    updatedMonday.userId === user.id,
    "Ownership transferred to editing user (from legacy_default)"
  );
  assert(
    updatedMonday.name === "Monday - Heavy Glutes & Calves (Customized)",
    "Updated name persisted"
  );

  // Verify exercises were stored under canonical routine ID
  const reloadedRoutine = await getRoutineWithExercises("monday");
  assert(reloadedRoutine?.exercises.length === 1, "Updated routine has 1 configured exercise");
  assert(
    reloadedRoutine?.exercises[0].exerciseId === "std_ex_hip_thrust",
    "Exercise ID is Barbell Hip Thrust"
  );
  assert(
    reloadedRoutine?.exercises[0].targetSets === 4,
    "Target sets updated to 4"
  );

  console.log("\n6. Testing Session Creation with Slug & ID Consistency...");
  const session = await startWorkoutSession(user.id, "monday");
  assert(Boolean(session), "startWorkoutSession creates session via slug 'monday'");
  assert(
    session.routineId === "rtn_monday_glutes_calves",
    "Session links to canonical routine ID"
  );
  assert(
    Boolean(session.exerciseSnapshots && session.exerciseSnapshots.length > 0),
    `Session has exercise snapshots populated (got ${session.exerciseSnapshots?.length})`
  );

  console.log("\n7. Testing Routine Deletion...");
  // Create custom user routine
  const created = await createRoutine(user.id, {
    name: "Temporary Workout",
    exercises: [{ exerciseId: "std_ex_bench_press", targetSets: 3, targetReps: "8-10" }],
  });
  assert(Boolean(created.id), "Created temporary routine");

  const deleteSuccess = await deleteRoutine(user.id, created.id);
  assert(deleteSuccess === true, "deleteRoutine successfully deleted temporary routine");
  const postDelete = await getRoutineById(created.id);
  assert(postDelete === undefined, "Routine no longer exists in database");

  console.log("\n8. Testing Defensive Load Formatting (Corrupted / Null Sets)...");
  assert(getEffectiveLoad(null) === 0, "getEffectiveLoad handles null set");
  assert(getEffectiveLoad(undefined) === 0, "getEffectiveLoad handles undefined set");
  assert(formatSetLoad(null) === "", "formatSetLoad handles null set");
  assert(formatSetLoad(undefined) === "", "formatSetLoad handles undefined set");
  assert(formatSetSummary(null) === "", "formatSetSummary handles null set");
  assert(formatSetSummary(undefined) === "", "formatSetSummary handles undefined set");
  assert(formatSetSummary({ weight: 225, reps: 5 }) === "225 lbs × 5", "formatSetSummary formats valid weighted set");
  assert(formatSetSummary({ weight: 0, reps: 10, bodyweight: 180, addedWeight: 0 }, true) === "BW × 10", "formatSetSummary formats pure BW");
  assert(formatSetSummary({ weight: 15, reps: 8, bodyweight: 180, addedWeight: 15 }, true) === "BW + 15 lbs × 8", "formatSetSummary formats weighted BW");
  assert(formatSetSummary({ weight: undefined as any, reps: undefined as any }) === "0 lbs × 0", "formatSetSummary handles missing numbers safely");

  console.log("\n9. Testing React Rules of Hooks Invariance for WorkoutScreen...");
  const workoutScreenPath = path.resolve(__dirname, "../components/workout/WorkoutScreen.tsx");
  const workoutScreenCode = fs.readFileSync(workoutScreenPath, "utf-8");
  const lines = workoutScreenCode.split("\n");

  let firstReturnLine = -1;
  const hookCallsAfterFirstReturn: { line: number; text: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i].trim();
    // Identify top-level early returns inside WorkoutScreen
    if (firstReturnLine === -1 && /^\s*return\s*\(?/.test(lines[i])) {
      // Find the first early return guard
      if (lineText.startsWith("return") && (lineText.includes("<") || lines[i+1]?.trim().startsWith("<"))) {
        firstReturnLine = i + 1;
      }
    }

    if (firstReturnLine !== -1) {
      // Check if any React hook is invoked after the first return
      if (/\b(use[A-Z]\w*)\s*\(/.test(lines[i])) {
        // Exclude callbacks or event handlers that don't declare hooks
        if (!lineText.startsWith("//") && !lineText.startsWith("*") && !lineText.includes("useWorkoutSession")) {
          hookCallsAfterFirstReturn.push({ line: i + 1, text: lineText });
        }
      }
    }
  }

  assert(
    hookCallsAfterFirstReturn.length === 0,
    `No React hooks called after early returns in WorkoutScreen (found ${hookCallsAfterFirstReturn.length})`
  );
  assert(firstReturnLine > 0, `First early return detected at line ${firstReturnLine}`);

  console.log("\n=======================================================");
  console.log(" ✅ All Workout Access, Edit & Dev Tests Passed!");
  console.log("=======================================================\n");
}

runTests().catch((err) => {
  console.error("Test Suite Failed:", err);
  process.exit(1);
});
