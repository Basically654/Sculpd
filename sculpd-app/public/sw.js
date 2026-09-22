// public/sw.js
// Sculp'd Gym-Floor PWA Service Worker
const CACHE_NAME = "sculpd-v2-cache";
let restTimerTimeoutId = null;

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Listen for rest timer scheduling messages from the client application
self.addEventListener("message", (event) => {
  if (!event.data || typeof event.data !== "object") return;

  const { type, endTime, exerciseName, nextSetNumber } = event.data;

  if (type === "SCHEDULE_REST_TIMER") {
    // Clear any existing timer
    if (restTimerTimeoutId) {
      clearTimeout(restTimerTimeoutId);
      restTimerTimeoutId = null;
    }

    const now = Date.now();
    const delay = Math.max(0, endTime - now);

    restTimerTimeoutId = setTimeout(async () => {
      restTimerTimeoutId = null;

      try {
        await self.registration.showNotification("Rest Complete! ⏱️", {
          body: exerciseName
            ? `Ready for Set ${nextSetNumber || ""} — ${exerciseName}`
            : "Your rest window is complete. Ready for next set.",
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          tag: "sculpd-rest-notification",
          renotify: true,
          requireInteraction: true,
          vibrate: [300, 100, 300, 100, 300],
          data: {
            url: "/",
          },
        });
      } catch (err) {
        console.error("SW failed to display rest notification:", err);
      }
    }, delay);
  }

  if (type === "CANCEL_REST_TIMER") {
    if (restTimerTimeoutId) {
      clearTimeout(restTimerTimeoutId);
      restTimerTimeoutId = null;
    }
  }
});

// Bring app to focus when user clicks notification
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(event.notification.data?.url || "/");
        }
      })
  );
});
