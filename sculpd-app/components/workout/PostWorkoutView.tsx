// components/workout/PostWorkoutView.tsx
"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Routine, WorkoutSession, WorkoutSet, Exercise } from "@/types/models";
import { PRResult } from "@/lib/pr/pr-detector";

import { getEffectiveLoad, formatSetLoad, isBodyweightExercise } from "@/lib/load/load-utils";

interface PostWorkoutViewProps {
  routine: Routine;
  session: WorkoutSession;
  sets: WorkoutSet[];
  exercises: Exercise[];
  prsHit: PRResult[];
  onSaveNotes?: (notes: string) => Promise<void>;
}

export default function PostWorkoutView({
  routine,
  session,
  sets,
  exercises,
  prsHit,
  onSaveNotes,
}: PostWorkoutViewProps) {
  const router = useRouter();
  const [notes, setNotes] = useState(session.notes || "");
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  // Compute duration in minutes
  const startedTime = new Date(session.startedAt).getTime();
  const completedTime = session.completedAt
    ? new Date(session.completedAt).getTime()
    : Date.now();
  const durationMinutes = Math.max(1, Math.round((completedTime - startedTime) / 60000));

  // Compute total volume using effective load
  const totalVolume = sets.reduce((sum, s) => sum + getEffectiveLoad(s) * s.reps, 0);

  // Group sets by exercise
  const exerciseSummaries = exercises.map((ex) => {
    const exSets = sets.filter((s) => s.exerciseId === ex.id);
    const isBW = isBodyweightExercise(ex);
    let maxFormatted: string | null = null;
    if (exSets.length > 0) {
      if (isBW) {
        const maxSet = [...exSets].sort((a, b) => getEffectiveLoad(b) - getEffectiveLoad(a))[0];
        maxFormatted = formatSetLoad(maxSet, true);
      } else {
        const maxWeight = Math.max(...exSets.map((s) => s.weight));
        if (maxWeight > 0) {
          maxFormatted = `${maxWeight} lbs`;
        }
      }
    }
    return {
      exercise: ex,
      setsCount: exSets.length,
      maxFormatted,
    };
  });

  const handleDone = async () => {
    if (notes !== session.notes && onSaveNotes) {
      try {
        setIsSavingNotes(true);
        await onSaveNotes(notes.trim());
      } catch (err) {
        console.warn("Failed to save notes:", err);
      }
    }
    router.push("/");
  };

  return (
    <main className="min-h-screen bg-[#fafaf8] text-zinc-900 p-4 pb-16 max-w-md mx-auto w-full font-sans flex flex-col justify-between animate-in fade-in duration-300">
      <div className="space-y-6">
        {/* Celebration Header */}
        <header className="text-center pt-6 space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-stone-100 border border-stone-200 text-zinc-900 mx-auto flex items-center justify-center shadow-xs">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2.5}
              stroke="currentColor"
              className="w-7 h-7"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.5 12.75l6 6 9-13.5"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold uppercase tracking-tight text-zinc-900">
            Workout Complete
          </h1>
          <p className="text-xs font-mono text-zinc-500 uppercase tracking-wider font-semibold">
            {routine.name || routine.dayName}
            {(routine.description || routine.focusTarget) ? ` • ${routine.description || routine.focusTarget}` : ""}
          </p>
        </header>

        {/* High-Level Metrics */}
        <div className="grid grid-cols-3 gap-2 p-3.5 rounded-2xl bg-white border border-stone-200 font-mono text-center shadow-sm">
          <div>
            <span className="text-[10px] uppercase text-zinc-400 block">
              Duration
            </span>
            <span className="text-lg font-bold text-zinc-900">
              {durationMinutes}m
            </span>
          </div>

          <div className="border-x border-stone-200">
            <span className="text-[10px] uppercase text-zinc-400 block">
              Total Sets
            </span>
            <span className="text-lg font-bold text-zinc-900">
              {sets.length}
            </span>
          </div>

          <div>
            <span className="text-[10px] uppercase text-zinc-400 block">
              Volume
            </span>
            <span className="text-lg font-bold text-zinc-900">
              {totalVolume.toLocaleString()}
              <span className="text-[10px] text-zinc-400 font-normal"> lbs</span>
            </span>
          </div>
        </div>

        {/* PRs Achieved (if any) */}
        {prsHit.length > 0 && (
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200/80 space-y-2">
            <div className="flex items-center gap-1.5 text-amber-800 text-xs font-mono font-bold uppercase tracking-wider">
              <span>★</span>
              <span>Personal Records Achieved</span>
            </div>
            <div className="space-y-1.5">
              {prsHit.map((pr, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between font-mono text-xs"
                >
                  <span className="text-zinc-900 font-bold">{pr.exerciseName}</span>
                  <span className="text-amber-800 font-bold">
                    {pr.current?.displayText
                      ? pr.current.displayText
                      : `${pr.current?.weight} lbs`}{" "}
                    × {pr.current?.reps}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Exercises Summary List */}
        <div className="space-y-2">
          <h3 className="text-xs font-mono uppercase tracking-widest text-zinc-400 font-semibold">
            Completed Exercises
          </h3>
          <div className="space-y-1.5">
            {exerciseSummaries.map(({ exercise, setsCount, maxFormatted }) => (
              <div
                key={exercise.id}
                className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-white border border-stone-200 font-mono text-xs shadow-xs"
              >
                <div>
                  <p className="text-zinc-900 font-bold uppercase">{exercise.name}</p>
                  <p className="text-[10px] text-zinc-400">{setsCount} sets recorded</p>
                </div>
                {maxFormatted && (
                  <span className="text-zinc-800 font-bold">
                    Max: {maxFormatted}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Workout Notes */}
        <div className="space-y-1.5 pt-1">
          <label
            htmlFor="post-workout-notes"
            className="text-[11px] font-mono uppercase text-zinc-500 font-semibold block"
          >
            Session Notes
          </label>
          <textarea
            id="post-workout-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Fatigue levels, equipment settings, notes for next week..."
            rows={3}
            className="w-full bg-white border border-stone-200 rounded-xl p-3 text-xs text-zinc-900 placeholder-zinc-400 font-mono focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 shadow-xs"
          />
        </div>
      </div>

      {/* Done Button */}
      <div className="pt-6">
        <button
          type="button"
          onClick={handleDone}
          disabled={isSavingNotes}
          className="w-full h-12 rounded-xl bg-zinc-900 hover:bg-zinc-800 active:scale-[0.98] text-white font-mono font-bold uppercase tracking-wider text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
        >
          <span>Done • Return to Dashboard</span>
        </button>
      </div>
    </main>
  );
}
