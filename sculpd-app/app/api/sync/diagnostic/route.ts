// app/api/sync/diagnostic/route.ts
import { NextResponse } from "next/server";
import { getMongoClientPromise, isMongoOfflineError } from "@/lib/mongodb";

export const dynamic = "force-dynamic";

/**
 * GET /api/sync/diagnostic
 * Fast diagnostic healthcheck endpoint for MongoDB Atlas connectivity.
 * Pinpoints SSL alert 80 / IP whitelist issues with actionable resolution steps.
 */
export async function GET() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    return NextResponse.json(
      {
        status: "error",
        connected: false,
        error: "Missing MONGODB_URI environment variable.",
        diagnostic:
          "MONGODB_URI is not set in your server environment or .env.local file.",
        resolution: [
          "Add MONGODB_URI to .env.local (locally) or Vercel Project Settings -> Environment Variables.",
        ],
      },
      { status: 500 }
    );
  }

  // Obfuscate password in URI for safe diagnostics
  const sanitizedUri = uri.replace(/\/\/([^:]+):([^@]+)@/, "//***:***@");

  try {
    const start = Date.now();
    const client = await getMongoClientPromise();
    const pingResult = await client.db("admin").command({ ping: 1 });
    const latencyMs = Date.now() - start;

    return NextResponse.json({
      status: "online",
      connected: true,
      latencyMs,
      ping: pingResult,
      uri: sanitizedUri,
      message: "MongoDB Atlas is connected and fully operational.",
    });
  } catch (error: any) {
    const isSslAlert80 =
      error?.message?.includes("SSL alert number 80") ||
      error?.message?.includes("tlsv1 alert internal error") ||
      error?.code === "ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR";

    let diagnostic = "Could not establish connection to MongoDB.";
    let resolution = [
      "Check that your MongoDB cluster is running.",
      "Verify the MONGODB_URI connection string and database credentials are correct.",
    ];

    if (isSslAlert80) {
      diagnostic =
        "MongoDB Atlas rejected the TLS connection (SSL alert number 80) because the server's IP address is not whitelisted in Atlas Network Access.";
      resolution = [
        "1. Log in to MongoDB Atlas at https://cloud.mongodb.com",
        "2. Navigate to 'Network Access' under the Security section in the left sidebar",
        "3. Click '+ Add IP Address'",
        "4. Click 'Allow Access From Anywhere' (adds 0.0.0.0/0) — required for Vercel, Netlify, or mobile cellular connections where client/server IPs change dynamically",
        "5. Click 'Confirm' and wait 30-60 seconds for status to change to 'Active'",
        "6. Refresh this endpoint or Sculp'd to resume cloud sync",
      ];
    }

    return NextResponse.json(
      {
        status: "offline",
        connected: false,
        isSslAlert80,
        error: error?.message || "Connection failed",
        diagnostic,
        resolution,
        uri: sanitizedUri,
      },
      { status: 503 }
    );
  }
}
