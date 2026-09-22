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

function ensureVapidConfig(): boolean {
  if (vapidConfigured) return true;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:support@sculpd.app";

  if (!publicKey || !privateKey) {
    return false;
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    vapidConfigured = true;
    return true;
  } catch (err) {
    console.warn("VAPID initialization error:", err);
    return false;
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

  try {
    const result = await webpush.sendNotification(
      pushSubscription,
      payloadString,
      {
        TTL: 120, // 2 minutes: rest notification shouldn't linger for hours if delayed
        urgency: "high", // Critical for immediate delivery on locked iOS devices
      }
    );

    return { success: true, statusCode: result.statusCode };
  } catch (err: any) {
    const statusCode = err?.statusCode || err?.status;

    // HTTP 410 (Gone) or 404 (Not Found): subscription was unsubscribed or revoked
    if (statusCode === 410 || statusCode === 404) {
      try {
        const col = await getPushSubscriptionsCollection();
        await col.deleteOne({ id: subscription.id });
        console.log(`Pruned inactive push subscription ${subscription.id} (${statusCode})`);
      } catch (pruneErr) {
        console.warn("Failed to prune stale push subscription:", pruneErr);
      }
    }

    return {
      success: false,
      statusCode,
      error: err?.message || "Web Push delivery failed",
    };
  }
}
