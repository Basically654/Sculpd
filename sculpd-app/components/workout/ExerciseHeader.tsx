// components/workout/ExerciseHeader.tsx
"use client";

import React from "react";
import { Exercise } from "@/types/models";

interface ExerciseHeaderProps {
  exercise: Exercise;
}

export default function ExerciseHeader({ exercise }: ExerciseHeaderProps) {
  return (
    <div className="space-y-1.5 mb-3">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-xl font-black uppercase tracking-tight text-white leading-tight">
          {exercise.name}
        </h2>
        <div className="shrink-0 bg-zinc-900 border border-zinc-800 px-2.5 py-1 rounded-md text-right">
          <span className="text-[11px] font-mono font-bold text-zinc-300">
            {exercise.targetSets} sets × {exercise.targetReps}
          </span>
        </div>
      </div>

      {exercise.coachingCue && (
        <div className="flex items-start gap-1.5 text-xs text-zinc-400 bg-zinc-900/50 border border-zinc-800/60 rounded-lg px-2.5 py-1.5">
          <span className="text-emerald-400 text-xs mt-0.5">💡</span>
          <p className="leading-snug">{exercise.coachingCue}</p>
        </div>
      )}
    </div>
  );
}
