// components/workout/DominantRestView.tsx
"use client";

import React from "react";
import { WorkoutSet, Exercise } from "@/types/models";
import { useTimer } from "@/components/timer/TimerContext";

interface DominantRestViewProps {
  exercise: Exercise;
  lastLoggedSet?: WorkoutSet;
  nextSetNumber: number;
  totalSetsTarget: number;
  onSkipRest: () => void;
  onDeleteLastSet?: () => Promise<any>;
}

export default function DominantRestView({
  exercise,
  lastLoggedSet,
  nextSetNumber,
  totalSetsTarget,
  onSkipRest,
  onDeleteLastSet,
}: DominantRestViewProps) {
  const { remaining, totalDuration, addTime } = useTimer();

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const timeFormatted = `${mins}:${secs.toString().padStart(2, "0")}`;

  const progressPercent =
    totalDuration > 0
      ? Math.min(100, Math.max(0, ((totalDuration - remaining) / totalDuration) * 100))
      : 0;

  return (
    <div className="fixed inset-0 z-40 bg-zinc-950 text-white flex flex-col justify-between items-center text-center p-6 select-none animate-in fade-in duration-200">
      {/* Top: Exercise context & completed set confirmation */}
      <div className="pt-6 space-y-2 w-full max-w-sm">
        <h2 className="text-sm font-bold uppercase tracking-wider text-stone-400">
          {exercise.name}
        </h2>

        {lastLoggedSet && (
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-stone-300 font-mono text-xs font-medium">
            <span className="text-emerald-500">✓</span>
            <span>
              {lastLoggedSet.weight} lbs × {lastLoggedSet.reps}
            </span>
          </div>
        )}
      </div>

      {/* Center: Dominant Rest Timer */}
      <div className="my-auto flex flex-col items-center justify-center space-y-4">
        <span className="text-xs font-mono font-bold tracking-widest text-stone-400 uppercase">
          REST
        </span>

        {/* Hyper-legible countdown */}
        <div className="text-7xl sm:text-8xl font-mono font-bold text-white tracking-tight tabular-nums select-none">
          {timeFormatted}
        </div>

        {/* Minimal progress track */}
        <div className="w-48 h-1 bg-zinc-850 rounded-full overflow-hidden">
          <div
            style={{ width: `${progressPercent}%` }}
            className="h-full bg-stone-300 transition-all duration-300"
          />
        </div>

        {/* Next set indicator */}
        <div className="text-sm font-mono text-stone-300 pt-2 font-medium">
          Next: Set {nextSetNumber} of {totalSetsTarget}
        </div>
      </div>

      {/* Bottom: Timer Controls */}
      <div className="w-full max-w-xs pb-6 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => addTime(30)}
            className="h-13 rounded-2xl bg-zinc-900 hover:bg-zinc-850 active:scale-95 border border-zinc-800 text-stone-300 hover:text-white font-mono font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
          >
            +30s
          </button>

          <button
            type="button"
            onClick={onSkipRest}
            className="h-13 rounded-2xl bg-white hover:bg-stone-100 active:scale-95 text-zinc-950 font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all cursor-pointer"
          >
            READY NOW
          </button>
        </div>

        {onDeleteLastSet && lastLoggedSet && (
          <button
            type="button"
            onClick={onDeleteLastSet}
            className="text-xs font-mono text-stone-500 hover:text-rose-400 transition-colors pt-1 cursor-pointer"
          >
            Undo last logged set
          </button>
        )}
      </div>
    </div>
  );
}
