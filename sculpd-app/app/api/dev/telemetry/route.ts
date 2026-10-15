// app/api/dev/telemetry/route.ts
import { NextResponse } from "next/server";
import { verifyDevRequest } from "@/lib/dev/dev-auth";

export const dynamic = "force-dynamic";

declare global {
  // eslint-disable-next-line no-var
  var _serverDevTelemetry: any[] | undefined;
}

function getServerTelemetry(): any[] {
  if (!global._serverDevTelemetry) {
    global._serverDevTelemetry = [];
  }
  return global._serverDevTelemetry;
}

/**
 * GET /api/dev/telemetry
 * Retrieves server-side developer diagnostic logs.
 */
export async function GET(request: Request) {
  const auth = await verifyDevRequest(request);
  if (!auth.authorized) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: auth.status }
    );
  }

  const logs = getServerTelemetry();
  return NextResponse.json({
    success: true,
    count: logs.length,
    events: [...logs].reverse(),
  });
}

/**
 * POST /api/dev/telemetry
 * Records a server-side developer diagnostic event.
 */
export async function POST(request: Request) {
  const auth = await verifyDevRequest(request);
  if (!auth.authorized) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: auth.status }
    );
  }

  const body = await request.json().catch(() => ({}));
  const logs = getServerTelemetry();

  const event = {
    id: `srv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toISOString(),
    epochMs: Date.now(),
    environment: process.env.NODE_ENV || "development",
    ...body,
  };

  logs.push(event);
  if (logs.length > 200) {
    logs.splice(0, logs.length - 200);
  }

  return NextResponse.json({ success: true, event });
}

/**
 * DELETE /api/dev/telemetry
 * Clears server-side developer diagnostic logs.
 */
export async function DELETE(request: Request) {
  const auth = await verifyDevRequest(request);
  if (!auth.authorized) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: auth.status }
    );
  }

  if (global._serverDevTelemetry) {
    global._serverDevTelemetry = [];
  }

  return NextResponse.json({ success: true, cleared: true });
}
