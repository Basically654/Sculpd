// app/api/notifications/schedule/route.ts
import { NextResponse } from "next/server";
import { extractVerifiedUserId } from "@/lib/auth/session-token";
import {
  ensureMongoIndexes,
  getRestNotificationsCollection,
} from "@/lib/mongodb";
import {
  scheduleServerRestTimer,
  cancelServerTimer,
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
      cancelServerTimer(activeDoc.id);
      if (activeDoc.qstashMessageId) {
        await cancelDelayedPushWebhook(activeDoc.qstashMessageId);
      }
      await col.updateOne(
        { id: activeDoc.id },
        { $set: { status: "superseded", updatedAt: now } }
      );
    }

    // 2. Determine absolute public callback URL for QStash webhook fallback
    // In production, QStash requires a public HTTPS URL and will fail if given localhost
    const origin = request.headers.get("origin");
    const forwardedHost = request.headers.get("x-forwarded-host");
    const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
    const host = request.headers.get("host");

    let baseUrl = "";
    if (origin && !origin.includes("localhost") && !origin.includes("127.0.0.1")) {
      baseUrl = origin;
    } else if (forwardedHost && !forwardedHost.includes("localhost")) {
      baseUrl = `${forwardedProto}://${forwardedHost}`;
    } else if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
      baseUrl = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
    } else if (process.env.VERCEL_URL) {
      baseUrl = `https://${process.env.VERCEL_URL}`;
    } else if (
      process.env.NEXT_PUBLIC_APP_URL &&
      !process.env.NEXT_PUBLIC_APP_URL.includes("localhost")
    ) {
      baseUrl = process.env.NEXT_PUBLIC_APP_URL;
    } else if (origin) {
      baseUrl = origin;
    } else if (host) {
      baseUrl = `https://${host}`;
    } else {
      baseUrl = "https://sculpd.app";
    }

    const callbackUrl = `${baseUrl.replace(/\/$/, "")}/api/notifications/dispatch`;

    // 3. Schedule delivery with QStash delayed webhook in production, or local server timer
    const scheduleResult = await scheduleServerRestTimer({
      timerId,
      userId: verifiedUserId,
      targetEpochMs: scheduledFor,
      callbackUrl,
    });

    if (!scheduleResult.scheduled) {
      console.warn(`[Schedule API] Failed to schedule timer ${timerId}:`, scheduleResult.error);
      return NextResponse.json(
        {
          success: false,
          error: scheduleResult.error || "Failed to schedule background notification callback.",
        },
        { status: 502 }
      );
    }

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
    const isMongoOffline =
      error?.name?.includes("Mongo") ||
      error?.message?.includes("MONGODB_URI") ||
      error?.message?.includes("getaddrinfo") ||
      error?.message?.includes("timed out") ||
      error?.message?.includes("ECONNREFUSED");

    if (isMongoOffline) {
      console.warn("Schedule notification offline notice:", error?.message || error);
      return NextResponse.json(
        { success: false, error: "Cloud database offline or unreachable." },
        { status: 503 }
      );
    }

    console.error("Schedule notification error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Internal server error." },
      { status: 500 }
    );
  }
}
