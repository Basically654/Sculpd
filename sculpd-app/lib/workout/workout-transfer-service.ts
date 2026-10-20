// lib/workout/workout-transfer-service.ts
import { db } from "@/lib/db";
import {
  Routine,
  Exercise,
  RoutineExerciseConfig,
  WorkoutSession,
  WorkoutSet,
  SyncQueueItem,
  ExerciseLoadType,
} from "@/types/models";
import {
  WORKOUT_EXPORT_IDENTIFIER,
  WORKOUT_BUNDLE_IDENTIFIER,
  WORKOUT_TRANSFER_VERSION,
  ExportedExercise,
  ExportedWorkout,
  SculpdWorkoutExport,
  SculpdWorkoutBundleExport,
  WorkoutValidationResult,
  ImportWorkoutOptions,
  ImportWorkoutResult,
  ImportBundleResult,
} from "@/types/transfer";
import { generateUUID } from "@/lib/crypto/uuid";
import { resilientTransaction, ensureDbOpen } from "@/lib/db/transaction";
import {
  getRoutineWithExercises,
  getUserRoutines,
} from "@/lib/db/routine-repository";
import {
  inferCategoryAndEquipment,
  getExercises,
} from "@/lib/db/exercise-repository";
import {
  inferRoutineName,
  inferExerciseName,
  APP_VERSION,
} from "@/lib/db/backup";

function assertUserId(userId: string) {
  if (!userId || typeof userId !== "string" || userId.trim() === "") {
    throw new Error("Strict User Isolation Error: userId is required.");
  }
}

/**
 * Sanitizes a string into a URL-friendly and filename-safe slug.
 */
export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-") // Replace spaces with -
    .replace(/[^\w-]+/g, "") // Remove all non-word chars
    .replace(/--+/g, "-") // Replace multiple - with single -
    .replace(/^-+/, "") // Trim - from start of text
    .replace(/-+$/, "") || "workout"; // Trim - from end of text
}

/**
 * Generates a clean filename for exporting a workout.
 */
export function getWorkoutFilename(
  workoutName: string,
  date: Date = new Date()
): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const slug = slugify(workoutName);
  return `sculpd-workout-${slug}-${year}${month}${day}.json`;
}

/**
 * Generates a clean filename for exporting a workout bundle.
 */
export function getWorkoutBundleFilename(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  return `sculpd-workouts-bundle-${year}${month}${day}.json`;
}

/**
 * Exports a single routine/workout template into a portable SculpdWorkoutExport object.
 * Strips all internal database IDs, foreign keys, and user identity credentials.
 */
export async function exportWorkout(
  routineId: string
): Promise<SculpdWorkoutExport> {
  await ensureDbOpen();

  const routineWithExercises = await getRoutineWithExercises(routineId);
  if (!routineWithExercises) {
    throw new Error(`Workout routine not found with id: ${routineId}`);
  }

  const exportedExercises: ExportedExercise[] = (
    routineWithExercises.exercises || []
  ).map((item) => {
    const rawEx = item.exercise;
    const name = inferExerciseName(rawEx || { id: item.exerciseId });
    const { category: inferredCat, equipment: inferredEq } =
      inferCategoryAndEquipment(name);

    const category = rawEx?.category || inferredCat;
    const equipment = rawEx?.equipment || inferredEq;
    const loadType: ExerciseLoadType =
      item.loadType ||
      rawEx?.loadType ||
      (equipment.toLowerCase() === "bodyweight" ? "bodyweight" : "weighted");

    return {
      name,
      category,
      equipment,
      loadType,
      targetSets: Math.max(1, Number(item.targetSets) || 3),
      targetReps: String(item.targetReps || "8-10").trim(),
      restSeconds: Math.max(0, Number(item.restSeconds) || 90),
      notes: item.notes?.trim() || undefined,
    };
  });

  const workout: ExportedWorkout = {
    name: inferRoutineName(routineWithExercises),
    description: routineWithExercises.description?.trim() || undefined,
    daysOfWeek: routineWithExercises.daysOfWeek,
    dayName: routineWithExercises.dayName?.trim() || undefined,
    focusTarget: routineWithExercises.focusTarget?.trim() || undefined,
    exercises: exportedExercises,
  };

  return {
    format: WORKOUT_EXPORT_IDENTIFIER,
    version: WORKOUT_TRANSFER_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    workout,
  };
}

