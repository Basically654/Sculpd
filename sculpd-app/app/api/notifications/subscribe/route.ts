// app/api/notifications/subscribe/route.ts
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { extractVerifiedUserId } from "@/lib/auth/session-token";
import {
  ensureMongoIndexes,
  getPushSubscriptionsCollection,
} from "@/lib/mongodb";

export const dynamic = "force-dynamic";

/**
 * POST /api/notifications/subscribe
 * Registers a Web Push subscription for the authenticated user.
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
    const { endpoint, keys, userAgent } = body;

    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return NextResponse.json(
        { success: false, error: "Bad Request: Missing push subscription details." },
        { status: 400 }
      );
    }

    await ensureMongoIndexes();
    const col = await getPushSubscriptionsCollection();
    const now = new Date().toISOString();

    await col.updateOne(
      { endpoint },
      {
        $set: {
          userId: verifiedUserId,
          endpoint,
          keys: {
            p256dh: keys.p256dh,
            auth: keys.auth,
          },
          userAgent: userAgent || "",
          updatedAt: now,
        },
        $setOnInsert: {
          id: randomUUID(),
          createdAt: now,
        },
      },
      { upsert: true }
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Push subscribe error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Internal server error." },
      { status: 500 }
    );
  }
}
