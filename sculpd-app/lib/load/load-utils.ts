// lib/load/load-utils.ts
import { Exercise, RoutineExerciseConfig, WorkoutSessionExerciseSnapshot, WorkoutSet } from "@/types/models";

/**
 * Determines whether an exercise is a bodyweight movement based on its loadType or equipment.
 */
export function isBodyweightExercise(
  exercise?:
    | Exercise
    | RoutineExerciseConfig
    | WorkoutSessionExerciseSnapshot
    | { loadType?: string; equipment?: string }
    | null
): boolean {
  if (!exercise) return false;
  if (exercise.loadType === "bodyweight") return true;
  if ("equipment" in exercise && exercise.equipment) {
    return exercise.equipment.toLowerCase() === "bodyweight";
  }
  return false;
}

/**
 * Calculates the effective total load for an exercise set:
 * - For bodyweight exercises: bodyweight + addedWeight (e.g. 195 + 15 = 210 lbs; or 195 + 0 = 195 lbs).
 * - For standard weighted exercises: set.weight (e.g. 185 lbs).
 *
 * Guaranteed backward-compatible with legacy historical sets.
 */
export function getEffectiveLoad(set: {
  weight: number;
  reps?: number;
  bodyweight?: number | null;
  addedWeight?: number | null;
}): number {
  if (typeof set.bodyweight === "number" && set.bodyweight > 0) {
    const added =
      typeof set.addedWeight === "number"
        ? set.addedWeight
        : typeof set.weight === "number" && !isNaN(set.weight)
        ? set.weight
        : 0;
    return set.bodyweight + added;
  }
  return typeof set.weight === "number" && !isNaN(set.weight) ? set.weight : 0;
}

/**
 * Formats the load label for display on the gym floor:
 * - Bodyweight with added weight: "BW + 15 lbs"
 * - Pure bodyweight: "BW"
 * - Standard weighted: "185 lbs"
 */
export function formatSetLoad(
  set: {
    weight: number;
    reps?: number;
    bodyweight?: number | null;
    addedWeight?: number | null;
  },
  isBodyweight?: boolean
): string {
  const isBW =
    isBodyweight || (typeof set.bodyweight === "number" && set.bodyweight > 0);

  if (isBW) {
    const added =
      typeof set.addedWeight === "number"
        ? set.addedWeight
        : typeof set.weight === "number"
        ? set.weight
        : 0;

    if (added > 0) {
      return `BW + ${added} lbs`;
    }
    return "BW";
  }

  return `${set.weight} lbs`;
}

/**
 * Formats a completed set summary, e.g. "BW + 15 lbs × 8" or "185 lbs × 5".
 */
export function formatSetSummary(
  set: {
    weight: number;
    reps: number;
    bodyweight?: number | null;
    addedWeight?: number | null;
  },
  isBodyweight?: boolean
): string {
  const loadStr = formatSetLoad(set, isBodyweight);
  return `${loadStr} × ${set.reps}`;
}
