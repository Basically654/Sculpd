// lib/db/exercise-repository.ts
import { db } from "./index";
import { Exercise, SyncQueueItem } from "@/types/models";

/**
 * Standard starter catalog of exercises across primary muscle groups.
 * Provides a clean, sensible baseline without bloating the database.
 */
export const STANDARD_EXERCISES: Omit<Exercise, "createdAt" | "updatedAt">[] = [
  // Chest
  { id: "std_ex_bench_press", name: "Barbell Bench Press", category: "Chest", equipment: "Barbell", userId: null },
  { id: "std_ex_incline_db_press", name: "Incline Dumbbell Press", category: "Chest", equipment: "Dumbbell", userId: null },
  { id: "std_ex_cable_fly", name: "Cable Chest Fly", category: "Chest", equipment: "Cable", userId: null },
  { id: "std_ex_push_ups", name: "Push-Ups", category: "Chest", equipment: "Bodyweight", userId: null },
  { id: "std_ex_dips", name: "Chest Dips", category: "Chest", equipment: "Bodyweight", userId: null },

  // Back
  { id: "std_ex_deadlift", name: "Barbell Deadlift", category: "Back", equipment: "Barbell", userId: null },
  { id: "std_ex_lat_pulldown", name: "Neutral Grip Lat Pulldown", category: "Back", equipment: "Cable", userId: null },
  { id: "std_ex_bent_over_row", name: "Barbell Bent-Over Row", category: "Back", equipment: "Barbell", userId: null },
  { id: "std_ex_seated_cable_row", name: "Seated Cable Row", category: "Back", equipment: "Cable", userId: null },
  { id: "std_ex_pull_ups", name: "Pull-Ups", category: "Back", equipment: "Bodyweight", userId: null },

  // Legs
  { id: "std_ex_squat", name: "Barbell Back Squat", category: "Legs", equipment: "Barbell", userId: null },
  { id: "std_ex_romanian_deadlift", name: "Romanian Deadlift", category: "Legs", equipment: "Barbell", userId: null },
  { id: "std_ex_leg_press", name: "Leg Press", category: "Legs", equipment: "Machine", userId: null },
  { id: "std_ex_bulgarian_split_squat", name: "Bulgarian Split Squat", category: "Legs", equipment: "Dumbbell", userId: null },
  { id: "std_ex_leg_extension", name: "Leg Extension", category: "Legs", equipment: "Machine", userId: null },
  { id: "std_ex_seated_leg_curl", name: "Seated Leg Curl", category: "Legs", equipment: "Machine", userId: null },
  { id: "std_ex_standing_calf_raise", name: "Standing Calf Raise", category: "Legs", equipment: "Machine", userId: null },
  { id: "std_ex_hip_thrust", name: "Barbell Hip Thrust", category: "Legs", equipment: "Barbell", userId: null },

  // Shoulders
  { id: "std_ex_overhead_press", name: "Overhead Barbell Press", category: "Shoulders", equipment: "Barbell", userId: null },
  { id: "std_ex_db_shoulder_press", name: "Dumbbell Shoulder Press", category: "Shoulders", equipment: "Dumbbell", userId: null },
  { id: "std_ex_lateral_raise", name: "Dumbbell Lateral Raise", category: "Shoulders", equipment: "Dumbbell", userId: null },
  { id: "std_ex_face_pull", name: "Cable Face Pull", category: "Shoulders", equipment: "Cable", userId: null },

  // Arms
  { id: "std_ex_db_bicep_curl", name: "Dumbbell Bicep Curl", category: "Arms", equipment: "Dumbbell", userId: null },
  { id: "std_ex_tricep_rope_pushdown", name: "Tricep Rope Pushdown", category: "Arms", equipment: "Cable", userId: null },
  { id: "std_ex_incline_db_curl", name: "Incline Dumbbell Curl", category: "Arms", equipment: "Dumbbell", userId: null },
  { id: "std_ex_skull_crusher", name: "EZ-Bar Skull Crusher", category: "Arms", equipment: "Barbell", userId: null },

  // Core
  { id: "std_ex_hanging_knee_raise", name: "Hanging Knee Raise", category: "Core", equipment: "Bodyweight", userId: null },
  { id: "std_ex_plank", name: "Forearm Plank Hold", category: "Core", equipment: "Bodyweight", userId: null },
  { id: "std_ex_cable_woodchop", name: "Cable Woodchopper", category: "Core", equipment: "Cable", userId: null },
  { id: "std_ex_ab_wheel", name: "Ab Wheel Rollout", category: "Core", equipment: "Bodyweight", userId: null },
];

