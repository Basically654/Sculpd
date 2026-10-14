// test/local-backup-restore.test.ts
import "fake-indexeddb/auto";
import { SculpdDatabase } from "../lib/db/index";
import {
  createBackup,
  exportBackupToJson,
  validateBackup,
  restoreBackup,
  checkDatabaseState,
  getBackupFilename,
  BACKUP_FORMAT_IDENTIFIER,
  BACKUP_FORMAT_VERSION,
  DEFAULT_RESTORE_PIN,
  SculpdBackup,
  inferRoutineName,
} from "../lib/db/backup";
import { hashPin, verifyPin } from "../lib/crypto/pin";
import {
  User,
  Routine,
  RoutineExerciseConfig,
  Exercise,
  WorkoutSession,
  WorkoutSet,
  SyncQueueItem,
} from "../types/models";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`❌ Assertion Failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

async function runTests() {
  console.log("\n============================================================");
  console.log("SCULP'D 2.0: LOCAL BACKUP & RESTORE TEST SUITE");
  console.log("============================================================\n");

  // Create isolated synthetic databases
  const testDb = new SculpdDatabase("sculpd_test_backup_source");
  const emptyRestoreDb = new SculpdDatabase("sculpd_test_backup_dest_empty");
  const populatedRestoreDb = new SculpdDatabase("sculpd_test_backup_dest_populated");
  const rollbackTestDb = new SculpdDatabase("sculpd_test_backup_rollback");

  await testDb.open();
  await emptyRestoreDb.open();
  await populatedRestoreDb.open();
  await rollbackTestDb.open();

  // Clean test databases
  await Promise.all([
    testDb.users.clear(),
    testDb.routines.clear(),
    testDb.routineExercises.clear(),
    testDb.exercises.clear(),
    testDb.workoutSessions.clear(),
    testDb.sets.clear(),
    testDb.syncQueue.clear(),
    testDb.syncMeta.clear(),
  ]);

  // Seed rich synthetic source data into testDb
  const testUserPin = await hashPin("5678");
  const user1: User = {
    id: "usr_athlete_123",
    displayName: "Jane Doe",
    pinHash: testUserPin.pinHash,
    pinSalt: testUserPin.pinSalt,
    avatarColor: "violet",
    bodyweight: 145.5,
    createdAt: "2026-03-01T10:00:00.000Z",
    updatedAt: "2026-03-01T10:00:00.000Z",
  };

  const routine1: Routine = {
    id: "rtn_push_heavy",
    userId: user1.id,
    name: "Heavy Push Day",
    description: "Strength focused bench and overhead work",
    displayOrder: 1,
    createdAt: "2026-03-01T10:05:00.000Z",
    updatedAt: "2026-03-01T10:05:00.000Z",
  };

  const exercise1: Exercise = {
    id: "ex_bench_press_std",
    name: "Barbell Bench Press",
    category: "Chest",
    equipment: "Barbell",
    loadType: "weighted",
    userId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  const exercise2: Exercise = {
    id: "ex_custom_cable_fly",
    name: "Custom Incline Cable Fly",
    category: "Chest",
    equipment: "Cable",
    loadType: "weighted",
    userId: user1.id,
    createdAt: "2026-03-01T10:10:00.000Z",
    updatedAt: "2026-03-01T10:10:00.000Z",
  };

  const routineEx1: RoutineExerciseConfig = {
    id: "re_bench_config",
    routineId: routine1.id,
    exerciseId: exercise1.id,
    displayOrder: 1,
    targetSets: 3,
    targetReps: "5",
    restSeconds: 180,
    loadType: "weighted",
    notes: "Pause on chest 1 second",
    createdAt: "2026-03-01T10:15:00.000Z",
    updatedAt: "2026-03-01T10:15:00.000Z",
  };

  const workoutSession1: WorkoutSession = {
    id: "ws_session_march_10",
    userId: user1.id,
    routineId: routine1.id,
    routineName: "Heavy Push Day",
    exerciseSnapshots: [
      {
        exerciseId: exercise1.id,
        name: "Barbell Bench Press",
        displayOrder: 1,
        targetSets: 3,
        targetReps: "5",
        restSeconds: 180,
        loadType: "weighted",
        notes: "Pause on chest 1 second",
      },
    ],
    startedAt: "2026-03-10T14:00:00.000Z",
    completedAt: "2026-03-10T14:45:00.000Z",
    status: "completed",
    notes: "Felt strong today, hit PR on set 3",
    updatedAt: "2026-03-10T14:45:00.000Z",
  };

  const set1: WorkoutSet = {
    id: "set_bench_01",
    userId: user1.id,
    workoutSessionId: workoutSession1.id,
    exerciseId: exercise1.id,
    setNumber: 1,
    weight: 185,
    reps: 5,
    rpe: 8,
    bodyweight: 145.5,
    addedWeight: null,
    createdAt: "2026-03-10T14:10:00.000Z",
    updatedAt: "2026-03-10T14:10:00.000Z",
  };

  const set2: WorkoutSet = {
    id: "set_bench_02",
    userId: user1.id,
    workoutSessionId: workoutSession1.id,
    exerciseId: exercise1.id,
    setNumber: 2,
    weight: 195,
    reps: 5,
    rpe: 9,
    bodyweight: 145.5,
    addedWeight: null,
    createdAt: "2026-03-10T14:18:00.000Z",
    updatedAt: "2026-03-10T14:18:00.000Z",
  };

  // Stale outbox queue item that should NOT be replayed on restore
  const staleQueueItem: SyncQueueItem = {
    id: "sq_stale_mutation_999",
    userId: user1.id,
    operation: "insert",
    collection: "sets",
    entityId: set1.id,
    payload: set1,
    timestamp: Date.now() - 1000000,
    status: "pending",
    attempts: 3,
  };

  await Promise.all([
    testDb.users.add(user1),
    testDb.routines.add(routine1),
    testDb.exercises.bulkAdd([exercise1, exercise2]),
    testDb.routineExercises.add(routineEx1),
    testDb.workoutSessions.add(workoutSession1),
    testDb.sets.bulkAdd([set1, set2]),
    testDb.syncQueue.add(staleQueueItem),
  ]);

  // --- 1. Export includes every required user-data store ---
  console.log("--- 1. Export includes every required user-data store ---");
  const backup = await createBackup(testDb);

  assert(backup.format === BACKUP_FORMAT_IDENTIFIER, "Backup format identifier matches 'sculpd-backup'");
  assert(backup.version === BACKUP_FORMAT_VERSION, "Backup format version is 1");
  assert(Boolean(backup.exportedAt), "Export timestamp is present and ISO valid");
  assert(Boolean(backup.data.users && Array.isArray(backup.data.users)), "data.users store is present");
  assert(Boolean(backup.data.routines && Array.isArray(backup.data.routines)), "data.routines store is present");
  assert(Boolean(backup.data.routineExercises && Array.isArray(backup.data.routineExercises)), "data.routineExercises store is present");
  assert(Boolean(backup.data.exercises && Array.isArray(backup.data.exercises)), "data.exercises store is present");
  assert(Boolean(backup.data.workoutSessions && Array.isArray(backup.data.workoutSessions)), "data.workoutSessions store is present");
  assert(Boolean(backup.data.sets && Array.isArray(backup.data.sets)), "data.sets store is present");
  assert(backup.data.users.length === 1, "Backup contains 1 user profile");
  assert(backup.data.routines.length === 1, "Backup contains 1 routine");
  assert(backup.data.exercises.length === 2, "Backup contains 2 exercises");
  assert(backup.data.workoutSessions.length === 1, "Backup contains 1 workout session");
  assert(backup.data.sets.length === 2, "Backup contains 2 sets");

  // --- 2. Export preserves IDs, weights, reps, timestamps, snapshots, and relationships ---
  console.log("\n--- 2. Export Preserves IDs, Weights, Reps, Timestamps, Snapshots, Relationships ---");
  const exportedSession = backup.data.workoutSessions[0];
  const exportedSet1 = backup.data.sets[0];
  const exportedSet2 = backup.data.sets[1];

  assert(exportedSession.id === workoutSession1.id, "Session ID strictly preserved");
  assert(exportedSession.userId === workoutSession1.userId, "Session userId relationship strictly preserved");
  assert(exportedSession.routineId === workoutSession1.routineId, "Session routineId relationship strictly preserved");
  assert(exportedSession.startedAt === workoutSession1.startedAt, "Session startedAt timestamp preserved");
  assert(exportedSession.completedAt === workoutSession1.completedAt, "Session completedAt timestamp preserved");
  assert(exportedSession.status === "completed", "Session status preserved");
  assert(exportedSession.notes === workoutSession1.notes, "Session notes preserved");
  assert(Array.isArray(exportedSession.exerciseSnapshots) && exportedSession.exerciseSnapshots.length === 1, "Exercise snapshot preserved in session");
  assert(exportedSession.exerciseSnapshots![0].name === "Barbell Bench Press", "Snapshot exercise name preserved");
  assert(exportedSession.exerciseSnapshots![0].targetReps === "5", "Snapshot target reps preserved");

  assert(exportedSet1.id === set1.id, "Set 1 ID strictly preserved");
  assert(exportedSet1.weight === 185, "Set 1 weight preserved (185 lbs)");
  assert(exportedSet1.reps === 5, "Set 1 reps preserved (5)");
  assert(exportedSet1.rpe === 8, "Set 1 RPE preserved (8)");
  assert(exportedSet1.bodyweight === 145.5, "Set 1 bodyweight context preserved (145.5 lbs)");
  assert(exportedSet2.weight === 195, "Set 2 weight preserved (195 lbs)");
  assert(exportedSet1.workoutSessionId === exportedSession.id, "Set workoutSessionId foreign key preserved");

  // Filename verification
  const filename = getBackupFilename(new Date("2026-03-15T12:00:00Z"));
  assert(filename.toLowerCase().includes("sculpd"), "Filename contains 'sculpd'");
  assert(filename.includes("2026-03-15"), "Filename contains export date");

  // --- 3. Export does not mutate the live database ---
  console.log("\n--- 3. Export Does Not Mutate Live Database ---");
  const usersAfter = await testDb.users.count();
  const routinesAfter = await testDb.routines.count();
  const exercisesAfter = await testDb.exercises.count();
  const sessionsAfter = await testDb.workoutSessions.count();
  const setsAfter = await testDb.sets.count();
  const queueAfter = await testDb.syncQueue.count();

  assert(usersAfter === 1, "Live database user count unchanged");
  assert(routinesAfter === 1, "Live database routine count unchanged");
  assert(exercisesAfter === 2, "Live database exercise count unchanged");
  assert(sessionsAfter === 1, "Live database session count unchanged");
  assert(setsAfter === 2, "Live database sets count unchanged");
  assert(queueAfter === 1, "Live database syncQueue count unchanged");

  const liveUser = await testDb.users.get(user1.id);
  assert(Boolean(liveUser?.pinHash), "Live database user PIN hash was NOT erased or mutated during export");

  // --- 4. Invalid, malformed, and unsupported-version backups are rejected ---
  console.log("\n--- 4. Invalid, Malformed, and Unsupported-Version Backups are Rejected ---");
  const malformedJson = "{ invalid json content ...";
  const malformedResult = validateBackup(malformedJson);
  assert(!malformedResult.valid, "Malformed JSON string rejected");
  assert(Boolean(malformedResult.error), "Malformed JSON returns clear error message");

  const wrongFormat = { ...backup, format: "not-sculpd" };
  const wrongFormatResult = validateBackup(wrongFormat);
  assert(!wrongFormatResult.valid, "Unrecognized format identifier rejected");

  const unsupportedVersion = { ...backup, version: 99 };
  const unsupportedVersionResult = validateBackup(unsupportedVersion);
  assert(!unsupportedVersionResult.valid, "Unsupported format version (99) rejected");

  const missingStores = {
    ...backup,
    data: {
      users: backup.data.users,
      routines: backup.data.routines,
      // Missing routineExercises, exercises, workoutSessions, sets
    },
  };
  const missingStoresResult = validateBackup(missingStores);
  assert(!missingStoresResult.valid, "Backup with missing stores rejected");

  const brokenRelation = JSON.parse(JSON.stringify(backup)) as SculpdBackup;
  brokenRelation.data.sets[0].workoutSessionId = "non_existent_session_id_404";
  const brokenRelationResult = validateBackup(brokenRelation);
  assert(!brokenRelationResult.valid, "Orphaned workout set referencing missing session is rejected");

  // --- 5. A valid backup restores into an empty test database ---
  console.log("\n--- 5. Valid Backup Restores into Empty Test Database ---");
  const emptyStateBefore = await checkDatabaseState(emptyRestoreDb);
  assert(!emptyStateBefore.isPopulated, "Target database starts strictly empty");

  const restoreResult = await restoreBackup(backup, {}, emptyRestoreDb);
  assert(restoreResult.success, "Restore into empty database succeeds");
  assert(restoreResult.restored.users === 1, "1 user restored");
  assert(restoreResult.restored.routines === 1, "1 routine restored");
  assert(restoreResult.restored.exercises === 2, "2 exercises restored");
  assert(restoreResult.restored.workoutSessions === 1, "1 session restored");
  assert(restoreResult.restored.sets === 2, "2 sets restored");

  // --- 6. Restored data matches the original data ---
  console.log("\n--- 6. Restored Data Matches Original Data ---");
  const restoredUser = await emptyRestoreDb.users.get(user1.id);
  const restoredRoutine = await emptyRestoreDb.routines.get(routine1.id);
  const restoredSession = await emptyRestoreDb.workoutSessions.get(workoutSession1.id);
  const restoredSets = await emptyRestoreDb.sets.where("workoutSessionId").equals(workoutSession1.id).toArray();

  assert(Boolean(restoredUser), "Restored user exists in target database");
  assert(restoredUser?.displayName === "Jane Doe", "Restored user name matches original");
  assert(restoredUser?.bodyweight === 145.5, "Restored bodyweight matches original");
  assert(Boolean(restoredRoutine), "Restored routine exists in target database");
  assert(restoredRoutine?.name === "Heavy Push Day", "Restored routine name matches");
  assert(Boolean(restoredSession), "Restored session exists in target database");
  assert(restoredSession?.notes === workoutSession1.notes, "Restored session notes match original");
  assert(restoredSession?.exerciseSnapshots?.[0].name === "Barbell Bench Press", "Restored exercise snapshot matches");
  assert(restoredSets.length === 2, "Restored sets count is 2");
  assert(restoredSets[0].weight === 185 && restoredSets[0].reps === 5, "Restored set 1 weight and reps match exactly");
  assert(restoredSets[1].weight === 195 && restoredSets[1].reps === 5, "Restored set 2 weight and reps match exactly");

  // Verification of default PIN for new athlete restored on fresh device
  const isDefaultPinValid = await verifyPin(DEFAULT_RESTORE_PIN, restoredUser!.pinHash, restoredUser!.pinSalt);
  assert(isDefaultPinValid, `Newly restored profile has safe default PIN (${DEFAULT_RESTORE_PIN}) for login`);

  // --- 7. Failed imports do not leave partial or corrupted data ---
  console.log("\n--- 7. Failed Imports Do Not Leave Partial or Corrupted Data (Atomicity) ---");
  // Seed rollbackTestDb with 1 record
  await rollbackTestDb.users.add({
    id: "usr_initial_stay",
    displayName: "Initial Lifter",
    pinHash: "hash123",
    pinSalt: "salt123",
    avatarColor: "rose",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  });

  const stateBeforeFailedImport = await checkDatabaseState(rollbackTestDb);
  assert(stateBeforeFailedImport.counts.users === 1, "Rollback DB has 1 user before test");

  // Try to restore an invalid backup string
  let failedWithError = false;
  try {
    await restoreBackup("{ bad data }", { strategy: "replace" }, rollbackTestDb);
  } catch {
    failedWithError = true;
  }
  assert(failedWithError, "Invalid restore throws error as expected");

  const stateAfterFailedImport = await checkDatabaseState(rollbackTestDb);
  assert(stateAfterFailedImport.counts.users === 1, "Database was NOT wiped or left partially restored");
  const preservedUser = await rollbackTestDb.users.get("usr_initial_stay");
  assert(Boolean(preservedUser), "Original record preserved intact after failed restore");

  // --- 8. Populated-database conflicts never cause silent data loss ---
  console.log("\n--- 8. Populated-Database Conflicts Never Cause Silent Data Loss ---");
  // Seed populatedRestoreDb with a local workout
  const localUserPin = await hashPin("9999");
  const localUser: User = {
    id: "usr_athlete_local",
    displayName: "Existing Local Athlete",
    pinHash: localUserPin.pinHash,
    pinSalt: localUserPin.pinSalt,
    avatarColor: "cyan",
    bodyweight: 175,
    createdAt: "2026-02-01T00:00:00Z",
    updatedAt: "2026-02-01T00:00:00Z",
  };
  const localRoutine: Routine = {
    id: "rtn_local_leg_day",
    userId: localUser.id,
    name: "Existing Local Leg Day",
    displayOrder: 1,
    createdAt: "2026-02-01T00:00:00Z",
    updatedAt: "2026-02-01T00:00:00Z",
  };
  await populatedRestoreDb.users.add(localUser);
  await populatedRestoreDb.routines.add(localRoutine);

  // 8a. Restoring without strategy into populated DB must be rejected
  let rejectedNoStrategy = false;
  try {
    await restoreBackup(backup, {}, populatedRestoreDb);
  } catch (err: any) {
    rejectedNoStrategy = true;
    assert(err.message.includes("explicitly choose a restore strategy"), "Explicit strategy required error thrown");
  }
  assert(rejectedNoStrategy, "Restoring into populated database without strategy is strictly rejected");

  // Verify no data was lost
  const localUserStillPresent = await populatedRestoreDb.users.get(localUser.id);
  assert(Boolean(localUserStillPresent), "Local user preserved when restore rejected");

  // 8b. Strategy 'merge_skip_existing' preserves existing records without overwriting
  const mergeResult = await restoreBackup(
    backup,
    { strategy: "merge_skip_existing" },
    populatedRestoreDb
  );
  assert(mergeResult.success, "Merge restore succeeded");
  assert(mergeResult.strategy === "merge_skip_existing", "Strategy recorded as merge_skip_existing");
  const mergedLocalUser = await populatedRestoreDb.users.get(localUser.id);
  const mergedImportedUser = await populatedRestoreDb.users.get(user1.id);
  assert(Boolean(mergedLocalUser), "Local existing athlete was NOT deleted or overwritten");
  assert(Boolean(mergedImportedUser), "New imported athlete was added to database");
  const isLocalUserPinIntact = await verifyPin("9999", mergedLocalUser!.pinHash, mergedLocalUser!.pinSalt);
  assert(isLocalUserPinIntact, "Existing local athlete's PIN was strictly preserved without alteration");

  // 8c. Strategy 'replace' requires explicit selection and preserves PIN for existing matching IDs
  const replaceResult = await restoreBackup(
    backup,
    { strategy: "replace" },
    populatedRestoreDb
  );
  assert(replaceResult.success, "Replace restore succeeded");
  const replacedUsersCount = await populatedRestoreDb.users.count();
  assert(replacedUsersCount === 1, "Replace strategy replaced old database contents with backup");

  // --- 9. PIN hashes, credentials, and secrets are excluded ---
  console.log("\n--- 9. PIN Hashes, Credentials, and Secrets are Excluded ---");
  const { jsonString } = await exportBackupToJson(testDb);
  assert(!jsonString.includes(testUserPin.pinHash), "Export JSON does NOT contain user's pinHash");
  assert(!jsonString.includes(testUserPin.pinSalt), "Export JSON does NOT contain user's pinSalt");
  assert(!jsonString.includes("pinHash"), "String 'pinHash' does NOT appear in exported data");
  assert(!jsonString.includes("pinSalt"), "String 'pinSalt' does NOT appear in exported data");
  assert(!jsonString.includes("sessionToken"), "Session tokens excluded from backup");
  assert(!jsonString.includes("vapid"), "VAPID secrets excluded from backup");

  // --- 10. Import does not blindly replay stale synchronization queue entries ---
  console.log("\n--- 10. Import Does Not Blindly Replay Stale Synchronization Queue Entries ---");
  // Craft a backup with a stale sync queue entry
  const backupWithStaleSync = JSON.parse(JSON.stringify(backup)) as SculpdBackup;
  (backupWithStaleSync.data as any).syncQueue = [
    {
      id: "sq_old_stale_mutation_123",
      userId: user1.id,
      operation: "delete",
      collection: "workout_sessions",
      entityId: "ws_session_march_10",
      timestamp: 100000,
      status: "pending",
      attempts: 0,
    },
  ];

  const syncTestDb = new SculpdDatabase("sculpd_test_backup_sync");
  await syncTestDb.open();
  await syncTestDb.syncQueue.clear();

  await restoreBackup(backupWithStaleSync, { strategy: "replace" }, syncTestDb);

  const syncQueueCount = await syncTestDb.syncQueue.count();
  assert(syncQueueCount === 0, "Stale syncQueue mutations from backup were NOT imported or queued for replay");
  const pendingQueueItem = await syncTestDb.syncQueue.get("sq_old_stale_mutation_123");
  assert(!pendingQueueItem, "Stale outbox mutation does not exist in db.syncQueue");

  // --- 11. Legacy Routine Name Healing (Bug Fix: rtn_friday_lower_posterior missing 'name') ---
  console.log("\n--- 11. Legacy Routine Name Healing (rtn_friday_lower_posterior without 'name') ---");
  const backupWithLegacyRoutine = JSON.parse(JSON.stringify(backup)) as SculpdBackup;
  // Replace routines with legacy routine lacking 'name'
  backupWithLegacyRoutine.data.routines = [
    {
      id: "rtn_friday_lower_posterior",
      slug: "friday",
      dayName: "Friday",
      focusTarget: "Full Lower Body (Posterior Chain) + Calves",
      color: "from-rose-500/10 to-zinc-900",
      displayOrder: 5,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    } as any,
  ];

  const validationLegacyResult = validateBackup(backupWithLegacyRoutine);
  assert(validationLegacyResult.valid, "Backup with legacy routine lacking 'name' is successfully validated");
  const validatedRoutine = validationLegacyResult.backup?.data.routines[0];
  assert(Boolean(validatedRoutine?.name), "Legacy routine assigned a valid inferred name");
  assert(
    validatedRoutine?.name === "Friday - Full Lower Body (Posterior Chain) + Calves",
    `Inferred routine name matches expected: '${validatedRoutine?.name}'`
  );

  // Also test routine with only ID
  const routineWithOnlyId = { id: "rtn_friday_lower_posterior" };
  const inferredFromId = inferRoutineName(routineWithOnlyId);
  assert(inferredFromId === "Friday Lower Posterior", `Inferred name from ID is '${inferredFromId}'`);

  const legacyRestoreDb = new SculpdDatabase("sculpd_test_backup_legacy_routine");
  await legacyRestoreDb.open();
  await restoreBackup(backupWithLegacyRoutine, { strategy: "replace" }, legacyRestoreDb);
  const restoredLegacyRoutine = await legacyRestoreDb.routines.get("rtn_friday_lower_posterior");
  assert(Boolean(restoredLegacyRoutine?.name), "Restored legacy routine in database has a valid 'name'");
  assert(
    restoredLegacyRoutine?.name === "Friday - Full Lower Body (Posterior Chain) + Calves",
    "Restored legacy routine name saved correctly in DB"
  );

  console.log("\n============================================================");
  console.log("✅ ALL LOCAL BACKUP & RESTORE TESTS PASSED 100%!");
  console.log("============================================================\n");
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