/**
 * Exports all routines belonging to a user as a bundle.
 */
export async function exportAllWorkouts(
  userId: string
): Promise<SculpdWorkoutBundleExport> {
  assertUserId(userId);
  await ensureDbOpen();

  const routines = await getUserRoutines(userId);
  const workouts: ExportedWorkout[] = [];

  for (const r of routines) {
    const full = await getRoutineWithExercises(r.id);
    if (!full) continue;

    const exportedExercises: ExportedExercise[] = (full.exercises || []).map(
      (item) => {
        const rawEx = item.exercise;
        const name = inferExerciseName(rawEx || { id: item.exerciseId });
        const { category: inferredCat, equipment: inferredEq } =
          inferCategoryAndEquipment(name);

        const category = rawEx?.category || inferredCat;
        const equipment = rawEx?.equipment || inferredEq;
        const loadType: ExerciseLoadType =
          item.loadType ||
          rawEx?.loadType ||
          (equipment.toLowerCase() === "bodyweight" ? "bodyweight" : "weighted");

        return {
          name,
          category,
          equipment,
          loadType,
          targetSets: Math.max(1, Number(item.targetSets) || 3),
          targetReps: String(item.targetReps || "8-10").trim(),
          restSeconds: Math.max(0, Number(item.restSeconds) || 90),
          notes: item.notes?.trim() || undefined,
        };
      }
    );

    workouts.push({
      name: inferRoutineName(full),
      description: full.description?.trim() || undefined,
      daysOfWeek: full.daysOfWeek,
      dayName: full.dayName?.trim() || undefined,
      focusTarget: full.focusTarget?.trim() || undefined,
      exercises: exportedExercises,
    });
  }

  return {
    format: WORKOUT_BUNDLE_IDENTIFIER,
    version: WORKOUT_TRANSFER_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    workouts,
  };
}

/**
 * Exports a completed workout session from workout history as a portable routine.
 * Allows a user to share the workout they just completed with a friend.
 */
export async function exportWorkoutSessionAsRoutine(
  userId: string,
  sessionId: string
): Promise<SculpdWorkoutExport> {
  assertUserId(userId);
  await ensureDbOpen();

  const session = await db.workoutSessions.get(sessionId);
  if (!session || session.userId !== userId) {
    throw new Error(`Workout session not found: ${sessionId}`);
  }

  // 1. If the session has snapshots saved at workout start time, use them
  let exportedExercises: ExportedExercise[] = [];

  if (session.exerciseSnapshots && session.exerciseSnapshots.length > 0) {
    exportedExercises = session.exerciseSnapshots.map((snap) => {
      const { category, equipment } = inferCategoryAndEquipment(snap.name);
      return {
        name: snap.name,
        category,
        equipment,
        loadType: snap.loadType || "weighted",
        targetSets: Math.max(1, Number(snap.targetSets) || 3),
        targetReps: String(snap.targetReps || "8-10").trim(),
        restSeconds: Math.max(0, Number(snap.restSeconds) || 90),
        notes: snap.notes?.trim() || undefined,
      };
    });
  } else {
    // 2. Otherwise aggregate logged sets
    const sets = await db.sets
      .where("workoutSessionId")
      .equals(sessionId)
      .sortBy("createdAt");

    const exerciseMap = new Map<string, { count: number; repStr: string }>();
    for (const set of sets) {
      const existing = exerciseMap.get(set.exerciseId);
      if (!existing) {
        exerciseMap.set(set.exerciseId, {
          count: 1,
          repStr: String(set.reps),
        });
      } else {
        existing.count += 1;
      }
    }

    for (const [exId, data] of exerciseMap.entries()) {
      const ex = await db.exercises.get(exId);
      const name = inferExerciseName(ex || { id: exId });
      const { category, equipment } = inferCategoryAndEquipment(name);
      exportedExercises.push({
        name,
        category: ex?.category || category,
        equipment: ex?.equipment || equipment,
        loadType: ex?.loadType || "weighted",
        targetSets: data.count,
        targetReps: data.repStr,
        restSeconds: 90,
      });
    }
  }

  const routineName = session.routineName || "Completed Workout";
  const workout: ExportedWorkout = {
    name: routineName,
    description: session.notes || `Completed on ${session.startedAt.split("T")[0]}`,
    exercises: exportedExercises,
  };

  return {
    format: WORKOUT_EXPORT_IDENTIFIER,
    version: WORKOUT_TRANSFER_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    workout,
  };
}

