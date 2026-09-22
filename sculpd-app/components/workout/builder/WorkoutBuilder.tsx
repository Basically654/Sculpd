// components/workout/builder/WorkoutBuilder.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useUser } from "@/components/auth/UserContext";
import { Exercise } from "@/types/models";
import {
  getRoutineWithExercises,
  createRoutine,
  updateRoutine,
  deleteRoutine,
} from "@/lib/db/routine-repository";
import ExercisePickerModal from "./ExercisePickerModal";
import ExerciseConfigRow, { ConfiguredExerciseItem } from "./ExerciseConfigRow";
import { pushPendingMutations } from "@/lib/sync/sync-client";

interface WorkoutBuilderProps {
  routineId?: string;
}

export default function WorkoutBuilder({ routineId }: WorkoutBuilderProps) {
  const router = useRouter();
  const { activeUserId, sessionToken } = useUser();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [exercises, setExercises] = useState<ConfiguredExerciseItem[]>([]);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(Boolean(routineId));
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load existing routine data if in edit mode
  useEffect(() => {
    if (!routineId) return;
    const targetId = routineId;

    let isMounted = true;
    async function loadRoutine(idToLoad: string) {
      setIsLoading(true);
      setError(null);
      try {
        const data = await getRoutineWithExercises(idToLoad);
        if (!data) {
          if (isMounted) setError("Workout routine not found.");
          return;
        }

        if (isMounted) {
          setName(data.name);
          setDescription(data.description || "");
          const mapped: ConfiguredExerciseItem[] = data.exercises.map((item) => ({
            id: item.id,
            exerciseId: item.exerciseId,
            name: item.exercise.name,
            category: item.exercise.category,
            equipment: item.exercise.equipment,
            targetSets: item.targetSets,
            targetReps: item.targetReps,
            restSeconds: item.restSeconds,
            notes: item.notes || "",
          }));
          setExercises(mapped);
        }
      } catch (err: any) {
        if (isMounted) setError(err?.message || "Failed to load routine.");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadRoutine(targetId);
    return () => {
      isMounted = false;
    };
  }, [routineId]);

  const handleSelectExercise = (exercise: Exercise) => {
    const newItem: ConfiguredExerciseItem = {
      exerciseId: exercise.id,
      name: exercise.name,
      category: exercise.category,
      equipment: exercise.equipment,
      targetSets: 3,
      targetReps: "8-10",
      restSeconds: 90,
      notes: "",
    };
    setExercises((prev) => [...prev, newItem]);
  };

  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    setExercises((prev) => {
      const next = [...prev];
      const temp = next[index - 1];
      next[index - 1] = next[index];
      next[index] = temp;
      return next;
    });
  };

  const handleMoveDown = (index: number) => {
    if (index >= exercises.length - 1) return;
    setExercises((prev) => {
      const next = [...prev];
      const temp = next[index + 1];
      next[index + 1] = next[index];
      next[index] = temp;
      return next;
    });
  };

  const handleRemoveExercise = (index: number) => {
    setExercises((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateExercise = (index: number, updated: ConfiguredExerciseItem) => {
    setExercises((prev) => {
      const next = [...prev];
      next[index] = updated;
      return next;
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUserId) {
      setError("Active profile required to save workouts.");
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Please give your workout a name.");
      return;
    }

    if (exercises.length === 0) {
      setError("Please add at least one exercise to your workout.");
      return;
    }

    try {
      setIsSaving(true);
      setError(null);

      const exercisePayload = exercises.map((item) => ({
        id: item.id,
        exerciseId: item.exerciseId,
        targetSets: item.targetSets,
        targetReps: item.targetReps,
        restSeconds: item.restSeconds,
        notes: item.notes,
      }));

      let savedId = routineId;

      if (routineId) {
        await updateRoutine(activeUserId, routineId, {
          name: trimmedName,
          description: description.trim() || undefined,
          exercises: exercisePayload,
        });
      } else {
        const created = await createRoutine(activeUserId, {
          name: trimmedName,
          description: description.trim() || undefined,
          exercises: exercisePayload,
        });
        savedId = created.id;
      }

      // Asynchronously trigger background cloud sync
      if (sessionToken) {
        pushPendingMutations(activeUserId, sessionToken).catch((err) => {
          console.warn("Background sync warning on routine save:", err);
        });
      }

      router.push(`/workout/${savedId}`);
    } catch (err: any) {
      setError(err?.message || "Failed to save workout.");
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!activeUserId || !routineId) return;
    if (!window.confirm("Are you sure you want to delete this workout routine?")) return;

    try {
      setIsDeleting(true);
      await deleteRoutine(activeUserId, routineId);

      if (sessionToken) {
        pushPendingMutations(activeUserId, sessionToken).catch((err) => {
          console.warn("Background sync warning on delete:", err);
        });
      }

      router.push("/");
    } catch (err: any) {
      setError(err?.message || "Failed to delete workout.");
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4">
        <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin mb-4" />
        <p className="text-xs font-mono uppercase tracking-widest text-zinc-500">
          Loading Workout Builder...
        </p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white p-4 font-sans flex flex-col justify-between pb-8 max-w-md mx-auto w-full">
      <div>
        {/* Navigation Bar */}
        <div className="flex items-center justify-between py-2 mb-4">
          <Link
            href="/"
            className="text-xs font-mono uppercase text-zinc-500 hover:text-zinc-300 flex items-center gap-1 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2.5}
              stroke="currentColor"
              className="w-3.5 h-3.5"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            <span>Cancel</span>
          </Link>

          <h1 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400">
            {routineId ? "Edit Workout" : "New Workout"}
          </h1>

          {routineId && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="text-xs font-mono uppercase text-rose-500 hover:text-rose-400 transition-colors"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-950/40 border border-rose-900/60 text-xs text-rose-400 font-mono">
            {error}
          </div>
        )}

        {/* Workout Info Fields */}
        <form id="workout-builder-form" onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-[11px] font-mono uppercase text-zinc-400 font-bold mb-1.5">
              Workout Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Chest & Triceps Focus, Upper Power"
              className="w-full h-11 bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 text-sm font-bold text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
              autoFocus={!routineId}
            />
          </div>

          <div>
            <label className="block text-[11px] font-mono uppercase text-zinc-400 font-bold mb-1.5">
              Description / Focus <span className="text-zinc-600 font-normal">(Optional)</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Hypertrophy focus with 90s rest intervals"
              className="w-full h-9 bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Exercise List */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-400">
                Exercises ({exercises.length})
              </h2>
              <button
                type="button"
                onClick={() => setIsPickerOpen(true)}
                className="text-xs font-mono uppercase text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1"
              >
                + Add Exercise
              </button>
            </div>

            {exercises.length === 0 ? (
              <div
                onClick={() => setIsPickerOpen(true)}
                className="p-8 rounded-2xl border-2 border-dashed border-zinc-800 hover:border-zinc-700 bg-zinc-950/40 text-center cursor-pointer transition-colors"
              >
                <p className="text-sm font-bold text-zinc-300 mb-1">No exercises added yet</p>
                <p className="text-xs text-zinc-500 font-mono mb-3">
                  Select movements from the catalog or create custom exercises
                </p>
                <span className="inline-block px-3.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono uppercase font-bold">
                  + Browse Exercise Library
                </span>
              </div>
            ) : (
              <div className="space-y-3">
                {exercises.map((item, index) => (
                  <ExerciseConfigRow
                    key={item.id || item.exerciseId + index}
                    item={item}
                    index={index}
                    totalCount={exercises.length}
                    onChange={(updated) => handleUpdateExercise(index, updated)}
                    onMoveUp={() => handleMoveUp(index)}
                    onMoveDown={() => handleMoveDown(index)}
                    onRemove={() => handleRemoveExercise(index)}
                  />
                ))}

                <button
                  type="button"
                  onClick={() => setIsPickerOpen(true)}
                  className="w-full py-3 rounded-xl border border-dashed border-zinc-800 hover:border-zinc-700 bg-zinc-950 text-xs font-mono uppercase text-zinc-400 hover:text-white flex items-center justify-center gap-1 transition-colors"
                >
                  + Add Another Exercise
                </button>
              </div>
            )}
          </div>
        </form>
      </div>

      {/* Save Button Bar */}
      <div className="pt-6">
        <button
          type="submit"
          form="workout-builder-form"
          disabled={isSaving || !name.trim() || exercises.length === 0}
          className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:pointer-events-none text-black font-mono font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-lg shadow-emerald-950/40 cursor-pointer"
        >
          {isSaving ? "Saving Workout..." : routineId ? "Save Changes" : "Create Workout"}
        </button>
      </div>

      {/* Exercise Picker Modal */}
      {activeUserId && (
        <ExercisePickerModal
          isOpen={isPickerOpen}
          onClose={() => setIsPickerOpen(false)}
          onSelectExercise={handleSelectExercise}
          userId={activeUserId}
        />
      )}
    </main>
  );
}
