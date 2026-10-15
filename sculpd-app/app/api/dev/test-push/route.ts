// app/api/dev/test-push/route.ts
import { NextResponse } from "next/server";
import { verifyDevRequest } from "@/lib/dev/dev-auth";
import { getPushSubscriptionsCollection } from "@/lib/mongodb";
import { sendPushToSubscription, RestPushPayload } from "@/lib/notifications/web-push-server";

export const dynamic = "force-dynamic";

export interface PushTestStage {
  stage: number;
  name: string;
  status: "passed" | "failed" | "unverified";
  detail: string;
  durationMs?: number;
}

export interface PushTestResult {
  success: boolean;
  timestamp: string;
  stages: PushTestStage[];
  error?: string;
  deliveredCount: number;
}

/**
 * POST /api/dev/test-push
 * Tests the real end-to-end push pipeline with granular stage diagnostics.
 */
export async function POST(request: Request) {
  const startTime = Date.now();
  const stages: PushTestStage[] = [];

  // Stage 1: Request Reception
  stages.push({
    stage: 1,
    name: "Client Request",
    status: "passed",
    detail: "Request received and parsed by server.",
    durationMs: Date.now() - startTime,
  });

  // Stage 2: Server Developer Authorization
  const authStart = Date.now();
  const auth = await verifyDevRequest(request);
  if (!auth.authorized) {
    stages.push({
      stage: 2,
      name: "Server Authorization",
      status: "failed",
      detail: auth.error || "Developer authorization rejected.",
      durationMs: Date.now() - authStart,
    });
    return NextResponse.json(
      {
        success: false,
        timestamp: new Date().toISOString(),
        stages,
        error: auth.error,
        deliveredCount: 0,
      } as PushTestResult,
      { status: auth.status }
    );
  }

  stages.push({
    stage: 2,
    name: "Server Authorization",
    status: "passed",
    detail: "Developer session cryptographically verified on server.",
    durationMs: Date.now() - authStart,
  });

  // Stage 3: Subscription Resolution
  const subStart = Date.now();
  const body = await request.json().catch(() => ({}));
  const { targetUserId, subscription: directSubscription } = body;
  const userIdToTarget = targetUserId || auth.userId || "dev-athlete-0000";

  let targetSubscriptions: any[] = [];

  try {
    const subsCol = await getPushSubscriptionsCollection();

    // If client supplied its current browser subscription directly, upsert it for this test
    if (directSubscription && directSubscription.endpoint) {
      await subsCol.updateOne(
        { endpoint: directSubscription.endpoint },
        {
          $set: {
            userId: userIdToTarget,
            subscription: directSubscription,
            updatedAt: new Date().toISOString(),
          },
        },
        { upsert: true }
      );
    }

    targetSubscriptions = await subsCol.find({ userId: userIdToTarget }).toArray();
  } catch (dbErr: any) {
    stages.push({
      stage: 3,
      name: "Subscription Lookup",
      status: "failed",
      detail: `MongoDB subscription query error: ${dbErr?.message || "Database unavailable"}`,
      durationMs: Date.now() - subStart,
    });
    return NextResponse.json({
      success: false,
      timestamp: new Date().toISOString(),
      stages,
      error: "Subscription query failed.",
      deliveredCount: 0,
    } as PushTestResult);
  }

  if (targetSubscriptions.length === 0) {
    stages.push({
      stage: 3,
      name: "Subscription Lookup",
      status: "failed",
      detail: `No active push subscriptions found for user '${userIdToTarget}'. Enable notifications in browser first.`,
      durationMs: Date.now() - subStart,
    });
    return NextResponse.json({
      success: false,
      timestamp: new Date().toISOString(),
      stages,
      error: "No push subscriptions found.",
      deliveredCount: 0,
    } as PushTestResult);
  }

  stages.push({
    stage: 3,
    name: "Subscription Lookup",
    status: "passed",
    detail: `Found ${targetSubscriptions.length} registered push subscription(s).`,
    durationMs: Date.now() - subStart,
  });

  // Stage 4: VAPID Push Dispatch
  const dispatchStart = Date.now();
  const hasVapidConfig = Boolean(
    process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
  );

  if (!hasVapidConfig) {
    stages.push({
      stage: 4,
      name: "VAPID Push Dispatch",
      status: "failed",
      detail: "VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY environment variable is not configured.",
      durationMs: Date.now() - dispatchStart,
    });
    return NextResponse.json({
      success: false,
      timestamp: new Date().toISOString(),
      stages,
      error: "VAPID keys not configured.",
      deliveredCount: 0,
    } as PushTestResult);
  }

  const payload: RestPushPayload = {
    timerId: `dev-test-${Date.now()}`,
    title: "Sculp’d Test Push (Real Web Push)",
    body: `Developer pipeline test delivered at ${new Date().toLocaleTimeString()}.`,
    url: "/dev",
  };

  let deliveredCount = 0;
  const dispatchErrors: string[] = [];

  for (const subDoc of targetSubscriptions) {
    const rawSub = subDoc.subscription || subDoc;
    const sendRes = await sendPushToSubscription(rawSub, payload);
    if (sendRes.success) {
      deliveredCount++;
    } else {
      dispatchErrors.push(sendRes.error || "Unknown dispatch failure");
    }
  }

  if (deliveredCount === 0) {
    stages.push({
      stage: 4,
      name: "VAPID Push Dispatch",
      status: "failed",
      detail: `Push service rejected dispatch: ${dispatchErrors.join("; ")}`,
      durationMs: Date.now() - dispatchStart,
    });
    return NextResponse.json({
      success: false,
      timestamp: new Date().toISOString(),
      stages,
      error: "Push dispatch failed.",
      deliveredCount: 0,
    } as PushTestResult);
  }

  stages.push({
    stage: 4,
    name: "VAPID Push Dispatch",
    status: "passed",
    detail: `Successfully dispatched to push gateway for ${deliveredCount} device(s).`,
    durationMs: Date.now() - dispatchStart,
  });

  // Stage 5: Service Worker Reception (Client Observation)
  stages.push({
    stage: 5,
    name: "Service Worker Delivery",
    status: "unverified",
    detail: "Push dispatched to push gateway; awaiting local Service Worker 'push' event receipt in browser.",
  });

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    stages,
    deliveredCount,
  } as PushTestResult);
}
