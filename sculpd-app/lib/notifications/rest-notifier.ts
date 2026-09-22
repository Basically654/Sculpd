// lib/notifications/rest-notifier.ts
/**
 * PWA Web Push Rest Notification Client & Gym Audio Chime System
 *
 * Provides hybrid dual-layer notification:
 * 1. Offline-first local countdown & synthesized Web Audio chime.
 * 2. External Web Push via Apple APNs / serverless scheduler when phone is locked.
 */

let swRegistration: ServiceWorkerRegistration | null = null;
let fallbackTimeoutId: NodeJS.Timeout | number | null = null;

/**
 * Converts a base64url string to a Uint8Array for VAPID applicationServerKey.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Checks if the browser environment supports Web Push.
 */
export function isPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Checks if the app is currently running in standalone PWA mode (e.g. added to iOS Home Screen).
 */
export function isStandalonePWA(): boolean {
  if (typeof window === "undefined") return false;
  const isStandaloneMedia = window.matchMedia("(display-mode: standalone)").matches;
  const isNavigatorStandalone = Boolean((navigator as any).standalone);
  return isStandaloneMedia || isNavigatorStandalone;
}

/**
 * Initializes and registers the service worker. Safe to call on client startup.
 */
export async function initServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }

  try {
    swRegistration = await navigator.serviceWorker.register("/sw.js");
    return swRegistration;
  } catch (err) {
    console.warn("Service Worker registration notice:", err);
    return null;
  }
}

/**
 * Prompts user for notification permission if currently unprompted ("default").
 * Must be triggered by a direct user gesture on iOS.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "denied";
  }

  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission;
  }

  try {
    return await Notification.requestPermission();
  } catch (err) {
    console.warn("Notification permission request error:", err);
    return "denied";
  }
}

/**
 * Retrieves the current push subscription from the service worker if active.
 */
export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;

  try {
    const reg = swRegistration || (await navigator.serviceWorker.ready);
    if (!reg?.pushManager) return null;
    return await reg.pushManager.getSubscription();
  } catch (err) {
    console.warn("Failed to get current push subscription:", err);
    return null;
  }
}

/**
 * Subscribes the current device to Web Push and registers it with the Sculp'd backend.
 */
export async function subscribeUserToPush(
  sessionToken: string
): Promise<{ success: boolean; subscription?: PushSubscription; error?: string }> {
  if (!isPushSupported()) {
    return { success: false, error: "Web Push is not supported on this browser/platform." };
  }

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    return { success: false, error: "VAPID public key not configured on client." };
  }

  try {
    const perm = await requestNotificationPermission();
    if (perm !== "granted") {
      return { success: false, error: "Notification permission not granted." };
    }

    const reg = swRegistration || (await navigator.serviceWorker.ready);
    if (!reg) {
      return { success: false, error: "Service Worker not ready." };
    }

    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as any,
      });
    }

    // Persist subscription with authenticated user profile
    const subJson = subscription.toJSON();
    const res = await fetch("/api/notifications/subscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        keys: subJson.keys,
        userAgent: navigator.userAgent,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || "Failed to register subscription on server");
    }

    return { success: true, subscription };
  } catch (err: any) {
    console.warn("Push subscription failed:", err);
    return { success: false, error: err?.message || "Push subscription error." };
  }
}

/**
 * Unsubscribes the current device from Web Push and removes it from the backend.
 */
