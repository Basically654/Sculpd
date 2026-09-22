// public/sw.js
// Sculp'd Gym-Floor PWA Service Worker (Web Push & Rest Timer)

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * 1. Web Push Event Handler (iOS 17+ Required Baseline)
 *
 * When the server sends Web Push via Apple APNs / Web Push protocol,
 * iOS wakes this Service Worker in the background and delivers the push event.
 * We extract notification content from the payload and display it immediately.
 */
self.addEventListener("push", (event) => {
  let title = "Rest complete! ⏱️";
  let body = "Your rest window is complete. Ready for next set.";
  let targetUrl = "/";
  let tag = "sculpd-rest-timer";
  let renotify = true;

  if (event.data) {
    try {
      const payload = event.data.json();

      // Support Declarative Web Push format (iOS 18.4+) or standard flat JSON (iOS 17 baseline)
      const notif = payload.notification || payload;

      if (notif.title) title = notif.title;
      if (notif.body) body = notif.body;
      if (notif.navigate) targetUrl = notif.navigate;
      else if (notif.url) targetUrl = notif.url;
      else if (notif.data?.url) targetUrl = notif.data.url;

      if (notif.tag) {
        tag = notif.tag;
      } else if (payload.timerId) {
        tag = `sculpd-rest-${payload.timerId}`;
      }
    } catch {
      const text = event.data.text();
      if (text) body = text;
    }
  }

  const options = {
    body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag,
    renotify,
    requireInteraction: true,
    vibrate: [300, 100, 300, 100, 300],
    data: {
      url: targetUrl,
      timestamp: Date.now(),
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/**
 * 2. Notification Click Handler
 *
 * Brings the active workout window into focus, or opens the app directly
 * to the active workout screen when the user taps the Lock Screen notification.
 */
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
              if (
                "navigate" in client &&
                targetUrl !== "/" &&
                !client.url.includes(targetUrl)
              ) {
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

/**
 * 3. Client Message Handler
 *
 * Allows foreground application to dismiss active notifications when the user
 * taps 'Ready Now' or skips the rest period in the app UI.
 */
self.addEventListener("message", (event) => {
  if (!event.data || typeof event.data !== "object") return;

  const { type, id } = event.data;

  if (type === "CANCEL_REST_TIMER") {
    const timerTag = id ? `sculpd-rest-${id}` : null;

    const dismissPromise = self.registration
      .getNotifications()
      .then((notifications) => {
        for (const notif of notifications) {
          if (
            !timerTag ||
            notif.tag === timerTag ||
            notif.tag === "sculpd-rest-timer" ||
            notif.tag === "sculpd-rest-notification"
          ) {
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
