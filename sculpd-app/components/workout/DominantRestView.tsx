// components/workout/DominantRestView.tsx
"use client";

import React from "react";
import { WorkoutSet, Exercise } from "@/types/models";
import { useTimer } from "@/components/timer/TimerContext";
import { useDev } from "@/components/dev/DevContext";

import { formatSetSummary, isBodyweightExercise } from "@/lib/load/load-utils";
import NextExercisePreview from "./NextExercisePreview";

interface DominantRestViewProps {
  exercise: Exercise;
  lastLoggedSet?: WorkoutSet;
  nextSetNumber: number;
  totalSetsTarget: number;
  isFinalSet?: boolean;
  nextExercise?: Exercise | null;
  onSkipRest: () => void;
  onDeleteLastSet?: () => Promise<any>;
  onFinishWorkout?: () => void;
  onGoToNextExercise?: () => void;
  onToggleMinimize?: () => void;
}

export default function DominantRestView({
  exercise,
  lastLoggedSet,
  nextSetNumber,
  totalSetsTarget,
  isFinalSet,
  nextExercise,
  onSkipRest,
  onDeleteLastSet,
  onFinishWorkout,
  onGoToNextExercise,
  onToggleMinimize,
}: DominantRestViewProps) {
  const { remaining, totalDuration, addTime, accelerateTimer, completeTimerNow } = useTimer();

  let isDevModeActive = false;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const devCtx = useDev();
    isDevModeActive = devCtx.isDevModeActive;
  } catch {
    isDevModeActive = false;
  }

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const timeFormatted = `${mins}:${secs.toString().padStart(2, "0")}`;

  const progressPercent =
    totalDuration > 0
      ? Math.min(100, Math.max(0, ((totalDuration - remaining) / totalDuration) * 100))
      : 0;

  const isBW = isBodyweightExercise(exercise);
  const isFinal =
    isFinalSet ?? (totalSetsTarget > 0 && nextSetNumber > totalSetsTarget);

  return (
    <div className="fixed inset-0 z-40 bg-zinc-950 text-white overflow-y-auto select-none animate-in fade-in duration-200">
      <div className="min-h-full flex flex-col justify-between items-center text-center p-6 py-8">
      {/* Top: Exercise context & completed set confirmation */}
      <div className="pt-6 space-y-2 w-full max-w-sm">
        <h2 className="text-sm font-bold uppercase tracking-wider text-stone-400">
          {exercise.name}
        </h2>

        {lastLoggedSet && (
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-stone-300 font-mono text-xs font-medium">
            <span className="text-emerald-500">✓</span>
            <span>
              Set {lastLoggedSet.setNumber}: {formatSetSummary(lastLoggedSet, isBW)}
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

        {/* Next set indicator or Next Exercise Preview */}
        {isFinal && nextExercise ? (
          <NextExercisePreview
            nextExercise={nextExercise}
            onGoToNextExercise={onGoToNextExercise}
          />
        ) : isFinal && !nextExercise ? (
          <div className="text-sm font-mono text-emerald-400 pt-2 font-medium">
            ✓ Final Exercise Complete
          </div>
        ) : (
          <div className="text-sm font-mono text-stone-300 pt-2 font-medium">
            {totalSetsTarget > 0
              ? nextSetNumber <= totalSetsTarget
                ? `Next: Set ${nextSetNumber} of ${totalSetsTarget}`
                : `Next: Set ${nextSetNumber} (Extra)`
              : `Next: Set ${nextSetNumber}`}
          </div>
        )}
      </div>

      {/* Bottom: Timer Controls */}
      <div className="w-full max-w-xs pb-6 space-y-3">
        {isDevModeActive && (
          <div className="p-2 rounded-xl bg-amber-950/40 border border-amber-600/40 text-amber-300 space-y-1.5 animate-in fade-in duration-200">
            <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider font-bold">
              <span>⚡ Dev Timer Controls</span>
              <span className="text-[9px] px-1 py-0.5 rounded bg-amber-900/60 text-amber-200 border border-amber-700/50">
                DEV
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 text-xs font-mono font-bold">
              <button
                type="button"
                onClick={() => accelerateTimer(5)}
                className="py-1.5 px-2 rounded-lg bg-zinc-900 hover:bg-zinc-850 text-amber-200 border border-amber-600/30 transition-all active:scale-95 cursor-pointer text-center"
                title="Accelerate timer to 5s remaining"
              >
                5s Left
              </button>
              <button
                type="button"
                onClick={() => accelerateTimer(10)}
                className="py-1.5 px-2 rounded-lg bg-zinc-900 hover:bg-zinc-850 text-amber-200 border border-amber-600/30 transition-all active:scale-95 cursor-pointer text-center"
                title="Accelerate timer to 10s remaining"
              >
                10s Left
              </button>
              <button
                type="button"
                onClick={completeTimerNow}
                className="py-1.5 px-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 border border-amber-400 transition-all active:scale-95 cursor-pointer text-center"
                title="Trigger immediate timer completion"
              >
                Done
              </button>
            </div>
            {onToggleMinimize && (
              <button
                type="button"
                onClick={onToggleMinimize}
                className="w-full mt-1.5 py-1.5 px-2 rounded-lg bg-zinc-900 hover:bg-zinc-850 text-amber-300 border border-amber-600/30 text-[11px] font-mono font-semibold transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                title="Minimize timer to floating bar so you can scroll through the entire workout screen"
              >
                <span>📜 Allow Scrolling / View Workout</span>
              </button>
            )}
          </div>
        )}

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
            className="text-xs font-mono text-stone-500 hover:text-rose-400 transition-colors pt-1 cursor-pointer block mx-auto"
          >
            Undo last logged set
          </button>
        )}

        {onFinishWorkout && (
          <button
            type="button"
            onClick={onFinishWorkout}
            className="text-[11px] font-mono uppercase tracking-wider text-stone-400 hover:text-white transition-colors cursor-pointer block mx-auto pt-1 font-semibold"
          >
            Finish Workout
          </button>
        )}
      </div>
      </div>
    </div>
  );
}