export async function unsubscribeUserFromPush(
  sessionToken: string
): Promise<boolean> {
  if (!isPushSupported()) return false;

  try {
    const sub = await getCurrentPushSubscription();
    if (!sub) return true;

    // Notify backend
    await fetch("/api/notifications/unsubscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => {});

    // Unsubscribe locally
    return await sub.unsubscribe();
  } catch (err) {
    console.warn("Unsubscribe error:", err);
    return false;
  }
}

export interface RestTimerPayload {
  id: string;
  restStartedAt: number;
  restEndsAt: number;
  totalDuration: number;
  exerciseName?: string;
  nextSetNumber?: number;
  workoutUrl?: string;
  workoutSessionId?: string;
}

export interface RestTimerState extends RestTimerPayload {
  status: "running" | "completed" | "cancelled";
  notificationSent?: boolean;
}

/**
 * Pure calculation helpers for absolute-timestamp time keeping.
 */
export function calculateRemainingSeconds(
  endsAtMs: number,
  currentMs: number = Date.now()
): number {
  const diffMs = endsAtMs - currentMs;
  return Math.max(0, Math.ceil(diffMs / 1000));
}

export function isRestExpired(
  endsAtMs: number,
  currentMs: number = Date.now()
): boolean {
  return currentMs >= endsAtMs;
}

export function buildNotificationContent(
  exerciseName?: string,
  nextSetNumber?: number
): { title: string; body: string } {
  const title = exerciseName
    ? `Rest complete — ${exerciseName}`
    : "Rest complete! ⏱️";

  const body = nextSetNumber
    ? `Ready for Set ${nextSetNumber}`
    : "Your rest window is complete. Ready for next set.";

  return { title, body };
}

/**
 * Schedules a background rest completion notification.
 * Dispatches to both the local Service Worker (for in-memory tracking)
 * and the serverless scheduler (for iOS Web Push when locked).
 * Never blocks or fails the workout if offline.
 */
export async function scheduleRestNotification(
  payload: RestTimerPayload | number,
  legacyExerciseName?: string,
  legacyNextSetNumber?: number,
  sessionToken?: string | null
): Promise<void> {
  if (typeof window === "undefined") return;

  const fullPayload: RestTimerPayload =
    typeof payload === "number"
      ? {
          id: `rest_${payload}`,
          restStartedAt: Date.now(),
          restEndsAt: payload,
          totalDuration: Math.max(1, Math.round((payload - Date.now()) / 1000)),
          exerciseName: legacyExerciseName,
          nextSetNumber: legacyNextSetNumber,
          workoutUrl: typeof window !== "undefined" ? window.location.pathname : "/",
        }
      : payload;

  // 1. Clear any existing foreground fallback timeout
  if (fallbackTimeoutId) {
    clearTimeout(fallbackTimeoutId as any);
    fallbackTimeoutId = null;
  }

  const delayMs = Math.max(0, fullPayload.restEndsAt - Date.now());

  // 2. Schedule foreground fallback chime
  fallbackTimeoutId = setTimeout(() => {
    playRestCompleteChime();
    fallbackTimeoutId = null;
  }, delayMs);

  // 3. Post to local Service Worker (immediate client message)
  if ("serviceWorker" in navigator) {
    try {
      const reg = swRegistration || (await navigator.serviceWorker.ready);
      if (reg?.active) {
        reg.active.postMessage({
          type: "SCHEDULE_REST_TIMER",
          id: fullPayload.id,
          restStartedAt: fullPayload.restStartedAt,
          restEndsAt: fullPayload.restEndsAt,
          endTime: fullPayload.restEndsAt,
          exerciseName: fullPayload.exerciseName,
          nextSetNumber: fullPayload.nextSetNumber,
          workoutUrl: fullPayload.workoutUrl,
        });
      }
    } catch (err) {
      console.warn("Local SW message dispatch notice:", err);
    }
  }

  // 4. Asynchronously schedule Web Push via server scheduler
  // Completely safe: if offline, sessionToken is missing, or network fails, workout is unaffected
  if (sessionToken && navigator.onLine) {
    fetch("/api/notifications/schedule", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        timerId: fullPayload.id,
        scheduledFor: fullPayload.restEndsAt,
        totalDuration: fullPayload.totalDuration,
        exerciseName: fullPayload.exerciseName,
        nextSetNumber: fullPayload.nextSetNumber,
        workoutUrl: fullPayload.workoutUrl,
        workoutSessionId: fullPayload.workoutSessionId,
      }),
    }).catch((netErr) => {
      // Offline or network error: log non-blocking warning
      console.warn("Background push schedule notice (offline/skipped):", netErr);
    });
  }
}

/**
 * Cancels any scheduled rest notification locally and on the server scheduler.
 */
export async function cancelRestNotification(
  timerId?: string,
  sessionToken?: string | null
): Promise<void> {
  if (typeof window === "undefined") return;

  // 1. Clear foreground chime
  if (fallbackTimeoutId) {
    clearTimeout(fallbackTimeoutId as any);
    fallbackTimeoutId = null;
  }

  // 2. Inform local Service Worker
  if ("serviceWorker" in navigator) {
    try {
      const reg = swRegistration || (await navigator.serviceWorker.ready);
      if (reg?.active) {
        reg.active.postMessage({
          type: "CANCEL_REST_TIMER",
          id: timerId,
        });
      }
    } catch {
      // ignore
    }
  }

  // 3. Inform server scheduler
  if (sessionToken && navigator.onLine) {
    fetch("/api/notifications/cancel", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({ timerId }),
    }).catch(() => {
      // ignore network errors on cancel
    });
  }
}

/**
 * Plays a pleasant gym chime and triggers device vibration on rest completion.
 * Generates tones natively via Web Audio API without requiring external MP3 files.
 */
export function playRestCompleteChime(): void {
  if (typeof window === "undefined") return;

  // 1. Device Haptic Vibration
  if ("vibrate" in navigator) {
    try {
      navigator.vibrate([200, 100, 200, 100, 300]);
    } catch {
      // Haptics not allowed or denied
    }
  }

  // 2. Synthesized Audio Chime (D5 -> A5 ascending bell)
  try {
    const AudioContextClass =
      window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const playTone = (freq: number, startOffset: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + startOffset);

      gain.gain.setValueAtTime(0, ctx.currentTime + startOffset);
      gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + startOffset + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startOffset + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + startOffset);
      osc.stop(ctx.currentTime + startOffset + duration);
    };

    // Ascending chime
    playTone(587.33, 0, 0.4); // D5
    playTone(880.0, 0.2, 0.6); // A5
  } catch (err) {
    console.warn("Chime audio playback prevented:", err);
  }
}
