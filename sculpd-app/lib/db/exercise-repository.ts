// lib/db/exercise-repository.ts
import { db } from "./index";
import { Exercise, SyncQueueItem } from "@/types/models";

/**
 * Standard starter catalog of exercises across primary muscle groups.
 * Provides a comprehensive, realistic baseline for lifters.
 */
export const STANDARD_EXERCISES: Omit<Exercise, "createdAt" | "updatedAt">[] = [
  // --- Chest ---
  { id: "std_ex_bench_press", name: "Barbell Bench Press", category: "Chest", equipment: "Barbell", userId: null },
  { id: "std_ex_incline_bb_press", name: "Incline Barbell Bench Press", category: "Chest", equipment: "Barbell", userId: null },
  { id: "std_ex_db_bench_press", name: "Flat Dumbbell Bench Press", category: "Chest", equipment: "Dumbbell", userId: null },
  { id: "std_ex_incline_db_press", name: "Incline Dumbbell Press", category: "Chest", equipment: "Dumbbell", userId: null },
  { id: "std_ex_cable_fly", name: "Cable Chest Fly", category: "Chest", equipment: "Cable", userId: null },
  { id: "std_ex_pec_deck", name: "Pec Deck Machine Fly", category: "Chest", equipment: "Machine", userId: null },
  { id: "std_ex_chest_press_machine", name: "Chest Press Machine", category: "Chest", equipment: "Machine", userId: null },
  { id: "std_ex_push_ups", name: "Push-Ups", category: "Chest", equipment: "Bodyweight", userId: null },
  { id: "std_ex_dips", name: "Chest Dips", category: "Chest", equipment: "Bodyweight", userId: null },

  // --- Back ---
  { id: "std_ex_deadlift", name: "Barbell Deadlift", category: "Back", equipment: "Barbell", userId: null },
  { id: "std_ex_trap_bar_deadlift", name: "Trap Bar Deadlift", category: "Back", equipment: "Barbell", userId: null },
  { id: "std_ex_lat_pulldown", name: "Neutral Grip Lat Pulldown", category: "Back", equipment: "Cable", userId: null },
  { id: "std_ex_wide_lat_pulldown", name: "Wide-Grip Lat Pulldown", category: "Back", equipment: "Cable", userId: null },
  { id: "std_ex_bent_over_row", name: "Barbell Bent-Over Row", category: "Back", equipment: "Barbell", userId: null },
  { id: "std_ex_db_row", name: "Single-Arm Dumbbell Row", category: "Back", equipment: "Dumbbell", userId: null },
  { id: "std_ex_seated_cable_row", name: "Seated Cable Row", category: "Back", equipment: "Cable", userId: null },
  { id: "std_ex_t_bar_row", name: "T-Bar Row", category: "Back", equipment: "Barbell", userId: null },
  { id: "std_ex_pull_ups", name: "Pull-Ups", category: "Back", equipment: "Bodyweight", userId: null },
  { id: "std_ex_chin_ups", name: "Chin-Ups", category: "Back", equipment: "Bodyweight", userId: null },
  { id: "std_ex_hyperextension", name: "Hyperextension (45° Back Extension)", category: "Back", equipment: "Bodyweight", userId: null },

  // --- Legs ---
  { id: "std_ex_squat", name: "Barbell Back Squat", category: "Legs", equipment: "Barbell", userId: null },
  { id: "std_ex_front_squat", name: "Barbell Front Squat", category: "Legs", equipment: "Barbell", userId: null },
  { id: "std_ex_romanian_deadlift", name: "Romanian Deadlift", category: "Legs", equipment: "Barbell", userId: null },
  { id: "std_ex_db_rdl", name: "Romanian Deadlift (Dumbbell)", category: "Legs", equipment: "Dumbbell", userId: null },
  { id: "std_ex_leg_press", name: "Leg Press", category: "Legs", equipment: "Machine", userId: null },
  { id: "std_ex_hack_squat", name: "Hack Squat", category: "Legs", equipment: "Machine", userId: null },
  { id: "std_ex_bulgarian_split_squat", name: "Bulgarian Split Squat", category: "Legs", equipment: "Dumbbell", userId: null },
  { id: "std_ex_walking_lunge", name: "Walking Dumbbell Lunge", category: "Legs", equipment: "Dumbbell", userId: null },
  { id: "std_ex_leg_extension", name: "Leg Extension", category: "Legs", equipment: "Machine", userId: null },
  { id: "std_ex_seated_leg_curl", name: "Seated Leg Curl", category: "Legs", equipment: "Machine", userId: null },
  { id: "std_ex_lying_leg_curl", name: "Lying Leg Curl", category: "Legs", equipment: "Machine", userId: null },
  { id: "std_ex_standing_calf_raise", name: "Standing Calf Raise", category: "Legs", equipment: "Machine", userId: null },
  { id: "std_ex_seated_calf_raise", name: "Seated Calf Raise", category: "Legs", equipment: "Machine", userId: null },
  { id: "std_ex_hip_thrust", name: "Barbell Hip Thrust", category: "Legs", equipment: "Barbell", userId: null },
  { id: "std_ex_cable_kickback", name: "Cable Glute Kickback", category: "Legs", equipment: "Cable", userId: null },

  // --- Shoulders ---
  { id: "std_ex_overhead_press", name: "Overhead Barbell Press", category: "Shoulders", equipment: "Barbell", userId: null },
  { id: "std_ex_db_shoulder_press", name: "Dumbbell Shoulder Press", category: "Shoulders", equipment: "Dumbbell", userId: null },
  { id: "std_ex_arnold_press", name: "Arnold Press", category: "Shoulders", equipment: "Dumbbell", userId: null },
  { id: "std_ex_lateral_raise", name: "Dumbbell Lateral Raise", category: "Shoulders", equipment: "Dumbbell", userId: null },
  { id: "std_ex_cable_lateral_raise", name: "Cable Lateral Raise", category: "Shoulders", equipment: "Cable", userId: null },
  { id: "std_ex_face_pull", name: "Cable Face Pull", category: "Shoulders", equipment: "Cable", userId: null },
  { id: "std_ex_reverse_pec_deck", name: "Reverse Pec Deck (Rear Delt)", category: "Shoulders", equipment: "Machine", userId: null },
  { id: "std_ex_db_shrug", name: "Dumbbell Shrug", category: "Shoulders", equipment: "Dumbbell", userId: null },

  // --- Arms ---
  { id: "std_ex_db_bicep_curl", name: "Dumbbell Bicep Curl", category: "Arms", equipment: "Dumbbell", userId: null },
  { id: "std_ex_bb_bicep_curl", name: "Barbell Bicep Curl", category: "Arms", equipment: "Barbell", userId: null },
  { id: "std_ex_hammer_curl", name: "Dumbbell Hammer Curl", category: "Arms", equipment: "Dumbbell", userId: null },
  { id: "std_ex_incline_db_curl", name: "Incline Dumbbell Curl", category: "Arms", equipment: "Dumbbell", userId: null },
  { id: "std_ex_preacher_curl", name: "Preacher Curl", category: "Arms", equipment: "Barbell", userId: null },
  { id: "std_ex_tricep_rope_pushdown", name: "Tricep Rope Pushdown", category: "Arms", equipment: "Cable", userId: null },
  { id: "std_ex_skull_crusher", name: "EZ-Bar Skull Crusher", category: "Arms", equipment: "Barbell", userId: null },
  { id: "std_ex_overhead_tricep_ext", name: "Overhead Dumbbell Tricep Extension", category: "Arms", equipment: "Dumbbell", userId: null },
  { id: "std_ex_tricep_dips", name: "Tricep Dips", category: "Arms", equipment: "Bodyweight", userId: null },
  { id: "std_ex_close_grip_bench", name: "Close-Grip Barbell Bench Press", category: "Arms", equipment: "Barbell", userId: null },

  // --- Core ---
  { id: "std_ex_hanging_knee_raise", name: "Hanging Knee Raise", category: "Core", equipment: "Bodyweight", userId: null },
  { id: "std_ex_hanging_leg_raise", name: "Hanging Leg Raise", category: "Core", equipment: "Bodyweight", userId: null },
  { id: "std_ex_plank", name: "Forearm Plank Hold", category: "Core", equipment: "Bodyweight", userId: null },
  { id: "std_ex_cable_woodchop", name: "Cable Woodchopper", category: "Core", equipment: "Cable", userId: null },
  { id: "std_ex_cable_crunch", name: "Cable Kneeling Crunch", category: "Core", equipment: "Cable", userId: null },
  { id: "std_ex_ab_wheel", name: "Ab Wheel Rollout", category: "Core", equipment: "Bodyweight", userId: null },
  { id: "std_ex_russian_twist", name: "Russian Twist", category: "Core", equipment: "Bodyweight", userId: null },
];

