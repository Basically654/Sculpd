// lib/crypto/pin.ts

/**
 * Converts an ArrayBuffer to a hex string.
 */
function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Converts a hex string back to an ArrayBuffer.
 */
function hexToBuffer(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Generates a random cryptographic salt (16 bytes) formatted as hex.
 */
export function generateSalt(length = 16): string {
  const saltBytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(saltBytes);
  return bufferToHex(saltBytes.buffer);
}

/**
 * Hashes a PIN using the Web Crypto API (PBKDF2 with SHA-256, 100,000 iterations).
 * Never stores or returns plaintext PIN.
 */
export async function hashPin(
  pin: string,
  providedSalt?: string
): Promise<{ pinHash: string; pinSalt: string }> {
  if (!pin || typeof pin !== "string" || pin.trim().length === 0) {
    throw new Error("PIN must be a non-empty string.");
  }

  const saltHex = providedSalt || generateSalt();
  const saltBuffer = hexToBuffer(saltHex);

  const enc = new TextEncoder();
  const keyMaterial = await globalThis.crypto.subtle.importKey(
    "raw",
    enc.encode(pin),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );

  const derivedBits = await globalThis.crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBuffer as unknown as BufferSource,
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );

  const pinHash = bufferToHex(derivedBits);
  return { pinHash, pinSalt: saltHex };
}

/**
 * Verifies a candidate PIN against a stored hash and salt.
 * Constant-time comparison to prevent timing attacks.
 */
export async function verifyPin(
  candidatePin: string,
  storedHash: string,
  storedSalt: string
): Promise<boolean> {
  if (!candidatePin || !storedHash || !storedSalt) {
    return false;
  }

  try {
    const { pinHash: computedHash } = await hashPin(candidatePin, storedSalt);

    if (computedHash.length !== storedHash.length) {
      return false;
    }

    // Constant-time comparison
    let match = 0;
    for (let i = 0; i < computedHash.length; i++) {
      match |= computedHash.charCodeAt(i) ^ storedHash.charCodeAt(i);
    }

    return match === 0;
  } catch {
    return false;
  }
}
