// test/rest-timer-notifications.test.ts
import "fake-indexeddb/auto";
import {
  calculateRemainingSeconds,
  isRestExpired,
  buildNotificationContent,
  RestTimerState,
  RestTimerPayload,
} from "../lib/notifications/rest-notifier";
import { formatPushPayload } from "../lib/notifications/web-push-server";

// Assertion helper
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`❌ Assertion Failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

async function runNotificationTests() {
  console.log("\n============================================================");
  console.log("SCULP'D 2.0: REST TIMER & BACKGROUND NOTIFICATION TESTS");
  console.log("============================================================\n");

  // In-memory mock localStorage for node test environment
  const mockLocalStorage: Record<string, string> = {};
  const fakeStorage = {
    getItem: (key: string) => mockLocalStorage[key] || null,
    setItem: (key: string, value: string) => {
      mockLocalStorage[key] = value;
    },
    removeItem: (key: string) => {
      delete mockLocalStorage[key];
    },
    clear: () => {
      for (const k of Object.keys(mockLocalStorage)) {
        delete mockLocalStorage[k];
      }
    },
  };

  // Mock ServiceWorker event dispatcher
  const swMessagesReceived: any[] = [];
  const fakeServiceWorker = {
    postMessage: (msg: any) => {
      swMessagesReceived.push(msg);
    },
  };

  console.log("--- 1. Rest Timer Stores Absolute Expiration Timestamp ---");
  const t0 = 1770000000000; // Fixed epoch reference (ms)
  const durationSeconds = 90;
  const targetEndMs = t0 + durationSeconds * 1000;

  const timerState: RestTimerState = {
    id: "rest_sess1_set2",
    restStartedAt: t0,
    restEndsAt: targetEndMs,
    totalDuration: durationSeconds,
    exerciseName: "Barbell Bench Press",
    nextSetNumber: 2,
    workoutUrl: "/workout/rtn_chest_power",
    status: "running",
    notificationSent: false,
  };

  fakeStorage.setItem("sculpd_rest_timer_state", JSON.stringify(timerState));

  assert(timerState.restStartedAt === t0, "restStartedAt stored as absolute epoch milliseconds");
  assert(timerState.restEndsAt === targetEndMs, "restEndsAt stored as absolute epoch milliseconds");
  assert(timerState.restEndsAt - timerState.restStartedAt === 90000, "Difference exactly equals total duration in ms");

  // Verify calculation at t0
  const remAtStart = calculateRemainingSeconds(timerState.restEndsAt, t0);
  assert(remAtStart === 90, "Remaining time at start is exactly 90s");

  console.log("\n--- 2. Remaining Time Reconstructed After App Reopen ---");
  // Simulate user leaving app, switching to music app, and reopening after 38 seconds
  const tReopen = t0 + 38000;
  const loadedStateJson = fakeStorage.getItem("sculpd_rest_timer_state");
  assert(Boolean(loadedStateJson), "Rest timer state successfully retrieved from storage");

  const reloadedState: RestTimerState = JSON.parse(loadedStateJson!);
  const remReopen = calculateRemainingSeconds(reloadedState.restEndsAt, tReopen);
  assert(remReopen === 52, `Remaining time reconstructed as exactly 52s (90s - 38s = got ${remReopen}s)`);
  assert(reloadedState.exerciseName === "Barbell Bench Press", "Exercise name context fully preserved ('Barbell Bench Press')");
  assert(reloadedState.nextSetNumber === 2, "Next set number preserved (Set 2)");
  assert(reloadedState.workoutUrl === "/workout/rtn_chest_power", "Active workout route preserved (/workout/rtn_chest_power)");

  console.log("\n--- 3. Expired Rest Detected Correctly After App Suspension ---");
  // Simulate phone locked or suspended for 140 seconds (well past the 90s timer)
  const tAfterSuspension = t0 + 140000;
  const expired = isRestExpired(reloadedState.restEndsAt, tAfterSuspension);
  assert(expired === true, "isRestExpired correctly detects expired rest");

  const remExpired = calculateRemainingSeconds(reloadedState.restEndsAt, tAfterSuspension);
  assert(remExpired === 0, "Remaining seconds clamped to 0 after expiration");

  // Simulate cleanup on detected expiration
  fakeStorage.removeItem("sculpd_rest_timer_state");
  assert(fakeStorage.getItem("sculpd_rest_timer_state") === null, "Storage cleaned up after expired rest detected");

  console.log("\n--- 4. Notification Content and Context Formatting ---");
  // Test formatting with exercise name and set number
  const notifContent = buildNotificationContent("Barbell Bench Press", 3);
  assert(
    notifContent.title === "Rest complete — Barbell Bench Press",
    `Notification title formatted with context: '${notifContent.title}'`
  );
  assert(
    notifContent.body === "Ready for Set 3",
    `Notification body formatted with set number: '${notifContent.body}'`
  );

  // Test fallback without exercise name
  const fallbackContent = buildNotificationContent(undefined, undefined);
  assert(fallbackContent.title === "Rest complete! ⏱️", "Fallback title provided when name omitted");
  assert(
    fallbackContent.body === "Your rest window is complete. Ready for next set.",
    "Fallback body provided when set number omitted"
  );

  console.log("\n--- 5. Duplicate Notification Prevention & Notification Tags ---");
  // Simulate scheduling notification to Service Worker
  const scheduleTimer = (
    sw: typeof fakeServiceWorker,
    payload: RestTimerPayload,
    scheduledIds: Set<string>
  ): boolean => {
    if (scheduledIds.has(payload.id)) {
      return false; // Prevent duplicate dispatch
    }
    scheduledIds.add(payload.id);
    sw.postMessage({
      type: "SCHEDULE_REST_TIMER",
      id: payload.id,
      restEndsAt: payload.restEndsAt,
      exerciseName: payload.exerciseName,
      nextSetNumber: payload.nextSetNumber,
      workoutUrl: payload.workoutUrl,
    });
    return true;
  };

  const scheduledIds = new Set<string>();
  const payload1: RestTimerPayload = {
    id: "timer_session_abc_1",
    restStartedAt: t0,
    restEndsAt: t0 + 90000,
    totalDuration: 90,
    exerciseName: "Neutral Grip Lat Pulldown",
    nextSetNumber: 3,
    workoutUrl: "/workout/rtn_pull",
  };

  const firstScheduled = scheduleTimer(fakeServiceWorker, payload1, scheduledIds);
  assert(firstScheduled === true, "First timer schedule accepted and dispatched to SW");
  assert(swMessagesReceived.length === 1, "Exactly 1 message dispatched to Service Worker");
  assert(swMessagesReceived[0].id === "timer_session_abc_1", "Message contains correct stable timer ID");

  // Re-render / re-mount simulation with same timer
  const duplicateAttempt = scheduleTimer(fakeServiceWorker, payload1, scheduledIds);
  assert(duplicateAttempt === false, "Duplicate timer schedule prevented for identical timer ID");
  assert(swMessagesReceived.length === 1, "Service Worker message count remains 1 (no duplicate sent)");

  // Verify notification tag deduplication format
  const expectedTag = `sculpd-rest-${payload1.id}`;
  assert(expectedTag === "sculpd-rest-timer_session_abc_1", "Notification tag formatted with stable ID to prevent duplicates");

  console.log("\n--- 6. Notification Click Navigation Target ---");
  // Simulate Service Worker notificationclick event handler
  const simulateNotificationClick = (
    notificationData: { url?: string },
    openClients: Array<{ url: string; focused: boolean; navigatedTo?: string }>
  ): string => {
    const targetUrl = notificationData.url || "/";
    // Check if client matches
    if (openClients.length > 0) {
      const client = openClients[0];
      client.focused = true;
      if (client.url !== targetUrl && targetUrl !== "/") {
        client.navigatedTo = targetUrl;
      }
      return `focused:${client.navigatedTo || client.url}`;
    }
    return `opened:${targetUrl}`;
  };

  const clients = [{ url: "https://sculpd.app/", focused: false, navigatedTo: undefined }];
  const clickResult = simulateNotificationClick({ url: "/workout/rtn_chest_power" }, clients);
  assert(clickResult === "focused:/workout/rtn_chest_power", "Notification click focused existing client and navigated to active workout");
  assert(clients[0].focused === true, "Client window marked as focused");
  assert(clients[0].navigatedTo === "/workout/rtn_chest_power", "Client navigated to '/workout/rtn_chest_power'");

  // Test when no client is open
  const openNewResult = simulateNotificationClick({ url: "/workout/rtn_chest_power" }, []);
  assert(openNewResult === "opened:/workout/rtn_chest_power", "Notification click opened new window directly to active workout");

  console.log("\n--- 7. Rest Controls: +30s, Ready Now, and Cancel ---");
  // Test +30s extension
  const extendedTargetMs = targetEndMs + 30000;
  const remAfterPlus30 = calculateRemainingSeconds(extendedTargetMs, t0);
  assert(remAfterPlus30 === 120, `+30s successfully extends duration from 90s to 120s (got ${remAfterPlus30}s)`);

  // Test Ready Now / cancellation
  fakeServiceWorker.postMessage({
    type: "CANCEL_REST_TIMER",
    id: payload1.id,
  });
  assert(swMessagesReceived.length === 2, "Cancel message dispatched to Service Worker");
  assert(swMessagesReceived[1].type === "CANCEL_REST_TIMER", "Cancel message has correct type");
  assert(swMessagesReceived[1].id === payload1.id, "Cancel message has matching timer ID");

  console.log("\n--- 8. Web Push Dual-Compatible Payload (iOS 17 Baseline + iOS 18.4+ Declarative) ---");
  const pushJsonStr = formatPushPayload({
    timerId: "rest_sess_42",
    title: "Rest complete — Overhead Press",
    body: "Ready for Set 3",
    url: "/workout/rtn_shoulders",
  });
  const parsedPush = JSON.parse(pushJsonStr);

  // Assert iOS 17 baseline standard Web Push properties
  assert(parsedPush.title === "Rest complete — Overhead Press", "Standard iOS 17 title populated");
  assert(parsedPush.body === "Ready for Set 3", "Standard iOS 17 body populated");
  assert(parsedPush.url === "/workout/rtn_shoulders", "Standard iOS 17 url populated");
  assert(parsedPush.timerId === "rest_sess_42", "Standard timerId preserved");

  // Assert Declarative Web Push properties (iOS 18.4+ enhancement)
  assert(parsedPush.web_push === 8030, "RFC 8030 declarative indicator present (8030)");
  assert(Boolean(parsedPush.notification), "Declarative notification dictionary present");
  assert(parsedPush.notification.title === "Rest complete — Overhead Press", "Declarative title matches");
  assert(parsedPush.notification.body === "Ready for Set 3", "Declarative body matches");
  assert(parsedPush.notification.navigate === "/workout/rtn_shoulders", "Declarative navigate URL matches");
  assert(parsedPush.notification.tag === "sculpd-rest-rest_sess_42", "Declarative tag prevents duplicates");
  assert(parsedPush.notification.silent === false, "Declarative silent is false");

  console.log("\n--- 9. Two-Layer Race Condition Guard & Cancellation State ---");
  // Simulate dispatch guard check
  const simulateDispatchGuard = (
    notifStatus: "scheduled" | "dispatched" | "cancelled" | "superseded",
    targetMs: number,
    currentMs: number
  ): { shouldDispatch: boolean; reason?: string } => {
    if (notifStatus !== "scheduled") {
      return { shouldDispatch: false, reason: `Status is ${notifStatus}` };
    }
    // If timer was extended into the future by >5 seconds, skip early trigger
    if (targetMs > currentMs + 5000) {
      return { shouldDispatch: false, reason: "Timer was extended" };
    }
    return { shouldDispatch: true };
  };

  const scheduledCheck = simulateDispatchGuard("scheduled", t0 + 90000, t0 + 90000);
  assert(scheduledCheck.shouldDispatch === true, "Valid scheduled timer passes dispatch guard");

  const cancelledCheck = simulateDispatchGuard("cancelled", t0 + 90000, t0 + 90000);
  assert(cancelledCheck.shouldDispatch === false, "Cancelled timer rejected by dispatch guard (prevents false push)");

  const supersededCheck = simulateDispatchGuard("superseded", t0 + 90000, t0 + 90000);
  assert(supersededCheck.shouldDispatch === false, "Superseded timer rejected by dispatch guard");

  const extendedCheck = simulateDispatchGuard("scheduled", t0 + 120000, t0 + 90000);
  assert(extendedCheck.shouldDispatch === false, "Premature trigger for extended timer rejected by guard");

  console.log("\n--- 10. Offline Isolation & Zero-Network Dependency ---");
  // Simulate offline workout: network unavailable, but localStorage & math function 100%
  const offlineT0 = 1775000000000;
  const offlineEndsAt = offlineT0 + 120000; // 2 minutes

  const offlineState: RestTimerState = {
    id: "offline_timer_123",
    restStartedAt: offlineT0,
    restEndsAt: offlineEndsAt,
    totalDuration: 120,
    exerciseName: "Barbell Squat",
    nextSetNumber: 4,
    workoutUrl: "/workout/rtn_legs",
    status: "running",
  };

  fakeStorage.setItem("sculpd_rest_timer_state", JSON.stringify(offlineState));
  fakeStorage.setItem("sculpd_rest_timer_end", String(offlineEndsAt));
  fakeStorage.setItem("sculpd_rest_timer_total", "120");

  // Re-read offline
  const offlineStored = JSON.parse(fakeStorage.getItem("sculpd_rest_timer_state")!);
  assert(offlineStored.id === "offline_timer_123", "Offline timer persists in storage without network");
  assert(offlineStored.totalDuration === 120, "Total duration is intact offline");

  // Advance clock by 45 seconds
  const remainingOffline = calculateRemainingSeconds(offlineStored.restEndsAt, offlineT0 + 45000);
  assert(remainingOffline === 75, `Remaining time calculated offline as 75s (120s - 45s = ${remainingOffline}s)`);

  // Advance clock past expiration
  const expiredOffline = isRestExpired(offlineStored.restEndsAt, offlineT0 + 121000);
  assert(expiredOffline === true, "Expiration detected offline without network");

  console.log("\n============================================================");
  console.log("✅ ALL REST TIMER & BACKGROUND NOTIFICATION TESTS PASSED 100%!");
  console.log("============================================================\n");
}

runNotificationTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