/**
 * Heuristically infers category and equipment for exercises lacking metadata.
 */
export function inferCategoryAndEquipment(name: string): { category: string; equipment: string } {
  const n = name.toLowerCase();
  let category = "Other";
  let equipment = "Other";

  // Equipment inference
  if (n.includes("barbell") || n.includes("ez-bar") || n.includes("trap bar") || n.includes("squat") || n.includes("deadlift") || n.includes("bench press")) {
    equipment = "Barbell";
  } else if (n.includes("dumbbell") || n.includes("db")) {
    equipment = "Dumbbell";
  } else if (n.includes("cable") || n.includes("pulldown") || n.includes("woodchop") || n.includes("kickback") || n.includes("pushdown")) {
    equipment = "Cable";
  } else if (n.includes("machine") || (n.includes("press") && n.includes("leg")) || n.includes("extension") || (n.includes("curl") && n.includes("seated")) || n.includes("hack") || n.includes("pec deck")) {
    equipment = "Machine";
  } else if (n.includes("push-up") || n.includes("pull-up") || n.includes("chin-up") || n.includes("dips") || n.includes("plank") || n.includes("hanging") || n.includes("bodyweight") || n.includes("hyperextension") || n.includes("wheel") || n.includes("twist")) {
    equipment = "Bodyweight";
  }

  // Category inference
  if (n.includes("bench") || n.includes("chest") || n.includes("fly") || n.includes("pec") || n.includes("push-up")) {
    category = "Chest";
  } else if (n.includes("deadlift") || n.includes("pulldown") || n.includes("pull-up") || n.includes("chin-up") || n.includes("row") || n.includes("lat") || n.includes("back") || n.includes("hyperextension")) {
    category = "Back";
  } else if (n.includes("squat") || n.includes("leg") || n.includes("calf") || n.includes("calves") || n.includes("thrust") || n.includes("rdl") || n.includes("lunge") || n.includes("glute") || n.includes("hamstring") || n.includes("quad") || n.includes("kickback")) {
    category = "Legs";
  } else if (n.includes("shoulder") || n.includes("overhead") || n.includes("lateral raise") || n.includes("face pull") || n.includes("arnold") || n.includes("shrug") || n.includes("delt")) {
    category = "Shoulders";
  } else if (n.includes("curl") || n.includes("bicep") || n.includes("tricep") || n.includes("skull crusher") || n.includes("dips") || n.includes("close-grip") || n.includes("arm")) {
    category = "Arms";
  } else if (n.includes("core") || n.includes("plank") || n.includes("knee raise") || n.includes("leg raise") || n.includes("ab") || n.includes("woodchop") || n.includes("crunch") || n.includes("twist")) {
    category = "Core";
  }

  return { category, equipment };
}

