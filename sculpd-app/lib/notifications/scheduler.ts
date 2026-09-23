// lib/notifications/scheduler.ts
import { Client } from "@upstash/qstash";
import {
  getRestNotificationsCollection,
  getPushSubscriptionsCollection,
} from "@/lib/mongodb";
import { sendPushToSubscription } from "@/lib/notifications/web-push-server";

declare global {
  // eslint-disable-next-line no-var
  var _serverRestTimers: Map<string, NodeJS.Timeout> | undefined;
}

export function getServerTimersMap(): Map<string, NodeJS.Timeout> {
  if (!global._serverRestTimers) {
    global._serverRestTimers = new Map();
  }
  return global._serverRestTimers;
}

export function cancelServerTimer(timerId: string): void {
  const timers = getServerTimersMap();
  const existing = timers.get(timerId);
  if (existing) {
    clearTimeout(existing);
    timers.delete(timerId);
  }
}

/**
 * Dispatches the Web Push notification directly to the user's devices.
 * Verified with MongoDB state to prevent duplicate or cancelled triggers.
 */
export async function executeRestNotificationDispatch(
  timerId: string,
  userId: string
): Promise<{ success: boolean; deliveredCount: number; reason?: string }> {
  try {
    const col = await getRestNotificationsCollection();
    const notif = await col.findOne({ id: timerId });

    if (!notif) {
      return { success: true, deliveredCount: 0, reason: "Timer record not found" };
    }

    if (notif.status !== "scheduled") {
      return { success: true, deliveredCount: 0, reason: `Timer status is ${notif.status}` };
    }

    // Two-layer race condition guard: If timer was extended into the future by >3 seconds, do not fire yet
    if (notif.scheduledFor > Date.now() + 3000) {
      return { success: true, deliveredCount: 0, reason: "Timer was extended" };
    }

    const subsCol = await getPushSubscriptionsCollection();
    const subscriptions = await subsCol.find({ userId }).toArray();

    if (subscriptions.length === 0) {
      await col.updateOne(
        { id: timerId },
        { $set: { status: "dispatched", updatedAt: new Date().toISOString() } }
      );
      return {
        success: true,
        deliveredCount: 0,
        reason: "No push subscriptions registered for user",
      };
    }

    const title = notif.exerciseName
      ? `Rest complete — ${notif.exerciseName}`
      : "Rest complete! ⏱️";

    const body = notif.nextSetNumber
      ? `Ready for Set ${notif.nextSetNumber}`
      : "Your rest window is complete. Ready for next set.";

    const pushPayload = {
      timerId,
      title,
      body,
      url: notif.workoutUrl || "/",
    };

    let deliveredCount = 0;
    for (const sub of subscriptions) {
      const res = await sendPushToSubscription(sub, pushPayload);
      if (res.success) {
        deliveredCount++;
      }
    }

    await col.updateOne(
      { id: timerId },
      {
        $set: {
          status: "dispatched",
          updatedAt: new Date().toISOString(),
        },
      }
    );

    return { success: true, deliveredCount };
  } catch (err: any) {
    console.error(`Rest notification dispatch error for timer ${timerId}:`, err);
    return { success: false, deliveredCount: 0, reason: err?.message };
  }
}

/**
 * Schedules a rest notification using the internal Node.js server timer
 * with optional QStash fallback when QSTASH_TOKEN is configured.
 */
export async function scheduleServerRestTimer(params: {
  timerId: string;
  userId: string;
  targetEpochMs: number;
  callbackUrl?: string;
}): Promise<{ scheduled: boolean; messageId?: string; error?: string }> {
  const timers = getServerTimersMap();

  // Cancel any prior timer for this timerId
  cancelServerTimer(params.timerId);

  const delayMs = Math.max(0, params.targetEpochMs - Date.now());

  const timeout = setTimeout(async () => {
    timers.delete(params.timerId);
    try {
      await executeRestNotificationDispatch(params.timerId, params.userId);
    } catch (err) {
      console.warn("Background push timer execution warning:", err);
    }
  }, delayMs);

  if (typeof timeout.unref === "function") {
    timeout.unref();
  }

  timers.set(params.timerId, timeout);

  // If QStash token is configured, schedule with QStash as secondary redundant webhook
  let qstashMessageId: string | undefined;
  if (process.env.QSTASH_TOKEN && params.callbackUrl) {
    const qstashRes = await scheduleDelayedPushWebhook({
      timerId: params.timerId,
      userId: params.userId,
      targetEpochMs: params.targetEpochMs,
      callbackUrl: params.callbackUrl,
    });
    if (qstashRes.scheduled) {
      qstashMessageId = qstashRes.messageId;
    }
  }

  return {
    scheduled: true,
    messageId: qstashMessageId || `server_${params.timerId}`,
  };
}

let qstashClient: Client | null = null;

function getQStashClient(): Client | null {
  const token = process.env.QSTASH_TOKEN;
  if (!token) return null;

  if (!qstashClient) {
    qstashClient = new Client({ token });
  }
  return qstashClient;
}

export interface SchedulePushParams {
  timerId: string;
  userId: string;
  targetEpochMs: number;
  callbackUrl: string;
}

/**
 * Schedules a delayed webhook to be dispatched at targetEpochMs.
 * Uses QStash `notBefore` timestamp.
 */
export async function scheduleDelayedPushWebhook(
  params: SchedulePushParams
): Promise<{ scheduled: boolean; messageId?: string; error?: string }> {
  const client = getQStashClient();
  if (!client) {
    return {
      scheduled: false,
      error: "QSTASH_TOKEN not configured. Background Web Push scheduling is disabled.",
    };
  }

  const notBeforeSeconds = Math.max(
    Math.floor(Date.now() / 1000),
    Math.floor(params.targetEpochMs / 1000)
  );

  try {
    const res = await client.publishJSON({
      url: params.callbackUrl,
      body: {
        timerId: params.timerId,
        userId: params.userId,
      },
      notBefore: notBeforeSeconds,
      retries: 2,
    });

    return {
      scheduled: true,
      messageId: res.messageId,
    };
  } catch (err: any) {
    console.warn("QStash delayed publish error:", err);
    return {
      scheduled: false,
      error: err?.message || "Failed to schedule delayed message",
    };
  }
}

/**
 * Cancels a previously scheduled delayed webhook in QStash.
 */
export async function cancelDelayedPushWebhook(
  messageId: string
): Promise<boolean> {
  const client = getQStashClient();
  if (!client || !messageId) return false;

  try {
    await client.messages.delete(messageId);
    return true;
  } catch (err) {
    // If already in flight or not found, catch gracefully
    console.warn("QStash message cancellation note:", err);
    return false;
  }
}
