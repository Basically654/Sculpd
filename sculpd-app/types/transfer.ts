// types/transfer.ts
import { ExerciseLoadType } from "./models";

export const WORKOUT_EXPORT_IDENTIFIER = "sculpd-workout";
export const WORKOUT_BUNDLE_IDENTIFIER = "sculpd-workout-bundle";
export const WORKOUT_TRANSFER_VERSION = 1;

export interface ExportedExercise {
  name: string;
  category?: string;
  equipment?: string;
  loadType?: ExerciseLoadType;
  targetSets: number;
  targetReps: string;
  restSeconds: number;
  notes?: string;
}

export interface ExportedWorkout {
  name: string;
  description?: string;
  daysOfWeek?: string[];
  dayName?: string;
  focusTarget?: string;
  exercises: ExportedExercise[];
}

export interface SculpdWorkoutExport {
  format: typeof WORKOUT_EXPORT_IDENTIFIER;
  version: number;
  exportedAt: string;
  appVersion: string;
  workout: ExportedWorkout;
}

export interface SculpdWorkoutBundleExport {
  format: typeof WORKOUT_BUNDLE_IDENTIFIER;
  version: number;
  exportedAt: string;
  appVersion: string;
  workouts: ExportedWorkout[];
}

export interface WorkoutValidationResult {
  valid: boolean;
  error?: string;
  isBundle?: boolean;
  workouts?: ExportedWorkout[];
}

export interface ImportWorkoutOptions {
  customName?: string;
  overwriteIfDuplicate?: boolean;
}

export interface ImportWorkoutResult {
  success: boolean;
  routineId?: string;
  routineName?: string;
  exerciseCount?: number;
  createdCustomExercisesCount?: number;
  reusedExercisesCount?: number;
  error?: string;
}

export interface ImportBundleResult {
  success: boolean;
  importedWorkoutsCount: number;
  results: ImportWorkoutResult[];
  error?: string;
}
