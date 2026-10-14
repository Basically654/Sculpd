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
      console.warn(`[Dispatch] Timer ${timerId} not found in MongoDB`);
      return { success: false, deliveredCount: 0, reason: "Timer record not found" };
    }

    if (notif.status !== "scheduled") {
      console.log(`[Dispatch] Timer ${timerId} status is already '${notif.status}', skipping dispatch`);
      return { success: true, deliveredCount: 0, reason: `Timer status is ${notif.status}` };
    }

    // Two-layer race condition guard: If timer was extended into the future by >3 seconds, do not fire yet
    if (notif.scheduledFor > Date.now() + 3000) {
      console.log(`[Dispatch] Timer ${timerId} was extended to ${new Date(notif.scheduledFor).toISOString()}, skipping early trigger`);
      return { success: true, deliveredCount: 0, reason: "Timer was extended" };
    }

    const subsCol = await getPushSubscriptionsCollection();
    const targetUserId = notif.userId || userId;
    const subscriptions = await subsCol.find({ userId: targetUserId }).toArray();

    if (subscriptions.length === 0) {
      console.warn(
        `[Dispatch] FAILED: No push subscriptions found for user '${targetUserId}' (timer ${timerId})`
      );
      await col.updateOne(
        { id: timerId },
        { $set: { status: "failed_no_subscription", updatedAt: new Date().toISOString() } }
      );
      return {
        success: false,
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
    const deliveryErrors: string[] = [];

    for (const sub of subscriptions) {
      const res = await sendPushToSubscription(sub, pushPayload);
      if (res.success) {
        deliveredCount++;
      } else if (res.error) {
        deliveryErrors.push(res.error);
      }
    }

    const newStatus = deliveredCount > 0 ? "dispatched" : "failed";
    await col.updateOne(
      { id: timerId },
      {
        $set: {
          status: newStatus,
          updatedAt: new Date().toISOString(),
        },
      }
    );

    if (deliveredCount > 0) {
      console.log(
        `[Dispatch] SUCCESS: Rest notification delivered to ${deliveredCount}/${subscriptions.length} device(s) for timer ${timerId}`
      );
      return { success: true, deliveredCount };
    } else {
      const failureReason = deliveryErrors.join("; ") || "Web Push delivery failed to all subscriptions";
      console.warn(
        `[Dispatch] FAILED: Push delivery failed for timer ${timerId}: ${failureReason}`
      );
      return { success: false, deliveredCount: 0, reason: failureReason };
    }
  } catch (err: any) {
    console.error(`[Dispatch] FAILED: Exception for timer ${timerId}:`, err);
    return { success: false, deliveredCount: 0, reason: err?.message || "Internal dispatch error" };
  }
}

/**
 * Schedules a rest notification using QStash delayed webhook in production / serverless,
 * with Node.js timer support in local development.
 */
export async function scheduleServerRestTimer(params: {
  timerId: string;
  userId: string;
  targetEpochMs: number;
  callbackUrl?: string;
}): Promise<{ scheduled: boolean; messageId?: string; error?: string }> {
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  const qstashToken = process.env.QSTASH_TOKEN?.trim();

  // Cancel any prior timer in local memory
  cancelServerTimer(params.timerId);

  // In production / serverless, QStash is required because memory timers are frozen upon response completion
  if (qstashToken && params.callbackUrl) {
    const qstashRes = await scheduleDelayedPushWebhook({
      timerId: params.timerId,
      userId: params.userId,
      targetEpochMs: params.targetEpochMs,
      callbackUrl: params.callbackUrl,
    });

    if (qstashRes.scheduled) {
      console.log(
        `[Scheduler] SUCCESS: Scheduled QStash message ${qstashRes.messageId} for timer ${params.timerId}`
      );
      return {
        scheduled: true,
        messageId: qstashRes.messageId,
      };
    }

    console.warn(
      `[Scheduler] FAILED: QStash delayed publish failed for timer ${params.timerId}: ${qstashRes.error}`
    );

    // If running on Vercel and QStash explicitly failed, fail early so user and system know
    if (isServerless) {
      return {
        scheduled: false,
        error: `QStash scheduling failed: ${qstashRes.error}`,
      };
    }
  } else if (isServerless) {
    console.warn(
      `[Scheduler] WARNING: QSTASH_TOKEN is not configured on Vercel serverless! In-memory timers cannot survive function freeze.`
    );
  }

  // Register local in-memory timer for development or fallback
  const timers = getServerTimersMap();
  const delayMs = Math.max(0, params.targetEpochMs - Date.now());

  const timeout = setTimeout(async () => {
    timers.delete(params.timerId);
    try {
      await executeRestNotificationDispatch(params.timerId, params.userId);
    } catch (err) {
      console.warn("[Scheduler] Background push timer execution warning:", err);
    }
  }, delayMs);

  if (typeof timeout.unref === "function") {
    timeout.unref();
  }

  timers.set(params.timerId, timeout);

  return {
    scheduled: true,
    messageId: `server_${params.timerId}`,
  };
}

let qstashClient: Client | null = null;

function getQStashClient(): Client | null {
  const token = process.env.QSTASH_TOKEN?.trim();
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
