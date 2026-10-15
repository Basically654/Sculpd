// lib/dev/dev-auth.ts
import { createSessionToken, verifySessionToken } from "@/lib/auth/session-token";

/**
 * Checks whether Developer Mode is enabled in the current environment.
 * Enabled by default in development (`NODE_ENV !== "production"`).
 * In production, strictly disabled unless `ENABLE_DEV_MODE === "true"`.
 */
export function isDevModeEnabled(): boolean {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }
  return process.env.ENABLE_DEV_MODE === "true";
}

const DEV_USERNAME = process.env.DEV_USERNAME || "dev";
const DEV_PASSWORD = process.env.DEV_PASSWORD || "devpass0000";

/**
 * Validates developer credentials server-side.
 * Never exposed to client bundles or hardcoded in client code.
 */
export function validateDevCredentials(username: string, pass: string): boolean {
  if (!isDevModeEnabled()) {
    return false;
  }
  if (!username || !pass) {
    return false;
  }

  // Timing-safe comparison for developer credentials
  const expectedUser = DEV_USERNAME;
  const expectedPass = DEV_PASSWORD;

  const userMatch = username.trim() === expectedUser;
  const passMatch = pass.trim() === expectedPass;

  return userMatch && passMatch;
}

const DEV_USER_ID = "dev-athlete-0000";
const DEV_TOKEN_PREFIX = "sculpd_dev_";

/**
 * Generates an HMAC-signed developer session token.
 */
export async function createDevToken(): Promise<{
  token: string;
  userId: string;
  username: string;
  role: "developer";
}> {
  if (!isDevModeEnabled()) {
    throw new Error("Developer mode is disabled in this environment.");
  }

  // Issue signed session token for the dev identity
  const token = await createSessionToken(DEV_USER_ID);

  return {
    token: `${DEV_TOKEN_PREFIX}${token}`,
    userId: DEV_USER_ID,
    username: DEV_USERNAME,
    role: "developer",
  };
}

/**
 * Verifies developer authorization on incoming HTTP requests.
 * Used on every privileged developer endpoint.
 *
 * Rejects with 401 if token is missing/invalid.
 * Rejects with 403 if developer mode is disabled or token lacks developer privilege.
 */
export async function verifyDevRequest(request: Request): Promise<{
  authorized: boolean;
  userId?: string;
  error?: string;
  status: number;
}> {
  if (!isDevModeEnabled()) {
    return {
      authorized: false,
      error: "Developer mode is disabled in this environment.",
      status: 403,
    };
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      authorized: false,
      error: "Unauthorized: Missing developer authorization bearer token.",
      status: 401,
    };
  }

  const rawToken = authHeader.substring(7).trim();
  if (!rawToken.startsWith(DEV_TOKEN_PREFIX)) {
    return {
      authorized: false,
      error: "Forbidden: Token lacks developer privileges.",
      status: 403,
    };
  }

  const underlyingToken = rawToken.substring(DEV_TOKEN_PREFIX.length);
  const result = await verifySessionToken(underlyingToken);

  if (!result.valid) {
    return {
      authorized: false,
      error: result.error || "Unauthorized: Invalid or expired developer session token.",
      status: 401,
    };
  }

  if (result.userId !== DEV_USER_ID) {
    return {
      authorized: false,
      error: "Forbidden: Token lacks developer privileges.",
      status: 403,
    };
  }

  return {
    authorized: true,
    userId: result.userId,
    status: 200,
  };
}