/**
 * Seeds the standard exercise catalog into IndexedDB and heals legacy exercises lacking categories.
 * Pure write transaction; safe to call on startup or library open.
 */
export async function seedExerciseCatalog(): Promise<void> {
  const timestamp = "2026-01-01T00:00:00.000Z";
  const fullExercises: Exercise[] = STANDARD_EXERCISES.map((item) => ({
    ...item,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));

  // Always ensure all standard exercises exist in db.exercises
  await db.exercises.bulkPut(fullExercises);

  // Migrate / patch any existing exercises in db.exercises that lack a category
  try {
    const unCategorized = await db.exercises.filter((ex) => !ex.category || ex.category.trim() === "").toArray();
    if (unCategorized.length > 0) {
      await db.transaction("rw", db.exercises, async () => {
        for (const item of unCategorized) {
          const inferred = inferCategoryAndEquipment(item.name);
          await db.exercises.update(item.id, {
            category: inferred.category,
            equipment: item.equipment || inferred.equipment,
          });
        }
      });
    }
  } catch (err) {
    console.warn("Non-fatal note while healing exercise categories:", err);
  }
}

/**
 * Retrieves all available exercises for a user (standard catalog + user's custom exercises).
 * Deduplicates shared library entries by name.
 * Pure read-only operation safe for liveQuery contexts.
 */
export async function getExercises(userId?: string): Promise<Exercise[]> {
  const timestamp = "2026-01-01T00:00:00.000Z";
  const standardMapped: Exercise[] = STANDARD_EXERCISES.map((item) => ({
    ...item,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));

  const allInDb = await db.exercises.toArray();

  // Create map seeded with standard catalog
  const exerciseMap = new Map<string, Exercise>();
  for (const std of standardMapped) {
    exerciseMap.set(std.id, std);
  }

  // Deduplication lookup for shared library exercises by normalized name
  const nameToStdId = new Map<string, string>();
  for (const std of standardMapped) {
    nameToStdId.set(std.name.toLowerCase().trim(), std.id);
  }

  for (const ex of allInDb) {
    // If it's a custom exercise belonging to another user, isolate it
    if (ex.userId && (!userId || ex.userId !== userId)) {
      continue;
    }

    // If it's a custom exercise for this active user, include it
    if (ex.userId && userId && ex.userId === userId) {
      exerciseMap.set(ex.id, ex);
      continue;
    }

    // For shared/legacy exercises without a userId:
    const normName = ex.name.toLowerCase().trim();
    const existingStdId = nameToStdId.get(normName);

    if (existingStdId && existingStdId !== ex.id) {
      // Avoid duplicate display; standard catalog version takes precedence
      continue;
    }

    // Ensure category and equipment are present
    if (!ex.category) {
      const inferred = inferCategoryAndEquipment(ex.name);
      ex.category = inferred.category;
      if (!ex.equipment) ex.equipment = inferred.equipment;
    }

    exerciseMap.set(ex.id, ex);
  }

  return Array.from(exerciseMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Searches exercises by query string and optional category filter.
 * Case-insensitive matching across exercise name, equipment, and category.
 */
export async function searchExercises(
  query: string,
  category?: string,
  userId?: string
): Promise<Exercise[]> {
  const all = await getExercises(userId);
  const normalizedQuery = query.toLowerCase().trim();

  return all.filter((ex) => {
    // Search query matches name, equipment, or category
    const matchesQuery =
      normalizedQuery === "" ||
      ex.name.toLowerCase().includes(normalizedQuery) ||
      (ex.equipment && ex.equipment.toLowerCase().includes(normalizedQuery)) ||
      (ex.category && ex.category.toLowerCase().includes(normalizedQuery));

    // Category filter matches
    if (!category || category === "All") {
      return matchesQuery;
    }

    const catLower = category.toLowerCase();
    const exCatLower = ex.category?.toLowerCase() || "";

    const matchesCategory =
      catLower === "other"
        ? exCatLower === "other" || exCatLower === ""
        : exCatLower === catLower;

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
