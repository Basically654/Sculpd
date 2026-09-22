// app/api/notifications/unsubscribe/route.ts
import { NextResponse } from "next/server";
import { extractVerifiedUserId } from "@/lib/auth/session-token";
import { getPushSubscriptionsCollection } from "@/lib/mongodb";

export const dynamic = "force-dynamic";

/**
 * POST /api/notifications/unsubscribe
 * Revokes a Web Push subscription for the authenticated user.
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
    const { endpoint } = body;

    if (!endpoint) {
      return NextResponse.json(
        { success: false, error: "Bad Request: Missing endpoint." },
        { status: 400 }
      );
    }

    const col = await getPushSubscriptionsCollection();
    await col.deleteOne({ endpoint, userId: verifiedUserId });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Push unsubscribe error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Internal server error." },
      { status: 500 }
    );
  }
}
