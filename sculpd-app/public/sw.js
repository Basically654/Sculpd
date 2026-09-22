// public/sw.js
// Sculp'd Gym-Floor PWA Service Worker
const CACHE_NAME = "sculpd-v2-cache";
let restTimerTimeoutId = null;
let currentTimerId = null;
const cancelledTimerIds = new Set();

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Listen for rest timer scheduling messages from the client application
self.addEventListener("message", (event) => {
  if (!event.data || typeof event.data !== "object") return;

  const { type, id, endTime, restEndsAt, exerciseName, nextSetNumber, workoutUrl } = event.data;
  const targetEndMs = restEndsAt || endTime;
  const timerId = id || `rest_${targetEndMs}`;

  if (type === "SCHEDULE_REST_TIMER") {
    // Clear any existing timer timeout
    if (restTimerTimeoutId) {
      clearTimeout(restTimerTimeoutId);
      restTimerTimeoutId = null;
    }

    currentTimerId = timerId;
    cancelledTimerIds.delete(timerId);

    const now = Date.now();
    const delay = Math.max(0, targetEndMs - now);

    const title = exerciseName
      ? `Rest complete — ${exerciseName}`
      : "Rest complete! ⏱️";

    const body = nextSetNumber
      ? `Ready for Set ${nextSetNumber}`
      : "Your rest window is complete. Ready for next set.";

    const notifTag = `sculpd-rest-${timerId}`;
    const notifData = {
      url: workoutUrl || "/",
      timerId,
      restEndsAt: targetEndMs,
      exerciseName,
      nextSetNumber,
    };

    // 1. Primary Mechanism: Web Platform Notification Triggers API (Chromium / Android PWA)
    // When supported, this schedules an OS-level alarm that fires even if the Service Worker is suspended.
    if ("showTrigger" in Notification.prototype && typeof TimestampTrigger !== "undefined") {
      try {
        const schedulePromise = self.registration.showNotification(title, {
          tag: notifTag,
          body,
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          renotify: true,
          requireInteraction: true,
          vibrate: [300, 100, 300, 100, 300],
          showTrigger: new TimestampTrigger(targetEndMs),
          data: notifData,
        });

        if (event.waitUntil) {
          event.waitUntil(schedulePromise);
        }
        return;
      } catch (triggerErr) {
        console.warn("TimestampTrigger scheduling failed, falling back to SW timer:", triggerErr);
      }
    }

    // 2. Secondary Mechanism: Service Worker Keepalive Timer
    // For browsers without Notification Triggers, wrap the timeout in an extendable promise
    // so event.waitUntil prevents the worker from idling out prematurely where possible.
    const timerPromise = new Promise((resolve) => {
      restTimerTimeoutId = setTimeout(async () => {
        restTimerTimeoutId = null;

        // Verify timer wasn't cancelled while waiting
        if (cancelledTimerIds.has(timerId)) {
          resolve();
          return;
        }

        try {
          await self.registration.showNotification(title, {
            tag: notifTag,
            body,
            icon: "/icon-192.png",
            badge: "/icon-192.png",
            renotify: true,
            requireInteraction: true,
            vibrate: [300, 100, 300, 100, 300],
            data: notifData,
          });
        } catch (err) {
          console.error("SW failed to display rest notification:", err);
        }
        resolve();
      }, delay);
    });

    if (event.waitUntil) {
      event.waitUntil(timerPromise);
    }
  }

  if (type === "CANCEL_REST_TIMER") {
    if (restTimerTimeoutId) {
      clearTimeout(restTimerTimeoutId);
      restTimerTimeoutId = null;
    }

    if (timerId) {
      cancelledTimerIds.add(timerId);
    }
    if (currentTimerId) {
      cancelledTimerIds.add(currentTimerId);
    }

    // Dismiss any active or scheduled notifications for this timer
    const dismissPromise = self.registration
      .getNotifications()
      .then((notifications) => {
        for (const notif of notifications) {
          if (!timerId || notif.tag === `sculpd-rest-${timerId}` || notif.tag === "sculpd-rest-notification") {
            notif.close();
          }
        }
      })
      .catch(() => {});

    if (event.waitUntil) {
      event.waitUntil(dismissPromise);
    }
  }
});

// Bring app to focus and navigate to active workout when user clicks notification
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // If an existing Sculp'd window/tab is open, focus it and navigate to active workout
        for (const client of clientList) {
          if ("focus" in client) {
            return client.focus().then(() => {
              if ("navigate" in client && targetUrl !== "/" && !client.url.includes(targetUrl)) {
                return client.navigate(targetUrl);
              }
            });
          }
        }
        // If no open client exists, open a new window directly to the workout
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});
