// app/api/dev/session/route.ts
import { NextResponse } from "next/server";
import { verifyDevRequest, isDevModeEnabled } from "@/lib/dev/dev-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/dev/session
 * Verifies developer session token and returns server diagnostic status.
 */
export async function GET(request: Request) {
  const auth = await verifyDevRequest(request);
  if (!auth.authorized) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: auth.status }
    );
  }

  return NextResponse.json({
    success: true,
    authenticated: true,
    user: {
      id: auth.userId,
      username: "dev",
      role: "developer",
    },
    system: {
      nodeEnv: process.env.NODE_ENV || "development",
      devModeEnabled: isDevModeEnabled(),
      hasMongoUri: Boolean(process.env.MONGODB_URI),
      hasQStash: Boolean(process.env.QSTASH_TOKEN),
      hasVapidKeys: Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
      appVersion: "2.0.0-dev",
      serverTime: new Date().toISOString(),
    },
  });
}
