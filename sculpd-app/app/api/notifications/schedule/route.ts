// app/api/notifications/schedule/route.ts
import { NextResponse } from "next/server";
import { extractVerifiedUserId } from "@/lib/auth/session-token";
import {
  ensureMongoIndexes,
  getRestNotificationsCollection,
} from "@/lib/mongodb";
import {
  scheduleDelayedPushWebhook,
  cancelDelayedPushWebhook,
} from "@/lib/notifications/scheduler";

export const dynamic = "force-dynamic";

/**
 * POST /api/notifications/schedule
 * Schedules a rest notification to be delivered when the workout timer expires.
 */
export async function POST(request: Request) {
  try {
    const verifiedUserId = await extractVerifiedUserId(request);
    if (!verifiedUserId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Missing or invalid session token." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      timerId,
      scheduledFor,
      exerciseName,
      nextSetNumber,
      workoutUrl,
      workoutSessionId,
    } = body;

    if (!timerId || typeof scheduledFor !== "number") {
      return NextResponse.json(
        { success: false, error: "Bad Request: timerId and scheduledFor are required." },
        { status: 400 }
      );
    }

    await ensureMongoIndexes();
    const col = await getRestNotificationsCollection();
    const now = new Date().toISOString();

    // 1. Cancel and supersede any existing scheduled rest timers for this user
    const existingActive = await col
      .find({ userId: verifiedUserId, status: "scheduled" })
      .toArray();

    for (const activeDoc of existingActive) {
      if (activeDoc.qstashMessageId) {
        await cancelDelayedPushWebhook(activeDoc.qstashMessageId);
      }
      await col.updateOne(
        { id: activeDoc.id },
        { $set: { status: "superseded", updatedAt: now } }
      );
    }

    // 2. Determine absolute callback URL for QStash webhook
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      request.headers.get("origin") ||
      `https://${request.headers.get("host") || "sculpd.app"}`;

    const callbackUrl = `${appUrl.replace(/\/$/, "")}/api/notifications/dispatch`;

    // 3. Schedule delayed delivery in QStash
    const scheduleResult = await scheduleDelayedPushWebhook({
      timerId,
      userId: verifiedUserId,
      targetEpochMs: scheduledFor,
      callbackUrl,
    });

    // 4. Persist rest notification record in MongoDB
    await col.updateOne(
      { id: timerId },
      {
        $set: {
          userId: verifiedUserId,
          workoutSessionId,
          exerciseName,
          nextSetNumber,
          workoutUrl: workoutUrl || "/",
          scheduledFor,
          qstashMessageId: scheduleResult.messageId,
          status: "scheduled",
          updatedAt: now,
        },
        $setOnInsert: {
          id: timerId,
          createdAt: now,
        },
      },
      { upsert: true }
    );

    return NextResponse.json({
      success: true,
      timerId,
      scheduled: scheduleResult.scheduled,
      messageId: scheduleResult.messageId,
    });
  } catch (error: any) {
    console.error("Schedule notification error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Internal server error." },
      { status: 500 }
    );
  }
}
