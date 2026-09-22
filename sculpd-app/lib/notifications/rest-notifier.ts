// lib/notifications/rest-notifier.ts
/**
 * PWA Service Worker Rest Notification Client & Audio Chime System
 *
 * Ensures rest notifications trigger even if the user leaves the application
 * (locks screen or switches to music / social apps).
 */

let swRegistration: ServiceWorkerRegistration | null = null;
let fallbackTimeoutId: NodeJS.Timeout | number | null = null;

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

export interface RestTimerPayload {
  id: string;
  restStartedAt: number;
  restEndsAt: number;
  totalDuration: number;
  exerciseName?: string;
  nextSetNumber?: number;
  workoutUrl?: string;
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
 * Dispatches to Service Worker so it fires even if the app tab is paused.
 */
export async function scheduleRestNotification(
  payload: RestTimerPayload | number,
  legacyExerciseName?: string,
  legacyNextSetNumber?: number
): Promise<void> {
  if (typeof window === "undefined") return;

  // Support both new object payload and legacy argument list
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

  // Clear any existing foreground fallback timeout
  if (fallbackTimeoutId) {
    clearTimeout(fallbackTimeoutId as any);
    fallbackTimeoutId = null;
  }

  const delayMs = Math.max(0, fullPayload.restEndsAt - Date.now());

  // 1. Post to active Service Worker for background scheduling
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
      console.warn("SW message dispatch error:", err);
    }
  }

  // 2. Schedule foreground fallback chime
  fallbackTimeoutId = setTimeout(() => {
    playRestCompleteChime();
    fallbackTimeoutId = null;
  }, delayMs);
}

/**
 * Cancels any scheduled rest notification.
 */
export async function cancelRestNotification(timerId?: string): Promise<void> {
  if (typeof window === "undefined") return;

  if (fallbackTimeoutId) {
    clearTimeout(fallbackTimeoutId as any);
    fallbackTimeoutId = null;
  }

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
    // Audio playback blocked by browser autoplay policy
    console.warn("Chime audio playback prevented:", err);
  }
}
