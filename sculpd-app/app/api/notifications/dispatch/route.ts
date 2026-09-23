import { NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { executeRestNotificationDispatch } from "@/lib/notifications/scheduler";

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

    // 3. Execute verified dispatch
    const dispatchResult = await executeRestNotificationDispatch(timerId, userId);

    return NextResponse.json({
      success: dispatchResult.success,
      deliveredCount: dispatchResult.deliveredCount,
      reason: dispatchResult.reason,
    });
  } catch (error: any) {
    const isMongoOffline =
      error?.name?.includes("Mongo") ||
      error?.message?.includes("MONGODB_URI") ||
      error?.message?.includes("getaddrinfo") ||
      error?.message?.includes("timed out") ||
      error?.message?.includes("ECONNREFUSED");

    if (isMongoOffline) {
      console.warn("Notification dispatch offline notice:", error?.message || error);
      return NextResponse.json(
        { success: false, error: "Cloud database offline or unreachable." },
        { status: 503 }
      );
    }

    console.error("Notification dispatch error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Internal server error." },
      { status: 500 }
    );
  }
}
