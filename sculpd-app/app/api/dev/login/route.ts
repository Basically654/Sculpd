// app/api/dev/login/route.ts
import { NextResponse } from "next/server";
import {
  isDevModeEnabled,
  validateDevCredentials,
  createDevToken,
} from "@/lib/dev/dev-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/dev/login
 * Authenticates developer credentials server-side and issues a signed dev token.
 */
export async function POST(request: Request) {
  try {
    if (!isDevModeEnabled()) {
      return NextResponse.json(
        {
          success: false,
          error: "Developer mode is disabled in this environment.",
        },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: "Username and password are required." },
        { status: 400 }
      );
    }

    const isValid = validateDevCredentials(username, password);
    if (!isValid) {
      return NextResponse.json(
        { success: false, error: "Invalid developer credentials." },
        { status: 401 }
      );
    }

    const sessionInfo = await createDevToken();

    return NextResponse.json({
      success: true,
      token: sessionInfo.token,
      user: {
        id: sessionInfo.userId,
        username: sessionInfo.username,
        role: sessionInfo.role,
      },
    });
  } catch (error: any) {
    console.error("[DevAuth] Login error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Internal server error." },
      { status: 500 }
    );
  }
}
