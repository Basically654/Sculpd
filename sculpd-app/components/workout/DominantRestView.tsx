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
    <div className="flex-1 flex flex-col justify-between items-center text-center py-6 px-4 animate-in fade-in duration-200">
      {/* Exercise context & completed set confirmation */}
      <div className="space-y-3 w-full">
        <h2 className="text-xl font-black uppercase tracking-tight text-zinc-400">
          {exercise.name}
        </h2>

        {lastLoggedSet && (
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-sm font-bold">
            <span>✓</span>
            <span>
              {lastLoggedSet.weight} lbs × {lastLoggedSet.reps}
            </span>
          </div>
        )}
      </div>

      {/* Dominant Rest Timer Centerpiece */}
      <div className="my-auto py-8 flex flex-col items-center justify-center space-y-4">
        <span className="text-xs font-mono font-black tracking-widest text-emerald-400 uppercase">
          RESTING
        </span>

        <div className="relative flex items-center justify-center">
          {/* Giant readable countdown */}
          <div className="text-7xl font-mono font-black text-white tracking-tight tabular-nums select-none">
            {timeFormatted}
          </div>
        </div>

        {/* Minimalist Progress Track */}
        <div className="w-56 h-1.5 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
          <div
            style={{ width: `${progressPercent}%` }}
            className="h-full bg-emerald-500 transition-all duration-300"
          />
        </div>

        <p className="text-xs font-mono text-zinc-500">
          Next: Set {nextSetNumber} of {totalSetsTarget}
        </p>
      </div>

      {/* Timer Controls */}
      <div className="w-full max-w-xs space-y-3">
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => addTime(30)}
            className="h-11 rounded-xl bg-zinc-900 hover:bg-zinc-850 active:scale-95 border border-zinc-800 text-zinc-300 hover:text-white font-mono font-bold text-xs uppercase tracking-wider transition-all"
          >
            +30s
          </button>

          <button
            type="button"
            onClick={onSkipRest}
            className="h-11 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-black font-mono font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-950/50 transition-all"
          >
            Ready Now →
          </button>
        </div>

        {onDeleteLastSet && lastLoggedSet && (
          <button
            type="button"
            onClick={onDeleteLastSet}
            className="text-[11px] font-mono text-zinc-600 hover:text-rose-400 transition-colors pt-1"
          >
            Undo last logged set
          </button>
        )}
      </div>
    </div>
  );
}
