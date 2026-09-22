// components/workout/PostWorkoutView.tsx
"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Routine, WorkoutSession, WorkoutSet, Exercise } from "@/types/models";
import { PRResult } from "@/lib/pr/pr-detector";

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

  // Compute total volume
  const totalVolume = sets.reduce((sum, s) => sum + s.weight * s.reps, 0);

  // Group sets by exercise
  const exerciseSummaries = exercises.map((ex) => {
    const exSets = sets.filter((s) => s.exerciseId === ex.id);
    const maxWeight = exSets.length > 0 ? Math.max(...exSets.map((s) => s.weight)) : 0;
    return {
      exercise: ex,
      setsCount: exSets.length,
      maxWeight,
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
    <main className="min-h-screen bg-black text-white p-4 pb-16 max-w-md mx-auto w-full font-sans flex flex-col justify-between animate-in fade-in duration-300">
      <div className="space-y-6">
        {/* Celebration Header */}
        <header className="text-center pt-6 space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/40 text-emerald-400 mx-auto flex items-center justify-center shadow-xl shadow-emerald-950/50">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={3}
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
          <h1 className="text-2xl font-black uppercase tracking-tight text-white">
            Workout Complete
          </h1>
          <p className="text-xs font-mono text-emerald-400 uppercase tracking-wider font-bold">
            {routine.name || routine.dayName}
            {(routine.description || routine.focusTarget) ? ` • ${routine.description || routine.focusTarget}` : ""}
          </p>
        </header>

        {/* High-Level Metrics */}
        <div className="grid grid-cols-3 gap-2 p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800 font-mono text-center">
          <div>
            <span className="text-[10px] uppercase text-zinc-500 block">
              Duration
            </span>
            <span className="text-lg font-black text-white">
              {durationMinutes}m
            </span>
          </div>

          <div className="border-x border-zinc-800">
            <span className="text-[10px] uppercase text-zinc-500 block">
              Total Sets
            </span>
            <span className="text-lg font-black text-emerald-400">
              {sets.length}
            </span>
          </div>

          <div>
            <span className="text-[10px] uppercase text-zinc-500 block">
              Volume
            </span>
            <span className="text-lg font-black text-white">
              {totalVolume.toLocaleString()}
              <span className="text-[10px] text-zinc-500 font-normal"> lbs</span>
            </span>
          </div>
        </div>

        {/* PRs Achieved (if any) */}
        {prsHit.length > 0 && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-400/40 space-y-2">
            <div className="flex items-center gap-1.5 text-amber-400 text-xs font-mono font-bold uppercase tracking-wider">
              <span>★</span>
              <span>Personal Records Achieved</span>
            </div>
            <div className="space-y-1.5">
              {prsHit.map((pr, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between font-mono text-xs"
                >
                  <span className="text-white font-bold">{pr.exerciseName}</span>
                  <span className="text-amber-300 font-black">
                    {pr.current?.weight} lbs × {pr.current?.reps}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Exercises Summary List */}
        <div className="space-y-2">
          <h3 className="text-xs font-mono uppercase tracking-widest text-zinc-500">
            Completed Exercises
          </h3>
          <div className="space-y-1.5">
            {exerciseSummaries.map(({ exercise, setsCount, maxWeight }) => (
              <div
                key={exercise.id}
                className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-zinc-900/40 border border-zinc-800/60 font-mono text-xs"
              >
                <div>
                  <p className="text-zinc-200 font-bold uppercase">{exercise.name}</p>
                  <p className="text-[10px] text-zinc-500">{setsCount} sets recorded</p>
                </div>
                {maxWeight > 0 && (
                  <span className="text-emerald-400 font-black">
                    Max: {maxWeight} lbs
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
            className="text-[11px] font-mono uppercase text-zinc-400 font-semibold block"
          >
            Session Notes
          </label>
          <textarea
            id="post-workout-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Fatigue levels, equipment settings, notes for next week..."
            rows={3}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-200 placeholder-zinc-600 font-mono focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Done Button */}
      <div className="pt-6">
        <button
          type="button"
          onClick={handleDone}
          disabled={isSavingNotes}
          className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-black font-black uppercase tracking-wider text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50 transition-all cursor-pointer"
        >
          <span>Done • Return to Dashboard</span>
        </button>
      </div>
    </main>
  );
}