/**
 * Seeds the standard exercise catalog into IndexedDB if table is empty.
 * Pure write transaction; call outside of liveQuery contexts.
 */
export async function seedExerciseCatalog(): Promise<void> {
  const count = await db.exercises.count();
  if (count === 0) {
    const timestamp = "2026-01-01T00:00:00.000Z";
    const fullExercises: Exercise[] = STANDARD_EXERCISES.map((item) => ({
      ...item,
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
    await db.exercises.bulkPut(fullExercises);
  }
}

/**
 * Retrieves all available exercises for a user (standard catalog + user's custom exercises).
 * Pure read-only operation safe for liveQuery contexts.
 */
export async function getExercises(userId?: string): Promise<Exercise[]> {
  const allInDb = await db.exercises.toArray();

  if (allInDb.length === 0) {
    // If DB is empty, return standard static catalog
    const timestamp = "2026-01-01T00:00:00.000Z";
    return STANDARD_EXERCISES.map((item) => ({
      ...item,
      createdAt: timestamp,
      updatedAt: timestamp,
    })).sort((a, b) => a.name.localeCompare(b.name));
  }

  // Return standard library exercises (userId null or undefined) + exercises owned by userId
  const filtered = allInDb.filter((ex) => {
    if (!ex.userId) return true;
    return userId && ex.userId === userId;
  });

  return filtered.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Searches exercises by query string and optional category filter.
 * Case-insensitive substring matching.
 */
export async function searchExercises(
  query: string,
  category?: string,
  userId?: string
): Promise<Exercise[]> {
  const all = await getExercises(userId);
  const normalizedQuery = query.toLowerCase().trim();

  return all.filter((ex) => {
    const matchesQuery =
      normalizedQuery === "" || ex.name.toLowerCase().includes(normalizedQuery);
    const matchesCategory =
      !category || category === "All" || ex.category?.toLowerCase() === category.toLowerCase();
    return matchesQuery && matchesCategory;
  });
}

/**
 * Retrieves a single exercise by ID.
 * Pure read-only operation safe for liveQuery contexts.
 */
export async function getExerciseById(exerciseId: string): Promise<Exercise | undefined> {
  const found = await db.exercises.get(exerciseId);
  if (found) return found;

  const std = STANDARD_EXERCISES.find((e) => e.id === exerciseId);
  if (std) {
    const timestamp = "2026-01-01T00:00:00.000Z";
    return {
      ...std,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  return undefined;
}

/**
 * Creates a new custom exercise for a specific user and queues a sync mutation.
 */
export async function createCustomExercise(
  userId: string,
  data: {
    name: string;
    category?: string;
    equipment?: string;
  }
): Promise<Exercise> {
  if (!userId || typeof userId !== "string" || userId.trim() === "") {
    throw new Error("Cannot create exercise: userId is required.");
  }
  if (!data.name || data.name.trim() === "") {
    throw new Error("Exercise name cannot be empty.");
  }

  const now = new Date().toISOString();
  const newExercise: Exercise = {
    id: globalThis.crypto.randomUUID(),
    userId,
    name: data.name.trim(),
    category: data.category?.trim() || undefined,
    equipment: data.equipment?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };

  await db.transaction("rw", [db.exercises, db.syncQueue], async () => {
    await db.exercises.add(newExercise);

    const syncItem: SyncQueueItem = {
      id: globalThis.crypto.randomUUID(),
      userId,
      operation: "insert",
      collection: "exercises",
      entityId: newExercise.id,
      payload: newExercise,
      timestamp: Date.now(),
      status: "pending",
      attempts: 0,
    };
    await db.syncQueue.add(syncItem);
  });

  return newExercise;
}