/**
 * Validates and normalizes raw JSON or an object into verified ExportedWorkout list.
 * Gracefully parses single workout exports, bundles, arrays, or raw workout objects.
 */
export function validateWorkoutData(raw: string | any): WorkoutValidationResult {
  if (!raw) {
    return { valid: false, error: "Empty workout data provided." };
  }

  let parsed: any;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw.trim());
    } catch {
      return {
        valid: false,
        error: "Invalid JSON. Please check the file or copied text.",
      };
    }
  } else {
    parsed = raw;
  }

  if (!parsed || typeof parsed !== "object") {
    return { valid: false, error: "Workout payload must be a valid JSON object." };
  }

  // Helper to validate and normalize a single ExportedWorkout object
  const normalizeWorkout = (w: any, index: number): ExportedWorkout | null => {
    if (!w || typeof w !== "object") return null;

    const rawName = typeof w.name === "string" ? w.name.trim() : "";
    const name = rawName || `Imported Workout ${index + 1}`;

    const rawExercises = Array.isArray(w.exercises) ? w.exercises : [];
    const exercises: ExportedExercise[] = rawExercises
      .map((ex: any) => {
        if (!ex) return null;
        const exName =
          typeof ex.name === "string" && ex.name.trim().length > 0
            ? ex.name.trim()
            : inferExerciseName(ex);

        const { category: infCat, equipment: infEq } =
          inferCategoryAndEquipment(exName);

        const category = typeof ex.category === "string" ? ex.category : infCat;
        const equipment = typeof ex.equipment === "string" ? ex.equipment : infEq;
        const loadType: ExerciseLoadType =
          ex.loadType === "bodyweight" || equipment.toLowerCase() === "bodyweight"
            ? "bodyweight"
            : "weighted";

        return {
          name: exName,
          category,
          equipment,
          loadType,
          targetSets: Math.max(1, Number(ex.targetSets) || 3),
          targetReps:
            typeof ex.targetReps === "string" && ex.targetReps.trim().length > 0
              ? ex.targetReps.trim()
              : "8-10",
          restSeconds: Math.max(0, Number(ex.restSeconds) || 90),
          notes: typeof ex.notes === "string" ? ex.notes.trim() : undefined,
        };
      })
      .filter((ex: any): ex is ExportedExercise => ex !== null);

    return {
      name,
      description: typeof w.description === "string" ? w.description.trim() : undefined,
      daysOfWeek: Array.isArray(w.daysOfWeek) ? w.daysOfWeek : undefined,
      dayName: typeof w.dayName === "string" ? w.dayName.trim() : undefined,
      focusTarget: typeof w.focusTarget === "string" ? w.focusTarget.trim() : undefined,
      exercises,
    };
  };

  // Case 1: Standard single export ({ format: "sculpd-workout", workout: { ... } })
  if (
    parsed.format === WORKOUT_EXPORT_IDENTIFIER ||
    (parsed.workout && typeof parsed.workout === "object")
  ) {
    const normalized = normalizeWorkout(parsed.workout, 0);
    if (!normalized) {
      return {
        valid: false,
        error: "Missing or invalid 'workout' object in payload.",
      };
    }
    return {
      valid: true,
      isBundle: false,
      workouts: [normalized],
    };
  }

  // Case 2: Multi-workout bundle ({ format: "sculpd-workout-bundle", workouts: [ ... ] })
  if (
    parsed.format === WORKOUT_BUNDLE_IDENTIFIER ||
    (Array.isArray(parsed.workouts) && parsed.workouts.length > 0)
  ) {
    const list = Array.isArray(parsed.workouts) ? parsed.workouts : [];
    const normalizedList = list
      .map((w: any, idx: number) => normalizeWorkout(w, idx))
      .filter((w: any): w is ExportedWorkout => w !== null);

    if (normalizedList.length === 0) {
      return {
        valid: false,
        error: "Workout bundle does not contain any valid workouts.",
      };
    }

    return {
      valid: true,
      isBundle: true,
      workouts: normalizedList,
    };
  }

  // Case 3: Raw array of workouts
  if (Array.isArray(parsed)) {
    const normalizedList = parsed
      .map((w: any, idx: number) => normalizeWorkout(w, idx))
      .filter((w: any): w is ExportedWorkout => w !== null);

    if (normalizedList.length === 0) {
      return { valid: false, error: "No valid workouts found in JSON array." };
    }

    return {
      valid: true,
      isBundle: normalizedList.length > 1,
      workouts: normalizedList,
    };
  }

  // Case 4: Raw single workout object (has 'name' or 'exercises')
  if (
    typeof parsed.name === "string" ||
    Array.isArray(parsed.exercises)
  ) {
    const normalized = normalizeWorkout(parsed, 0);
    if (normalized) {
      return {
        valid: true,
        isBundle: false,
        workouts: [normalized],
      };
    }
  }

  return {
    valid: false,
    error:
      "Unrecognized workout file format. Please upload a valid Sculp'd workout JSON.",
  };
}

