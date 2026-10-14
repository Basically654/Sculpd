// lib/notifications/web-push-server.ts
import webpush from "web-push";
import { PushSubscriptionRecord } from "@/types/models";
import { getPushSubscriptionsCollection } from "@/lib/mongodb";

export interface RestPushPayload {
  timerId: string;
  title: string;
  body: string;
  url: string;
}

/**
 * Generates a dual-compatible payload:
 * - Standard Web Push JSON (iOS 17 baseline & Android/Chrome)
 * - Declarative Web Push envelope (iOS 18.4+ enhancement)
 */
export function formatPushPayload(data: RestPushPayload): string {
  return JSON.stringify({
    // 1. Standard Web Push fields (iOS 17 baseline)
    title: data.title,
    body: data.body,
    url: data.url,
    timerId: data.timerId,

    // 2. Declarative Web Push fields (iOS 18.4+ enhancement)
    web_push: 8030,
    notification: {
      title: data.title,
      body: data.body,
      navigate: data.url,
      tag: `sculpd-rest-${data.timerId}`,
      silent: false,
    },
  });
}

let vapidConfigured = false;

export function ensureVapidConfig(): boolean {
  if (vapidConfigured) return true;

  const rawPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const rawPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const rawSubject = process.env.VAPID_SUBJECT || "mailto:support@sculpd.app";

  if (!rawPublicKey || !rawPrivateKey) {
    return false;
  }

  const publicKey = rawPublicKey.trim();
  const privateKey = rawPrivateKey.trim();
  let subject = rawSubject.trim();

  // RFC 8292: subject must be a mailto: or https: URL
  if (!subject.startsWith("mailto:") && !subject.startsWith("https://")) {
    subject = `mailto:${subject}`;
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    vapidConfigured = true;
    return true;
  } catch (err: any) {
    console.warn("VAPID initialization error:", err?.message || err);
    return false;
  }
}

/**
 * Safely extracts host from endpoint URL for safe diagnostic logging without revealing token.
 */
function getEndpointHost(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    return url.hostname;
  } catch {
    return "unknown-push-service";
  }
}

/**
 * Sends a high-urgency Web Push notification to a specific push subscription.
 * Handles APNs/browser 410 Gone / 404 Not Found by pruning expired subscriptions.
 */
export async function sendPushToSubscription(
  subscription: PushSubscriptionRecord,
  payload: RestPushPayload
): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  const ready = ensureVapidConfig();
  if (!ready) {
    return {
      success: false,
      error: "VAPID keys not configured in environment.",
    };
  }

  const pushSubscription = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
  };

  const payloadString = formatPushPayload(payload);
  const targetHost = getEndpointHost(subscription.endpoint);

  try {
    const result = await webpush.sendNotification(
      pushSubscription,
      payloadString,
      {
        TTL: 120, // 2 minutes: rest notification shouldn't linger for hours if delayed
        urgency: "high", // Critical for immediate delivery on locked iOS devices
      }
    );

    console.log(
      `[WebPush] SUCCESS: Delivered push to ${targetHost} for timer ${payload.timerId} (status ${result.statusCode})`
    );
    return { success: true, statusCode: result.statusCode };
  } catch (err: any) {
    const statusCode = err?.statusCode || err?.status;
    const errorDetail = err?.body || err?.message || "Web Push delivery failed";

    console.warn(
      `[WebPush] FAILED: Push delivery to ${targetHost} failed with status ${statusCode || "unknown"}: ${errorDetail}`
    );

    // HTTP 410 (Gone) or 404 (Not Found): subscription was unsubscribed or revoked
    if (statusCode === 410 || statusCode === 404) {
      try {
        const col = await getPushSubscriptionsCollection();
        await col.deleteOne({ id: subscription.id });
        console.log(`[WebPush] Pruned inactive push subscription (${statusCode}) from DB`);
      } catch (pruneErr) {
        console.warn("Failed to prune stale push subscription:", pruneErr);
      }
    }

    return {
      success: false,
      statusCode,
      error: typeof errorDetail === "string" ? errorDetail : JSON.stringify(errorDetail),
    };
  }
}
