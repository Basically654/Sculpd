// lib/notifications/scheduler.ts
import { Client } from "@upstash/qstash";

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