/**
 * Imports a single workout into the specified athlete's profile.
 * - Reuses existing catalog/custom exercises when names match (case-insensitive).
 * - Creates new custom exercises for non-existent exercises under the athlete's userId.
 * - Creates Routine and RoutineExerciseConfig records.
 * - Strictly isolates data to the active athlete's userId.
 * - Queues sync mutations for offline/cloud sync integrity.
 */
export async function importWorkout(
  userId: string,
  workoutData: ExportedWorkout,
  options?: ImportWorkoutOptions
): Promise<ImportWorkoutResult> {
  assertUserId(userId);
  await ensureDbOpen();

  if (!workoutData || typeof workoutData !== "object") {
    return { success: false, error: "Invalid workout data." };
  }

  const existingRoutines = await db.routines.where("userId").equals(userId).toArray();

  // Determine workout name, appending copy suffix if duplicate and not overwritten
  let routineName = (options?.customName || workoutData.name || "Imported Workout").trim();
  const nameCollision = existingRoutines.some(
    (r) => r.name.toLowerCase() === routineName.toLowerCase()
  );

  if (nameCollision && !options?.overwriteIfDuplicate && !options?.customName) {
    routineName = `${routineName} (Imported)`;
  }

  const now = new Date().toISOString();
  const routineId = generateUUID();
  const displayOrder = existingRoutines.length + 1;

  const routine: Routine = {
    id: routineId,
    userId,
    name: routineName,
    description: workoutData.description?.trim() || undefined,
    daysOfWeek: workoutData.daysOfWeek,
    dayName: workoutData.dayName?.trim() || undefined,
    focusTarget: workoutData.focusTarget?.trim() || undefined,
    displayOrder,
    createdAt: now,
    updatedAt: now,
  };

  // Pre-load all available exercises for exercise resolution (standard catalog + user's custom exercises)
  const allExercises = await getExercises(userId);

  // Helper map for case-insensitive lookup
  const exerciseLookup = new Map<string, Exercise>();
  for (const ex of allExercises) {
    if (ex.name) {
      exerciseLookup.set(ex.name.toLowerCase().trim(), ex);
    }
  }

  const newExercisesToCreate: Exercise[] = [];
  const exerciseConfigsToCreate: RoutineExerciseConfig[] = [];
  const syncItemsToCreate: SyncQueueItem[] = [];

  let createdCustomExercisesCount = 0;
  let reusedExercisesCount = 0;

  const exercisesList = Array.isArray(workoutData.exercises) ? workoutData.exercises : [];

  for (let idx = 0; idx < exercisesList.length; idx++) {
    const item = exercisesList[idx];
    const cleanName = (item.name || `Exercise ${idx + 1}`).trim();
    const lookupKey = cleanName.toLowerCase();

    let resolvedExercise = exerciseLookup.get(lookupKey);

    if (resolvedExercise) {
      reusedExercisesCount++;
    } else {
      // Create new custom exercise for this user
      const { category: infCat, equipment: infEq } = inferCategoryAndEquipment(cleanName);
      const newExId = generateUUID();
      resolvedExercise = {
        id: newExId,
        name: cleanName,
        category: item.category || infCat,
        equipment: item.equipment || infEq,
        loadType: item.loadType || "weighted",
        userId,
        createdAt: now,
        updatedAt: now,
      };

      newExercisesToCreate.push(resolvedExercise);
      exerciseLookup.set(lookupKey, resolvedExercise);
      createdCustomExercisesCount++;

      // Queue sync item for custom exercise
      syncItemsToCreate.push({
        id: generateUUID(),
        userId,
        operation: "insert",
        collection: "exercises",
        entityId: resolvedExercise.id,
        payload: JSON.parse(JSON.stringify(resolvedExercise)),
        timestamp: Date.now(),
        status: "pending",
        attempts: 0,
      });
    }

    const configId = generateUUID();
    const config: RoutineExerciseConfig = {
      id: configId,
      routineId,
      exerciseId: resolvedExercise.id,
      displayOrder: idx + 1,
      targetSets: Math.max(1, Number(item.targetSets) || 3),
      targetReps: String(item.targetReps || "8-10").trim(),
      restSeconds: Math.max(0, Number(item.restSeconds) || 90),
      loadType: item.loadType || resolvedExercise.loadType || "weighted",
      notes: item.notes?.trim() || undefined,
      userId,
      createdAt: now,
      updatedAt: now,
    };

    exerciseConfigsToCreate.push(config);

    syncItemsToCreate.push({
      id: generateUUID(),
      userId,
      operation: "insert",
      collection: "routine_exercises",
      entityId: config.id,
      payload: JSON.parse(JSON.stringify(config)),
      timestamp: Date.now(),
      status: "pending",
      attempts: 0,
    });
  }

  // Queue sync item for routine
  syncItemsToCreate.push({
    id: generateUUID(),
    userId,
    operation: "insert",
    collection: "routines",
    entityId: routine.id,
    payload: JSON.parse(JSON.stringify(routine)),
    timestamp: Date.now(),
    status: "pending",
    attempts: 0,
  });

  // Execute resilient transaction
  await resilientTransaction(
    "importWorkout",
    [db.routines, db.routineExercises, db.exercises, db.syncQueue],
    async () => {
      await Promise.all([
        db.routines.add(routine),
        exerciseConfigsToCreate.length > 0
          ? db.routineExercises.bulkAdd(exerciseConfigsToCreate)
          : Promise.resolve(),
        newExercisesToCreate.length > 0
          ? db.exercises.bulkAdd(newExercisesToCreate)
          : Promise.resolve(),
        db.syncQueue.bulkAdd(syncItemsToCreate),
      ]);
    },
    async () => {
      await db.routines.add(routine);
      if (exerciseConfigsToCreate.length > 0) {
        await db.routineExercises.bulkAdd(exerciseConfigsToCreate);
      }
      if (newExercisesToCreate.length > 0) {
        await db.exercises.bulkAdd(newExercisesToCreate);
      }
      await db.syncQueue.bulkAdd(syncItemsToCreate);
    }
  );

  return {
    success: true,
    routineId,
    routineName,
    exerciseCount: exerciseConfigsToCreate.length,
    createdCustomExercisesCount,
    reusedExercisesCount,
  };
}

