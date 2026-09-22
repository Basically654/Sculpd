// app/api/notifications/cancel/route.ts
import { NextResponse } from "next/server";
import { extractVerifiedUserId } from "@/lib/auth/session-token";
import { getRestNotificationsCollection } from "@/lib/mongodb";
import { cancelDelayedPushWebhook } from "@/lib/notifications/scheduler";

export const dynamic = "force-dynamic";

/**
 * POST /api/notifications/cancel
 * Cancels a pending rest notification when user skips rest or taps 'Ready Now'.
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

    const body = await request.json().catch(() => ({}));
    const { timerId } = body;

    const col = await getRestNotificationsCollection();
    const now = new Date().toISOString();

    const query: any = { userId: verifiedUserId, status: "scheduled" };
    if (timerId) {
      query.id = timerId;
    }

    const activeDocs = await col.find(query).toArray();

    for (const doc of activeDocs) {
      if (doc.qstashMessageId) {
        await cancelDelayedPushWebhook(doc.qstashMessageId);
      }
      await col.updateOne(
        { id: doc.id },
        { $set: { status: "cancelled", updatedAt: now } }
      );
    }

    return NextResponse.json({ success: true, cancelledCount: activeDocs.length });
  } catch (error: any) {
    console.error("Cancel notification error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Internal server error." },
      { status: 500 }
    );
  }
}
