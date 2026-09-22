// app/api/notifications/dispatch/route.ts
import { NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import {
  getRestNotificationsCollection,
  getPushSubscriptionsCollection,
} from "@/lib/mongodb";
import { sendPushToSubscription } from "@/lib/notifications/web-push-server";

export const dynamic = "force-dynamic";

/**
 * POST /api/notifications/dispatch
 * Webhook triggered by QStash when a rest timer expires.
 * Validates the signature, verifies the timer state in MongoDB, and dispatches Web Push.
 */
export async function POST(request: Request) {
  try {
    const rawBody = await request.text();

    // 1. Verify QStash signature if signing keys are configured
    const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
    if (currentSigningKey) {
      const signature = request.headers.get("upstash-signature");
      if (!signature) {
        return NextResponse.json(
          { success: false, error: "Missing Upstash signature" },
          { status: 401 }
        );
      }

      const receiver = new Receiver({
        currentSigningKey,
        nextSigningKey:
          process.env.QSTASH_NEXT_SIGNING_KEY || currentSigningKey,
      });

      try {
        await receiver.verify({ signature, body: rawBody });
      } catch (sigErr) {
        console.warn("Invalid QStash signature rejected:", sigErr);
        return NextResponse.json(
          { success: false, error: "Invalid signature" },
          { status: 401 }
        );
      }
    }

    // 2. Parse payload
    let data: { timerId?: string; userId?: string } = {};
    try {
      data = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const { timerId, userId } = data;
    if (!timerId || !userId) {
      return NextResponse.json(
        { success: false, error: "timerId and userId required" },
        { status: 400 }
      );
    }

    // 3. Database Guard: Verify timer is still scheduled and not cancelled or extended
    const restCol = await getRestNotificationsCollection();
    const notif = await restCol.findOne({ id: timerId });

    if (!notif) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: "Timer record not found",
      });
    }

    if (notif.status !== "scheduled") {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: `Timer status is ${notif.status}`,
      });
    }

    // 4. Retrieve active push subscriptions for the user
    const subsCol = await getPushSubscriptionsCollection();
    const subscriptions = await subsCol.find({ userId }).toArray();

    if (subscriptions.length === 0) {
      await restCol.updateOne(
        { id: timerId },
        {
          $set: {
            status: "dispatched",
            updatedAt: new Date().toISOString(),
          },
        }
      );
      return NextResponse.json({
        success: true,
        deliveredCount: 0,
        note: "No push subscriptions registered for user",
      });
    }

    // 5. Construct notification content
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

    // 6. Send Web Push to all user devices
    let deliveredCount = 0;
    for (const sub of subscriptions) {
      const res = await sendPushToSubscription(sub, pushPayload);
      if (res.success) {
        deliveredCount++;
      }
    }

    // 7. Mark status as dispatched in MongoDB
    await restCol.updateOne(
      { id: timerId },
      {
        $set: {
          status: "dispatched",
          updatedAt: new Date().toISOString(),
        },
      }
    );

    return NextResponse.json({
      success: true,
      deliveredCount,
      totalSubscriptions: subscriptions.length,
    });
  } catch (error: any) {
    console.error("Notification dispatch error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Internal server error." },
      { status: 500 }
    );
  }
}