/**
 * Imports multiple workouts in a bundle.
 */
export async function importWorkoutBundle(
  userId: string,
  workouts: ExportedWorkout[],
  options?: ImportWorkoutOptions
): Promise<ImportBundleResult> {
  assertUserId(userId);
  const results: ImportWorkoutResult[] = [];

  for (const w of workouts) {
    try {
      const res = await importWorkout(userId, w, options);
      results.push(res);
    } catch (err: any) {
      results.push({
        success: false,
        routineName: w.name,
        error: err?.message || "Failed to import routine.",
      });
    }
  }

  const successCount = results.filter((r) => r.success).length;
  return {
    success: successCount > 0,
    importedWorkoutsCount: successCount,
    results,
  };
}

/**
 * Serializes workout export data to pretty JSON.
 */
export function workoutToJson(
  exportData: SculpdWorkoutExport | SculpdWorkoutBundleExport
): string {
  return JSON.stringify(exportData, null, 2);
}

/**
 * Triggers a file download in the browser for an exported workout.
 */
export function triggerWorkoutDownload(
  exportData: SculpdWorkoutExport | SculpdWorkoutBundleExport,
  customFilename?: string
): { success: boolean; filename: string; error?: string } {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { success: false, filename: "", error: "Not in browser environment." };
  }

  try {
    const isBundle = exportData.format === WORKOUT_BUNDLE_IDENTIFIER;
    const defaultName = isBundle
      ? getWorkoutBundleFilename()
      : getWorkoutFilename((exportData as SculpdWorkoutExport).workout?.name || "workout");

    const filename = customFilename || defaultName;
    const jsonStr = workoutToJson(exportData);
    const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return { success: true, filename };
  } catch (err: any) {
    return {
      success: false,
      filename: "",
      error: err?.message || "Download failed.",
    };
  }
}

