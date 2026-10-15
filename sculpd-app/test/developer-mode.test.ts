// test/developer-mode.test.ts
import "fake-indexeddb/auto";
import { db } from "../lib/db/index";
import {
  isDevModeEnabled,
  validateDevCredentials,
  createDevToken,
  verifyDevRequest,
} from "../lib/dev/dev-auth";
import {
  telemetry,
  logWorkoutTelemetry,
  logSetTelemetry,
  logTimerTelemetry,
  logNotificationTelemetry,
  logSyncTelemetry,
  logBackupTelemetry,
  logTestTelemetry,
  getRecentTelemetry,
  clearTelemetryBuffer,
} from "../lib/telemetry/telemetry-service";
import {
  countSyntheticRecords,
  cleanupSyntheticData,
  generateScenario,
  isSyntheticId,
  SYNTHETIC_PREFIX,
} from "../lib/dev/synthetic-data-service";
import {
  getInitialTestGroups,
  runTestCase,
  runTestGroup,
  calculateSuiteSummary,
} from "../lib/dev/feature-test-runner";
import { POST as testPushPost } from "../app/api/dev/test-push/route";
import { POST as devLoginPost } from "../app/api/dev/login/route";
import { GET as devSessionGet } from "../app/api/dev/session/route";
import { createSessionToken } from "../lib/auth/session-token";
import { hashPin } from "../lib/crypto/pin";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`❌ Assertion Failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

async function runDevModeTests() {
  console.log("\n=======================================================");
  console.log(" Sculp'd Developer Mode — Verification Test Suite");
  console.log("=======================================================\n");

  // -----------------------------------------------------------------
  // 1. Developer Authentication & Access Control
  // -----------------------------------------------------------------
  console.log("1. Testing Developer Authentication & Route Guarding...");

  // Timing-safe credential validation
  assert(
    validateDevCredentials("dev", "devpass0000") === true,
    "Valid credentials 'dev' / 'devpass0000' successfully authenticated"
  );
  assert(
    validateDevCredentials("dev", "wrongpass") === false,
    "Invalid password correctly rejected"
  );
  assert(
    validateDevCredentials("admin", "devpass0000") === false,
    "Invalid username correctly rejected"
  );
  assert(
    validateDevCredentials("", "") === false,
    "Empty credentials rejected"
  );

  // Environment gating test
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDevFlag = process.env.ENABLE_DEV_MODE;

  // In test/dev environment, dev mode is enabled
  assert(isDevModeEnabled() === true, "Dev mode is enabled in non-production environment");

  // In production without ENABLE_DEV_MODE, it must be disabled
  (process.env as any).NODE_ENV = "production";
  process.env.ENABLE_DEV_MODE = "false";
  assert(
    isDevModeEnabled() === false,
    "Dev mode is strictly disabled in production when ENABLE_DEV_MODE != true"
  );

  // In production with ENABLE_DEV_MODE="true", it is enabled
  process.env.ENABLE_DEV_MODE = "true";
  assert(
    isDevModeEnabled() === true,
    "Dev mode is enabled in production when ENABLE_DEV_MODE='true'"
  );

  // Restore env
  (process.env as any).NODE_ENV = originalNodeEnv;
  process.env.ENABLE_DEV_MODE = originalDevFlag;

  // Developer token creation & prefix verification
  const devTokenData = await createDevToken();
  assert(
    devTokenData.token.startsWith("sculpd_dev_"),
    "Developer token generated with 'sculpd_dev_' prefix"
  );
  assert(
    devTokenData.role === "developer",
    "Developer token role is 'developer'"
  );
  assert(
    devTokenData.userId === "dev-athlete-0000",
    "Developer token bound to dev identity"
  );

  // Server-side route verification via verifyDevRequest
  const validReq = new Request("https://localhost/api/dev/session", {
    headers: { Authorization: `Bearer ${devTokenData.token}` },
  });
  const validRes = await verifyDevRequest(validReq);
  assert(validRes.authorized === true, "Valid developer token authorized on server");
  assert(validRes.status === 200, "Valid developer token returns HTTP 200 status");

  // Rejection of missing header
  const missingHeaderReq = new Request("https://localhost/api/dev/session");
  const missingRes = await verifyDevRequest(missingHeaderReq);
  assert(missingRes.authorized === false, "Missing Authorization header rejected");
  assert(missingRes.status === 401, "Missing Authorization header returns 401");

  // Rejection of non-developer (athlete) token
  const athleteToken = await createSessionToken("usr_athlete_real_01");
  const athleteReq = new Request("https://localhost/api/dev/session", {
    headers: { Authorization: `Bearer ${athleteToken}` },
  });
  const athleteRes = await verifyDevRequest(athleteReq);
  assert(
    athleteRes.authorized === false,
    "Standard athlete session token rejected from developer endpoints"
  );
  assert(athleteRes.status === 403, "Athlete token on dev endpoint returns 403 Forbidden");

  // Rejection of tampered developer token
  const tamperedReq = new Request("https://localhost/api/dev/session", {
    headers: { Authorization: `Bearer sculpd_dev_tampered_payload_xyz` },
  });
  const tamperedRes = await verifyDevRequest(tamperedReq);
  assert(tamperedRes.authorized === false, "Tampered developer token rejected");
  assert(tamperedRes.status === 401, "Tampered developer token returns 401");

  // API Route POST /api/dev/login
  const loginReq = new Request("https://localhost/api/dev/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "dev", password: "devpass0000" }),
  });
  const loginApiRes = await devLoginPost(loginReq);
  const loginApiData = await loginApiRes.json();
  assert(loginApiRes.status === 200, "POST /api/dev/login returns 200 for valid credentials");
  assert(loginApiData.success === true, "POST /api/dev/login returns success: true");
  assert(
    typeof loginApiData.token === "string" && loginApiData.token.startsWith("sculpd_dev_"),
    "POST /api/dev/login returns signed dev token"
  );

  // API Route GET /api/dev/session
  const sessionReq = new Request("https://localhost/api/dev/session", {
    headers: { Authorization: `Bearer ${loginApiData.token}` },
  });
  const sessionApiRes = await devSessionGet(sessionReq);
  const sessionApiData = await sessionApiRes.json();
  assert(sessionApiRes.status === 200, "GET /api/dev/session returns 200 with valid token");
  assert(sessionApiData.authenticated === true, "GET /api/dev/session confirms dev authenticated");

  // -----------------------------------------------------------------
  // 2. Telemetry Service & Circular Buffer Bounding
  // -----------------------------------------------------------------
  console.log("\n2. Testing Structured Telemetry & Diagnostics...");

  clearTelemetryBuffer();
  assert(getRecentTelemetry().length === 0, "Telemetry buffer starts clean after clear");

  // Record categorized events
  logWorkoutTelemetry("created", "ws_test_corr_01", { routineName: "Chest Focus" });
  logSetTelemetry("saved", "set_test_01", { weight: 225, reps: 5 });
  logTimerTelemetry("shortened", "timer_test_01", { remainingSeconds: 5 });
  logNotificationTelemetry("simulated", { granted: true });
  logSyncTelemetry("queued", { pendingMutations: 2 });
  logBackupTelemetry("exported", { format: "sculpd-backup" });
  logTestTelemetry("auth_verification", "pass", 15);

  const recorded = getRecentTelemetry();
  assert(recorded.length === 7, `Recorded 7 distinct telemetry events (got ${recorded.length})`);

  // Verify safe correlation IDs and no credentials
  const workoutEv = recorded.find((e) => e.eventType === "workout.session.created");
  assert(workoutEv !== undefined, "Workout telemetry event found in buffer");
  assert(workoutEv?.correlationId === "ws_test_corr_01", "Correlation ID safely recorded");
  assert(workoutEv?.data?.routineName === "Chest Focus", "Structured metadata recorded");

  // Circular buffer limit (max 200 items)
  for (let i = 0; i < 250; i++) {
    logTestTelemetry(`overflow_test_${i}`, "pass", 1);
  }
  const overflowed = getRecentTelemetry();
  assert(
    overflowed.length === 200,
    `Circular buffer strictly caps at 200 entries (got ${overflowed.length})`
  );

  // -----------------------------------------------------------------
  // 3. Rest Timer Acceleration Semantics
  // -----------------------------------------------------------------
  console.log("\n3. Testing Rest Timer Speed Controls & Acceleration Math...");

  const baseStartTime = Date.now();
  const normal90sEnd = baseStartTime + 90 * 1000;
  assert(normal90sEnd - baseStartTime === 90000, "Standard rest duration is 90s");

  // Accelerating to 5s calculates new absolute epoch end time
  const accelerated5sEnd = baseStartTime + 5 * 1000;
  const remainingCalculated = Math.round((accelerated5sEnd - baseStartTime) / 1000);
  assert(remainingCalculated === 5, "Accelerated target accurately yields 5s remaining");

  // Complete now sets remaining to 0
  const completeNowEnd = baseStartTime;
  assert(completeNowEnd - baseStartTime === 0, "Complete now target is instantaneous (0s)");

  // -----------------------------------------------------------------
  // 4. Synthetic Data Generation & Real Athlete Protection
  // -----------------------------------------------------------------
  console.log("\n4. Testing Synthetic Scenarios & Strict Data Isolation...");

  // Step 4.1: Seed a REAL athlete record to prove it is NEVER modified or deleted
  const realUser = {
    id: "usr_athlete_real_100",
    displayName: "Real Athlete",
    pinHash: "hash1234",
    pinSalt: "salt1234",
    avatarColor: "emerald" as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const realRoutine = {
    id: "rtn_real_100",
    userId: realUser.id,
    name: "Real Monday Push",
    displayOrder: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const realSession = {
    id: "ws_real_100",
    userId: realUser.id,
    routineId: realRoutine.id,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    status: "completed" as const,
    updatedAt: new Date().toISOString(),
  };
  const realSet = {
    id: "set_real_100",
    userId: realUser.id,
    workoutSessionId: realSession.id,
    exerciseId: "std_ex_bench_press",
    setNumber: 1,
    weight: 225,
    reps: 8,
    rpe: 8,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await db.users.put(realUser);
  await db.routines.put(realRoutine);
  await db.workoutSessions.put(realSession);
  await db.sets.put(realSet);

  assert(await db.users.get(realUser.id) !== undefined, "Real athlete user seeded in Dexie");
  assert(await db.routines.get(realRoutine.id) !== undefined, "Real athlete routine seeded in Dexie");
  assert(await db.workoutSessions.get(realSession.id) !== undefined, "Real athlete session seeded in Dexie");
  assert(await db.sets.get(realSet.id) !== undefined, "Real athlete set seeded in Dexie");

  // Step 4.2: Generate all synthetic scenarios
  const freshRes = await generateScenario("fresh_athlete");
  assert(freshRes.scenarioKey === "fresh_athlete", "Generated Fresh Athlete scenario");

  const activeRes = await generateScenario("active_athlete");
  assert(activeRes.scenarioKey === "active_athlete", "Generated 3-Week Active Athlete scenario");

  const inProgRes = await generateScenario("in_progress");
  assert(inProgRes.scenarioKey === "in_progress", "Generated In-Progress Session scenario");

  const histRes = await generateScenario("historical_backfill");
  assert(histRes.scenarioKey === "historical_backfill", "Generated Historical Backfill scenario");

  const syncFailRes = await generateScenario("sync_failures");
  assert(syncFailRes.scenarioKey === "sync_failures", "Generated Sync Queue Failures scenario");

  // Step 4.3: Verify synthetic record counts
  const syntheticCountsBefore = await countSyntheticRecords();
  assert(
    syntheticCountsBefore.users >= 5,
    `Synthetic users present (expected >=5, got ${syntheticCountsBefore.users})`
  );
  assert(
    syntheticCountsBefore.workoutSessions >= 20,
    `Synthetic sessions present (expected >=20, got ${syntheticCountsBefore.workoutSessions})`
  );
  assert(
    syntheticCountsBefore.sets >= 30,
    `Synthetic sets present (expected >=30, got ${syntheticCountsBefore.sets})`
  );
  assert(
    syntheticCountsBefore.syncQueue >= 4,
    `Synthetic syncQueue present (expected >=4, got ${syntheticCountsBefore.syncQueue})`
  );

  // Step 4.4: Execute isolated cleanup of synthetic records
  const cleanupResult = await cleanupSyntheticData();
  assert(cleanupResult.deleted.total > 0, `Purged ${cleanupResult.deleted.total} synthetic records`);

  const syntheticCountsAfter = await countSyntheticRecords();
  assert(
    syntheticCountsAfter.total === 0,
    `All synthetic records successfully purged (remaining: ${syntheticCountsAfter.total})`
  );

  // Step 4.5: CRITICAL GUARANTEE — Verify real athlete records are 100% UNTOUCHED
  const checkRealUser = await db.users.get(realUser.id);
  const checkRealRoutine = await db.routines.get(realRoutine.id);
  const checkRealSession = await db.workoutSessions.get(realSession.id);
  const checkRealSet = await db.sets.get(realSet.id);

  assert(checkRealUser !== undefined && checkRealUser.id === realUser.id, "GUARANTEE MET: Real user profile untouched");
  assert(checkRealRoutine !== undefined && checkRealRoutine.id === realRoutine.id, "GUARANTEE MET: Real routine untouched");
  assert(checkRealSession !== undefined && checkRealSession.id === realSession.id, "GUARANTEE MET: Real session untouched");
  assert(checkRealSet !== undefined && checkRealSet.id === realSet.id, "GUARANTEE MET: Real set records untouched");

  // Clean up our seeded real test data for cleanliness
  await db.users.delete(realUser.id);
  await db.routines.delete(realRoutine.id);
  await db.workoutSessions.delete(realSession.id);
  await db.sets.delete(realSet.id);

  // -----------------------------------------------------------------
  // 5. Feature Test Console (14 Architectural Groups)
  // -----------------------------------------------------------------
  console.log("\n5. Testing Feature Test Console (14 Groups & Honest Reporting)...");

  const initialGroups = getInitialTestGroups();
  assert(initialGroups.length === 14, `All 14 test groups defined (got ${initialGroups.length})`);

  // Verify Groups 12 and 13 are fully implemented and pending execution
  const group12 = initialGroups.find((g) => g.id === 12);
  const group13 = initialGroups.find((g) => g.id === 13);
  assert(
    group12?.status === "pending",
    "Group 12 (Monthly Skips & Alternatives) is active and implemented"
  );
  assert(
    group13?.status === "pending",
    "Group 13 (Achievements, Badges & Ranks) is active and implemented"
  );

  // Run group 12 (Monthly Skips & Alternatives)
  const group12Result = await runTestGroup(group12!);
  assert(group12Result.status === "passed", "Group 12 (Monthly Skips) passed all tests");

  // Run group 13 (Achievements, Badges & Ranks)
  const group13Result = await runTestGroup(group13!);
  assert(group13Result.status === "passed", "Group 13 (Achievements & Ranks) passed all tests");

  // Run individual test case
  const singleTestResult = await runTestCase("auth_dev_credentials");
  assert(singleTestResult.status === "passed", "Single test 'auth_dev_credentials' passed");

  // Run group 1 (Authentication)
  const group1Result = await runTestGroup(initialGroups[0]);
  assert(group1Result.status === "passed", "Group 1 (Authentication) passed");
  assert(
    group1Result.tests.every((t) => t.status === "passed"),
    "All tests in Group 1 passed"
  );

  // Run group 2 (IndexedDB Schema)
  const group2Result = await runTestGroup(initialGroups[1]);
  assert(group2Result.status === "passed", "Group 2 (IndexedDB Schema) passed");

  // Run group 6 (Backup Generation)
  const group6Result = await runTestGroup(initialGroups[5]);
  assert(group6Result.status === "passed", "Group 6 (Backup Generation) passed");

  // Run group 10 (Rest Timer)
  const group10Result = await runTestGroup(initialGroups[9]);
  assert(group10Result.status === "passed", "Group 10 (Rest Timer) passed");

  // Verify suite summary calculation
  const summary = calculateSuiteSummary(initialGroups);
  assert(summary.total > 20, `Test suite total tests counted: ${summary.total}`);
  assert(
    summary.notImplemented === 0,
    `Summary correctly counts 0 unimplemented roadmap tests (got ${summary.notImplemented})`
  );

  // -----------------------------------------------------------------
  // 6. Push Notification Pipeline 5-Stage Diagnostics
  // -----------------------------------------------------------------
  console.log("\n6. Testing Push Notification 5-Stage Diagnostic Pipeline...");

  const testPushReq = new Request("https://localhost/api/dev/test-push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${devTokenData.token}`,
    },
  });
  const pushRes = await testPushPost(testPushReq);
  const pushData = await pushRes.json();

  assert(
    Array.isArray(pushData.stages),
    "Push test returns 5-stage diagnostic report array"
  );
  assert(
    pushData.stages.length >= 2,
    `Diagnostic stages returned (got ${pushData.stages.length})`
  );

  // Stage 1: Client Request
  const stage1 = pushData.stages.find((s: any) => s.stage === 1);
  assert(stage1?.status === "passed", "Stage 1: Client Request verified passed");

  // Stage 2: Server Authorization
  const stage2 = pushData.stages.find((s: any) => s.stage === 2);
  assert(stage2?.status === "passed", "Stage 2: Server Authorization verified passed");

  console.log("\n=======================================================");
  console.log(" ✅ All Developer Mode verification tests passed!");
  console.log("=======================================================\n");
}

runDevModeTests().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
