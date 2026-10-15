// lib/workout/preview-utils.ts
import { Exercise } from "@/types/models";

export interface TargetPrescription {
  value: number | string | null;
  display: string;
  isAvailable: boolean;
}

export interface NextExercisePreviewData {
  id: string;
  name: string;
  category?: string;
  targetSets: TargetPrescription;
  targetReps: TargetPrescription;
  targetWeight: TargetPrescription;
  notes?: string | null;
}

/**
 * Determines whether the set just logged was the final prescribed set of an exercise.
 * If targetSets is not configured or <= 0, the final set cannot be determined.
 */
export function isFinalExerciseSet(
  completedSetsCount: number,
  targetSetsCount?: number | null
): boolean {
  return (
    typeof targetSetsCount === "number" &&
    targetSetsCount > 0 &&
    completedSetsCount >= targetSetsCount
  );
}

/**
 * Returns the next exercise in the active session's ordered exercise list.
 * Respects custom routine ordering and immutable workout-session snapshots.
 * Returns null if the current exercise is the last exercise in the session.
 */
export function getNextExerciseInSession(
  exercises: Exercise[],
  currentExerciseIndex: number
): Exercise | null {
  if (!Array.isArray(exercises) || exercises.length === 0) return null;
  if (currentExerciseIndex < 0 || currentExerciseIndex >= exercises.length - 1) {
    return null;
  }
  return exercises[currentExerciseIndex + 1] || null;
}

/**
 * Resolves prescribed target weight for an exercise using the app's existing model.
 * Does not invent targets or silently substitute the last logged weight.
 * If a prescribed target is unavailable, returns a neutral fallback "Target not set".
 */
export function getPrescribedTargetWeight(
  exercise?: Exercise | null
): TargetPrescription {
  if (!exercise) {
    return { value: null, display: "Target not set", isAvailable: false };
  }

  const weight = (exercise as any).targetWeight ?? (exercise as any).prescribedWeight;

  if (typeof weight === "number" && !isNaN(weight) && weight > 0) {
    return {
      value: weight,
      display: `${weight} lbs`,
      isAvailable: true,
    };
  }

  if (typeof weight === "string" && weight.trim() !== "") {
    return {
      value: weight.trim(),
      display: weight.trim().toLowerCase().includes("lb")
        ? weight.trim()
        : `${weight.trim()} lbs`,
      isAvailable: true,
    };
  }

  return {
    value: null,
    display: "Target not set",
    isAvailable: false,
  };
}

/**
 * Resolves prescribed target sets for an exercise.
 */
export function getPrescribedTargetSets(
  exercise?: Exercise | null
): TargetPrescription {
  if (
    exercise &&
    typeof exercise.targetSets === "number" &&
    exercise.targetSets > 0
  ) {
    return {
      value: exercise.targetSets,
      display: `${exercise.targetSets} ${exercise.targetSets === 1 ? "set" : "sets"}`,
      isAvailable: true,
    };
  }

  return {
    value: null,
    display: "Target not set",
    isAvailable: false,
  };
}

/**
 * Resolves prescribed target reps for an exercise.
 */
export function getPrescribedTargetReps(
  exercise?: Exercise | null
): TargetPrescription {
  if (exercise && exercise.targetReps && String(exercise.targetReps).trim() !== "") {
    const trimmed = String(exercise.targetReps).trim();
    return {
      value: trimmed,
      display: `${trimmed} reps`,
      isAvailable: true,
    };
  }

  return {
    value: null,
    display: "Target not set",
    isAvailable: false,
  };
}

/**
 * Extracts coaching cues or exercise notes, formatting them cleanly for compact preview.
 */
export function getNextExerciseNotes(
  exercise?: Exercise | null
): string | null {
  if (!exercise) return null;
  const raw = exercise.coachingCue || (exercise as any).notes;
  if (typeof raw === "string" && raw.trim() !== "") {
    return raw.trim();
  }
  return null;
}

/**
 * Assembles all preview metadata for the next exercise in a single safe structure.
 */
export function getNextExercisePreviewData(
  exercise: Exercise
): NextExercisePreviewData {
  return {
    id: exercise.id,
    name: exercise.name || "Next Exercise",
    category: exercise.category,
    targetSets: getPrescribedTargetSets(exercise),
    targetReps: getPrescribedTargetReps(exercise),
    targetWeight: getPrescribedTargetWeight(exercise),
    notes: getNextExerciseNotes(exercise),
  };
}