/**
 * Modern share handler:
 * 1. Checks if navigator.share is available and can share file/text.
 * 2. Falls back to copying JSON to clipboard or triggering download.
 */
export async function shareOrCopyWorkout(
  exportData: SculpdWorkoutExport | SculpdWorkoutBundleExport
): Promise<{ method: "share" | "clipboard" | "download"; success: boolean; error?: string }> {
  const jsonStr = workoutToJson(exportData);
  const isBundle = exportData.format === WORKOUT_BUNDLE_IDENTIFIER;
  const workoutTitle = isBundle
    ? "Sculp'd Workout Bundle"
    : (exportData as SculpdWorkoutExport).workout?.name || "Sculp'd Workout";

  // Check if Web Share API is available (iOS / Android / Safari / Chrome)
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      const filename = isBundle
        ? getWorkoutBundleFilename()
        : getWorkoutFilename(workoutTitle);

      // Try file sharing if File constructor and canShare supported
      if (typeof File !== "undefined" && typeof navigator.canShare === "function") {
        const file = new File([jsonStr], filename, { type: "application/json" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: workoutTitle,
            text: `Here is the ${workoutTitle} workout from Sculp'd!`,
            files: [file],
          });
          return { method: "share", success: true };
        }
      }

      // If file sharing is not supported, share text
      await navigator.share({
        title: workoutTitle,
        text: `Here is the ${workoutTitle} workout from Sculp'd:\n\n${jsonStr}`,
      });
      return { method: "share", success: true };
    } catch (err: any) {
      // If user aborted / dismissed native share sheet, treat as cancel not failure
      if (err?.name === "AbortError") {
        return { method: "share", success: true };
      }
      console.warn("navigator.share failed, falling back to clipboard:", err);
    }
  }

  // Fallback: Clipboard API
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(jsonStr);
      return { method: "clipboard", success: true };
    } catch (clipErr) {
      console.warn("Clipboard copy failed, falling back to download:", clipErr);
    }
  }

  // Final fallback: File download
  const dlRes = triggerWorkoutDownload(exportData);
  return {
    method: "download",
    success: dlRes.success,
    error: dlRes.error,
  };
}
