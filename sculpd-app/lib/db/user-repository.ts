// lib/db/user-repository.ts
import { db } from "./index";
import { User, SafeUser, AvatarColor, SyncQueueItem } from "@/types/models";
import { hashPin, verifyPin } from "@/lib/crypto/pin";
import { generateUUID } from "@/lib/crypto/uuid";
import { resilientTransaction } from "./transaction";

/**
 * Strips sensitive cryptographic fields from a User object before returning to UI.
 */
export function sanitizeUser(user: User): SafeUser {
  const { pinHash: _pinHash, pinSalt: _pinSalt, ...safeUser } = user;
  return safeUser;
}

/**
 * Retrieves all user profiles with PIN hashes stripped.
 */
export async function listSafeUsers(): Promise<SafeUser[]> {
  const users = await db.users.orderBy("createdAt").toArray();
  return users.map(sanitizeUser);
}

/**
 * Retrieves a user by ID. Internal helper for auth verification.
 */
export async function getUserById(userId: string): Promise<User | undefined> {
  if (!userId) return undefined;
  return db.users.get(userId);
}

/**
 * Retrieves a safe user profile by ID.
 */
export async function getSafeUserById(userId: string): Promise<SafeUser | undefined> {
  const user = await getUserById(userId);
  return user ? sanitizeUser(user) : undefined;
}

export interface CreateUserInput {
  displayName: string;
  pin: string;
  avatarColor?: AvatarColor;
  bodyweight?: number;
}

/**
 * Creates a new user profile with a cryptographically hashed PIN.
 * Never stores plaintext PINs.
 */
export async function createUser(input: CreateUserInput): Promise<SafeUser> {
  const trimmedName = input.displayName.trim();
  if (!trimmedName) {
    throw new Error("Display name cannot be empty.");
  }

  const trimmedPin = input.pin.trim();
  if (trimmedPin.length < 4 || !/^\d+$/.test(trimmedPin)) {
    throw new Error("PIN must be at least 4 numeric digits.");
  }

  const { pinHash, pinSalt } = await hashPin(trimmedPin);
  const now = new Date().toISOString();
  const userId = generateUUID();

  const parsedBw =
    typeof input.bodyweight === "number" && input.bodyweight > 0
      ? input.bodyweight
      : null;

  const newUser: User = {
    id: userId,
    displayName: trimmedName,
    pinHash,
    pinSalt,
    avatarColor: input.avatarColor || "emerald",
    bodyweight: parsedBw,
    createdAt: now,
    updatedAt: now,
  };

  const syncItem: SyncQueueItem = {
    id: generateUUID(),
    userId: newUser.id,
    operation: "insert",
    collection: "users",
    entityId: newUser.id,
    payload: JSON.parse(JSON.stringify(newUser)),
    timestamp: Date.now(),
    status: "pending",
    attempts: 0,
  };

  await resilientTransaction(
    "createUser",
    [db.users, db.syncQueue],
    async () => {
      await Promise.all([
        db.users.add(newUser),
        db.syncQueue.add(syncItem),
      ]);
    },
    async () => {
      await db.users.add(newUser);
      await db.syncQueue.add(syncItem);
    }
  );

  return sanitizeUser(newUser);
}

/**
 * Updates a user's current profile bodyweight in lbs.
 */
export async function updateUserBodyweight(
  userId: string,
  bodyweight: number
): Promise<SafeUser> {
  if (!userId) {
    throw new Error("userId is required to update bodyweight.");
  }

  const user = await getUserById(userId);
  if (!user) {
    throw new Error("User profile not found.");
  }

  const parsedBw = Math.max(0, Math.round(bodyweight * 10) / 10);
  const now = new Date().toISOString();

  const updatedUser: User = {
    ...user,
    bodyweight: parsedBw,
    updatedAt: now,
  };

  const syncItem: SyncQueueItem = {
    id: generateUUID(),
    userId,
    operation: "update",
    collection: "users",
    entityId: userId,
    payload: JSON.parse(JSON.stringify(updatedUser)),
    timestamp: Date.now(),
    status: "pending",
    attempts: 0,
  };

  await resilientTransaction(
    "updateUserBodyweight",
    [db.users, db.syncQueue],
    async () => {
      await Promise.all([
        db.users.put(updatedUser),
        db.syncQueue.add(syncItem),
      ]);
    },
    async () => {
      await db.users.put(updatedUser);
      await db.syncQueue.add(syncItem);
    }
  );

  return sanitizeUser(updatedUser);
}

/**
 * Authenticates a user by validating their candidate PIN against the stored hash.
 */
export async function authenticateUser(
  userId: string,
  candidatePin: string
): Promise<{ success: boolean; user?: SafeUser; error?: string }> {
  const user = await getUserById(userId);
  if (!user) {
    return { success: false, error: "Profile not found." };
  }

  const isValid = await verifyPin(candidatePin, user.pinHash, user.pinSalt);
  if (!isValid) {
    return { success: false, error: "Incorrect PIN." };
  }

  return { success: true, user: sanitizeUser(user) };
}

/**
 * Deletes a user profile and all associated user-owned records (sessions, sets, queue items).
 */
export async function deleteUser(userId: string): Promise<void> {
  if (!userId) return;

  await resilientTransaction(
    "deleteUser",
    [db.users, db.workoutSessions, db.sets, db.syncQueue, db.syncMeta],
    async () => {
      await Promise.all([
        db.users.delete(userId),
        db.workoutSessions.where("userId").equals(userId).delete(),
        db.sets.where("userId").equals(userId).delete(),
        db.syncQueue.where("userId").equals(userId).delete(),
        db.syncMeta.where("userId").equals(userId).delete(),
      ]);
    },
    async () => {
      await db.users.delete(userId);
      await db.workoutSessions.where("userId").equals(userId).delete();
      await db.sets.where("userId").equals(userId).delete();
      await db.syncQueue.where("userId").equals(userId).delete();
      await db.syncMeta.where("userId").equals(userId).delete();
    }
  );
}
