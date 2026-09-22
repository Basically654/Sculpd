// app/api/auth/session/route.ts
import { NextResponse } from "next/server";
import { createSessionToken } from "@/lib/auth/session-token";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/session
 * Issues a signed session token for a validated local user.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId } = body;

    if (!userId || typeof userId !== "string" || userId.trim() === "") {
      return NextResponse.json(
        { success: false, error: "userId is required to issue session token." },
        { status: 400 }
      );
    }

    const token = await createSessionToken(userId.trim());

    return NextResponse.json({
      success: true,
      token,
      userId: userId.trim(),
    });
  } catch (error: any) {
    console.error("Auth session route error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Internal server error." },
      { status: 500 }
    );
  }
}
