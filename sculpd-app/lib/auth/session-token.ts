// lib/auth/session-token.ts

const SECRET_KEY =
  process.env.SESSION_SECRET ||
  process.env.AUTH_SECRET ||
  "sculpd_private_hmac_secret_key_v2";

/**
 * Converts ArrayBuffer to hex string.
 */
function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generates an HMAC-SHA256 signature for a message.
 */
async function signMessage(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(message)
  );

  return bufferToHex(signature);
}

/**
 * Creates a signed session token: `<userId>.<issuedAt>.<hmacSignature>`
 */
export async function createSessionToken(
  userId: string,
  secret = SECRET_KEY
): Promise<string> {
  if (!userId || typeof userId !== "string" || userId.trim() === "") {
    throw new Error("Cannot issue session token: userId is required.");
  }

  const issuedAt = Date.now().toString();
  const payload = `${userId}:${issuedAt}`;
  const signature = await signMessage(payload, secret);

  return `${userId}.${issuedAt}.${signature}`;
}

/**
 * Verifies a session token and extracts the cryptographically verified userId.
 * Enforces signature validity and token expiration (30 days).
 */
export async function verifySessionToken(
  token: string,
  secret = SECRET_KEY,
  maxAgeMs = 30 * 24 * 60 * 60 * 1000 // 30 days
): Promise<{ valid: boolean; userId?: string; error?: string }> {
  if (!token || typeof token !== "string") {
    return { valid: false, error: "Missing or invalid token format." };
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return { valid: false, error: "Malformed session token." };
  }

  const [userId, issuedAtStr, signature] = parts;
  const issuedAt = parseInt(issuedAtStr, 10);

  if (isNaN(issuedAt)) {
    return { valid: false, error: "Invalid timestamp in session token." };
  }

  // Check expiration
  if (Date.now() - issuedAt > maxAgeMs) {
    return { valid: false, error: "Session token has expired." };
  }

  // Verify HMAC signature
  const payload = `${userId}:${issuedAtStr}`;
  const expectedSignature = await signMessage(payload, secret);

  if (signature.length !== expectedSignature.length) {
    return { valid: false, error: "Signature length mismatch." };
  }

  // Constant-time comparison
  let match = 0;
  for (let i = 0; i < signature.length; i++) {
    match |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
  }

  if (match !== 0) {
    return { valid: false, error: "Invalid session signature." };
  }

  return { valid: true, userId };
}

/**
 * Extracts and verifies the authenticated userId from Next.js request headers.
 * Looks in `Authorization: Bearer <token>` or `x-sculpd-session-token`.
 */
export async function extractVerifiedUserId(
  request: Request,
  secret = SECRET_KEY
): Promise<string | null> {
  const authHeader = request.headers.get("authorization");
  let token: string | null = null;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7).trim();
  } else {
    token = request.headers.get("x-sculpd-session-token");
  }

  if (!token) {
    return null;
  }

  const verification = await verifySessionToken(token, secret);
  if (verification.valid && verification.userId) {
    return verification.userId;
  }

  return null;
}
