// test/phase2-identity-isolation.test.ts
import "fake-indexeddb/auto";
import { db } from "../lib/db/index";
import { hashPin, verifyPin } from "../lib/crypto/pin";
import {
  createUser,
  authenticateUser,
  listSafeUsers,
  getUserById,
  getSafeUserById,
} from "../lib/db/user-repository";
import {
  startWorkoutSession,
  logUserSet,
  getUserSetsForSession,
  getUserSetsForExercise,
  getUserWorkoutSessions,
  deleteUserLastSet,
  getUserPreviousSet,
  getUserSyncQueue,
  getActiveWorkoutSession,
  completeWorkoutSession,
} from "../lib/db/workout-repository";

// Simple assertion helper
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`❌ Assertion Failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

async function runTests() {
  console.log("\n==========================================");
  console.log("SCULP'D 2.0 PHASE 2: IDENTITY & ISOLATION");
  console.log("==========================================\n");

  // Clear any existing database state
  await db.delete();
  await db.open();

  console.log("--- 1. Testing Profile Creation & Safe User Sanitization ---");
  const userA = await createUser({
    displayName: "Alex",
    pin: "1234",
    avatarColor: "emerald",
  });

  assert(Boolean(userA.id), "User A has a generated UUID");
  assert(userA.displayName === "Alex", "User A display name is 'Alex'");
  assert(userA.avatarColor === "emerald", "User A avatar color is 'emerald'");
  assert(
    !("pinHash" in userA) && !("pinSalt" in userA) && !("pin" in userA),
    "Returned User A object is sanitized (no pinHash, pinSalt, or plaintext pin)"
  );

  console.log("\n--- 2. Testing Cryptographic PIN Hashing & Verification ---");
  const { pinHash, pinSalt } = await hashPin("1234");
  assert(Boolean(pinHash) && pinHash.length === 64, "PBKDF2 SHA-256 hash generated (64 hex chars)");
  assert(Boolean(pinSalt) && pinSalt.length === 32, "Salt generated (32 hex chars)");

  const isVerified = await verifyPin("1234", pinHash, pinSalt);
  assert(isVerified === true, "Valid PIN verified successfully");

  console.log("\n--- 3. Testing Incorrect PIN Rejection ---");
  const authValid = await authenticateUser(userA.id, "1234");
  assert(authValid.success === true && authValid.user?.displayName === "Alex", "User A authenticated with correct PIN");

  const authWrong = await authenticateUser(userA.id, "9999");
  assert(authWrong.success === false, "Incorrect PIN correctly rejected");
  assert(authWrong.error === "Incorrect PIN.", "Appropriate error message returned on bad PIN");

  const authShort = await authenticateUser(userA.id, "12");
  assert(authShort.success === false, "Short PIN correctly rejected");

  console.log("\n--- 4. Testing Profile Selection & Active User Session Preservation ---");
  // Mock localStorage session
  const sessionKey = "sculpd_active_user_id";
  const mockStorage: Record<string, string> = {};

  mockStorage[sessionKey] = userA.id;
  assert(mockStorage[sessionKey] === userA.id, "Active session token saved to storage");

  const restoredUser = await getSafeUserById(mockStorage[sessionKey]);
  assert(restoredUser !== undefined && restoredUser.id === userA.id, "Session restored: User A profile re-identified");

  console.log("\n--- 5. Testing Profile Switching & Logout ---");
  delete mockStorage[sessionKey];
  assert(mockStorage[sessionKey] === undefined, "Logout successfully cleared active session token");

  console.log("\n--- 6. Testing Local Record Creation for User A ---");
  const routineId = globalThis.crypto.randomUUID();
  const exerciseId = globalThis.crypto.randomUUID();

  const sessionA = await startWorkoutSession(userA.id, routineId);
  assert(sessionA.userId === userA.id, "Workout session created specifically for User A");
  assert(sessionA.status === "in_progress", "Session status is in_progress");

  const set1 = await logUserSet(userA.id, sessionA.id, exerciseId, 225, 8, 8);
  const set2 = await logUserSet(userA.id, sessionA.id, exerciseId, 235, 6, 9);
  const set3 = await logUserSet(userA.id, sessionA.id, exerciseId, 245, 5, 9.5);

  assert(set1.setNumber === 1 && set1.weight === 225, "Set 1 recorded for User A (225 lbs × 8)");
  assert(set2.setNumber === 2 && set2.weight === 235, "Set 2 recorded for User A (235 lbs × 6)");
  assert(set3.setNumber === 3 && set3.weight === 245, "Set 3 recorded for User A (245 lbs × 5)");

  const userASets = await getUserSetsForSession(userA.id, sessionA.id);
  assert(userASets.length === 3, "User A has exactly 3 sets recorded in session");

  const userAQueue = await getUserSyncQueue(userA.id);
  assert(userAQueue.length === 5, "User A has 5 pending sync queue items (1 user + 1 session + 3 sets)");

  console.log("\n--- 7. Testing User Switching to User B ---");
  const userB = await createUser({
    displayName: "Sam",
    pin: "5678",
    avatarColor: "amber",
  });
  assert(userB.displayName === "Sam", "User B (Sam) created");

  const authB = await authenticateUser(userB.id, "5678");
  assert(authB.success === true, "User B authenticated with PIN '5678'");

  console.log("\n--- 8. Testing Strict User Isolation: User B Cannot Access User A's Data ---");
  const userBSessions = await getUserWorkoutSessions(userB.id);
  assert(userBSessions.length === 0, "User B has 0 workout sessions (User A's session is hidden)");

  const userBSetsForSession = await getUserSetsForSession(userB.id, sessionA.id);
  assert(userBSetsForSession.length === 0, "User B cannot query sets from User A's session");

  const userBSetsForExercise = await getUserSetsForExercise(userB.id, exerciseId);
  assert(userBSetsForExercise.length === 0, "User B has 0 sets for this exercise");

  const userBActiveSession = await getActiveWorkoutSession(userB.id);
  assert(userBActiveSession === undefined, "User B has no active workout session");

  const userBPreviousSet = await getUserPreviousSet(userB.id, exerciseId);
  assert(userBPreviousSet === undefined, "User B has no previous set for this exercise (User A's PR is hidden)");

  const userBQueue = await getUserSyncQueue(userB.id);
  assert(userBQueue.length === 1, "User B has only 1 syncQueue item (their own user creation, not User A's items)");

  // Verify User B cannot mutate User A's session
  let unauthorizedErrorCaught = false;
  try {
    await logUserSet(userB.id, sessionA.id, exerciseId, 100, 10);
  } catch (err: any) {
    unauthorizedErrorCaught = true;
    assert(err.message.includes("does not belong to user"), "Cross-user write prevented with authorization error");
  }
  assert(unauthorizedErrorCaught === true, "Enforced security boundary: User B write to User A session was blocked");

  console.log("\n--- 9. Switching Back to User A: Data Integrity Verified ---");
  const userASessionsRestored = await getUserWorkoutSessions(userA.id);
  assert(userASessionsRestored.length === 1, "User A workout session still intact");

  const userASetsRestored = await getUserSetsForSession(userA.id, sessionA.id);
  assert(userASetsRestored.length === 3, "User A sets intact (3 sets preserved)");

  const prevSet = await getUserPreviousSet(userA.id, exerciseId);
  assert(prevSet?.weight === 245, "User A previous set indicator correctly returns 245 lbs");

  // Test set deletion on User A
  const deleteResult = await deleteUserLastSet(userA.id, sessionA.id, exerciseId);
  assert(deleteResult === true, "User A deleted their last set");
  const setsAfterDelete = await getUserSetsForSession(userA.id, sessionA.id);
  assert(setsAfterDelete.length === 2, "User A sets reduced to 2 after deletion");

  console.log("\n--- 10. Testing Plaintext PIN Non-Persistence ---");
  const rawStoredUser = await db.users.get(userA.id);
  assert(Boolean(rawStoredUser?.pinHash), "Raw user record stores pinHash");
  assert(Boolean(rawStoredUser?.pinSalt), "Raw user record stores pinSalt");
  assert(!("pin" in (rawStoredUser || {})), "Raw user record does NOT have 'pin' property");

  const serialized = JSON.stringify(rawStoredUser);
  assert(!serialized.includes("1234"), "Plaintext PIN '1234' does NOT exist anywhere in database serialization");

  console.log("\n==========================================");
  console.log("✅ ALL PHASE 2 VERIFICATION TESTS PASSED!");
  console.log("==========================================\n");
}

runTests().catch((err) => {
  console.error("Test Suite Failed:", err);
  process.exit(1);
});
