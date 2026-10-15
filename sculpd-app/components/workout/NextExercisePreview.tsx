// components/workout/NextExercisePreview.tsx
"use client";

import React from "react";
import { Exercise } from "@/types/models";
import { getNextExercisePreviewData } from "@/lib/workout/preview-utils";

interface NextExercisePreviewProps {
  nextExercise: Exercise;
  onGoToNextExercise?: () => void;
}

export default function NextExercisePreview({
  nextExercise,
  onGoToNextExercise,
}: NextExercisePreviewProps) {
  const data = getNextExercisePreviewData(nextExercise);

  return (
    <div
      data-testid="next-exercise-preview"
      className="w-full max-w-xs pt-1.5 animate-in fade-in slide-in-from-bottom-2 duration-300 text-left select-none"
    >
      <div className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-sm space-y-1.5">
        {/* Header: Up Next label & category badge */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 font-bold flex items-center gap-1.5">
            <span className="text-xs">➔</span> Up Next
          </span>
          {data.category && (
            <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-zinc-800 text-stone-400 border border-zinc-700/50">
              {data.category}
            </span>
          )}
        </div>

        {/* Exercise Name */}
        <div className="text-sm font-bold text-white tracking-tight truncate">
          {data.name}
        </div>

        {/* Prescription Targets Row */}
        <div className="flex items-center gap-2 text-xs font-mono text-stone-300 flex-wrap">
          <span className={data.targetSets.isAvailable ? "font-semibold text-stone-200" : "text-stone-400"}>
            {data.targetSets.display}
          </span>
          <span className="text-zinc-600">•</span>
          <span className={data.targetReps.isAvailable ? "font-semibold text-stone-200" : "text-stone-400"}>
            {data.targetReps.display}
          </span>
          <span className="text-zinc-600">•</span>
          <span className={data.targetWeight.isAvailable ? "font-semibold text-stone-200" : "text-stone-400"}>
            {data.targetWeight.display}
          </span>
        </div>

        {/* Coaching Cue / Notes if present */}
        {data.notes && (
          <p className="text-[11px] text-stone-400 italic truncate pt-1 border-t border-zinc-800/80">
            💡 {data.notes}
          </p>
        )}

        {/* Direct advance shortcut if provided */}
        {onGoToNextExercise && (
          <button
            type="button"
            onClick={onGoToNextExercise}
            className="w-full pt-1 text-[11px] font-mono text-emerald-400 hover:text-emerald-300 transition-colors flex items-center justify-between cursor-pointer"
          >
            <span>Skip rest & start exercise</span>
            <span>→</span>
          </button>
        )}
      </div>
    </div>
  );
}
