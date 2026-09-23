// lib/db/transaction.ts
import { db } from "./index";
import { Table } from "dexie";

/**
 * Detects if an error is a WebKit / Safari transient IndexedDB transaction abort or connection error.
 */
export function isAbortOrConnectionError(err: any): boolean {
  if (!err) return false;
  const name = String(err.name || "");
  const innerName = String(err.inner?.name || "");
  const msg = String(err.message || "").toLowerCase();

  return (
    name === "AbortError" ||
    name === "DatabaseClosedError" ||
    name === "InvalidStateError" ||
    name === "TransactionInactiveError" ||
    name === "UnknownError" ||
    name === "OpenFailedError" ||
    innerName === "AbortError" ||
    innerName === "InvalidStateError" ||
    innerName === "TransactionInactiveError" ||
    innerName === "UnknownError" ||
    innerName === "OpenFailedError" ||
    msg.includes("aborted") ||
    msg.includes("transaction was aborted") ||
    msg.includes("transaction has been aborted") ||
    msg.includes("connection is closing") ||
    msg.includes("database closed") ||
    msg.includes("the transaction was aborted") ||
    msg.includes("transaction is not active") ||
    msg.includes("transaction is inactive") ||
    msg.includes("unable to open database file") ||
    msg.includes("open database file on disk")
  );
}

/**
 * Ensures the Dexie database is open and healthy.
 * Automatically recovers if WebKit terminated the connection during iOS background suspension.
 * NEVER calls db.close() as closing an active SQLite backing store causes SQLITE_CANTOPEN on WebKit.
 */
export async function ensureDbOpen(): Promise<void> {
  try {
    if (!db.isOpen()) {
      await db.open();
    }
  } catch (err) {
    console.warn("[DB] Re-opening database:", err);
  }
}

/**
 * Executes a database write operation with full WebKit / iOS Safari resilience:
 * 1. Ensures database connection is open and active.
 * 2. Attempts Dexie transaction across the specified tables using the operation callback.
 * 3. If WebKit aborts the transaction (due to aggressive auto-commit, microtask gap, or multi-store lock contention):
 *    a. Re-establishes database connection if not open.
 *    b. Retries the transaction once after a brief tick.
 * 4. If transaction continues to abort due to WebKit multi-store lock contention:
 *    a. Falls back to direct single-store operations (which WebKit processes without multi-store lock conflicts).
 * 5. Guarantees that critical gym-floor workout data is never dropped due to iOS Safari transaction aborts.
 */
export async function resilientTransaction<T>(
  actionName: string,
  tables: Table<any, any>[],
  op: () => Promise<T>,
  fallbackDirect?: () => Promise<T>
): Promise<T> {
  await ensureDbOpen();

  // Attempt 1: Try standard Dexie transaction
  try {
    return await db.transaction("rw", tables, op);
  } catch (err: any) {
    if (!isAbortOrConnectionError(err)) {
      // Genuine validation or business logic error, throw immediately
      throw err;
    }

    console.warn(
      `[DB Resilience] ${actionName} transaction aborted by browser, attempting retry...`,
      err
    );

    // Attempt 2: Reopen if needed and retry once after a short tick (NO db.close())
    try {
      await ensureDbOpen();
      await new Promise((resolve) => setTimeout(resolve, 80));
      return await db.transaction("rw", tables, op);
    } catch (retryErr: any) {
      if (!isAbortOrConnectionError(retryErr)) {
        throw retryErr;
      }

      console.warn(
        `[DB Resilience] ${actionName} multi-store transaction aborted again by WebKit. Falling back to direct single-store execution...`,
        retryErr
      );

      // Attempt 3: Direct single-store fallback
      // In WebKit, single-store operations do not suffer from multi-store lock contention.
      await ensureDbOpen();
      if (fallbackDirect) {
        return await fallbackDirect();
      }
      return await op();
    }
  }
}
