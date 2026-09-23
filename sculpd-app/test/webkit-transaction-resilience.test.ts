// test/webkit-transaction-resilience.test.ts
import "fake-indexeddb/auto";
import { db } from "../lib/db/index";
import {
  isAbortOrConnectionError,
  ensureDbOpen,
  resilientTransaction,
} from "../lib/db/transaction";
import { createUser } from "../lib/db/user-repository";
import { createRoutine } from "../lib/db/routine-repository";
import {
  startWorkoutSession,
  logUserSet,
  completeWorkoutSession,
  deleteUserLastSet,
} from "../lib/db/workout-repository";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`❌ Assertion Failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

async function runWebKitResilienceTests() {
  console.log("\n============================================================");
  console.log("SCULP'D 2.0: WEBKIT / SAFARI TRANSACTION RESILIENCE TESTS");
  console.log("============================================================\n");

  console.log("--- 1. WebKit / Safari Abort & Connection Error Detection ---");
  const abortError = new Error("The transaction was aborted");
  abortError.name = "AbortError";
  assert(isAbortOrConnectionError(abortError), "Detects AbortError by name");

  const customAbortMsg = new Error("A request was aborted, for example, through ThatOrAnotherTransaction.abort()");
  assert(isAbortOrConnectionError(customAbortMsg), "Detects transaction aborted by message");

  const innerAbortError = new Error("Transaction failed");
  (innerAbortError as any).inner = { name: "AbortError" };
  assert(isAbortOrConnectionError(innerAbortError), "Detects Dexie inner AbortError");

  const closedError = new Error("DatabaseClosedError");
  closedError.name = "DatabaseClosedError";
  assert(isAbortOrConnectionError(closedError), "Detects DatabaseClosedError");

  const closingMsg = new Error("The database connection is closing");
  assert(isAbortOrConnectionError(closingMsg), "Detects connection closing message");

  const cantOpenError = new Error("UnknownError: Unable to open database file on disk");
  cantOpenError.name = "UnknownError";
  assert(isAbortOrConnectionError(cantOpenError), "Detects WebKit UnknownError / Unable to open database file on disk");

  const openFailedError = new Error("OpenFailedError: Database open failed");
  openFailedError.name = "OpenFailedError";
  assert(isAbortOrConnectionError(openFailedError), "Detects Dexie OpenFailedError");

  const genuineValidationError = new Error("Validation Error: Routine name cannot be empty");
  assert(!isAbortOrConnectionError(genuineValidationError), "Does NOT flag genuine application validation errors");

  console.log("\n--- 2. ensureDbOpen Connection Recovery ---");
  await ensureDbOpen();
  assert(db.isOpen(), "Database is confirmed open and healthy");

  console.log("\n--- 3. Clean Transaction Success ---");
  let executedClean = false;
  await resilientTransaction("cleanOp", [db.users], async () => {
    executedClean = true;
  });
  assert(executedClean, "Standard clean transaction executes successfully");

  console.log("\n--- 4. Transient WebKit Abort with Successful Retry ---");
  let attempts = 0;
  const retryResult = await resilientTransaction("transientAbortOp", [db.users], async () => {
    attempts++;
    if (attempts === 1) {
      const err = new Error("The transaction was aborted");
      err.name = "AbortError";
      throw err;
    }
    return "recovered_value";
  });
  assert(attempts === 2, "Operation attempted retry after first transient AbortError");
  assert(retryResult === "recovered_value", "Recovered successfully and returned expected result");

  console.log("\n--- 5. Persistent WebKit Abort Falling Back to Direct Single-Store Execution ---");
  let fallbackInvoked = false;
  let txAttempts = 0;

  const fallbackResult = await resilientTransaction(
    "persistentAbortOp",
    [db.users, db.syncQueue],
    async () => {
      txAttempts++;
      const err = new Error("The transaction was aborted");
      err.name = "AbortError";
      throw err;
    },
    async () => {
      fallbackInvoked = true;
      return "fallback_success";
    }
  );

  assert(txAttempts === 2, "Transaction attempted standard execution and 1 retry before fallback");
  assert(fallbackInvoked, "Direct single-store fallback was invoked cleanly");
  assert(fallbackResult === "fallback_success", "Fallback completed and returned expected result");

  console.log("\n--- 6. Genuine Application Error Propagation ---");
  let caughtGenuineError = false;
  try {
    await resilientTransaction("failingOp", [db.users], async () => {
      throw new Error("Strict User Isolation Error: userId is required.");
    });
  } catch (err: any) {
    caughtGenuineError = err.message.includes("userId is required");
  }
  assert(caughtGenuineError, "Genuine non-abort errors are rethrown immediately without fallback");

  console.log("\n--- 7. End-to-End Gym-Floor Flow Under Resilient Transactions ---");
  // 1. Create User
  const user = await createUser({
    displayName: "WebKit Test Athlete",
    pin: "4321",
    bodyweight: 180,
  });
  assert(!!user.id, `User created safely: ${user.displayName}`);

  // 2. Create Routine
  const routine = await createRoutine(user.id, {
    name: "Safari Resilience Routine",
    exercises: [
      {
        exerciseId: "std_ex_bench_press",
        targetSets: 3,
        targetReps: "5",
        restSeconds: 90,
      },
    ],
  });
  assert(!!routine.id, `Routine created safely: ${routine.name}`);

  // 3. Start Session
  const session = await startWorkoutSession(user.id, routine.id);
  assert(session.status === "in_progress", "Workout session started in progress");

  // 4. Log Set
  const set1 = await logUserSet(user.id, session.id, "std_ex_bench_press", 225, 5);
  assert(set1.setNumber === 1 && set1.weight === 225, "First set logged successfully");

  const set2 = await logUserSet(user.id, session.id, "std_ex_bench_press", 225, 5);
  assert(set2.setNumber === 2, "Second set logged successfully");

  // 5. Delete Last Set
  const deleted = await deleteUserLastSet(user.id, session.id, "std_ex_bench_press");
  assert(deleted, "Last set deleted successfully via resilient transaction");

  // 6. Complete Session
  const completed = await completeWorkoutSession(user.id, session.id, "Great session, zero aborts");
  assert(completed.status === "completed", "Workout session completed successfully");
  assert(completed.notes === "Great session, zero aborts", "Session notes saved correctly");

  console.log("\n============================================================");
  console.log("✅ ALL WEBKIT / SAFARI TRANSACTION RESILIENCE TESTS PASSED 100%!");
  console.log("============================================================\n");
}

runWebKitResilienceTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
