// components/workout/WorkoutHeader.tsx
"use client";

import React from "react";
import Link from "next/link";
import { Routine } from "@/types/models";

interface WorkoutHeaderProps {
  routine: Routine;
  currentExerciseIndex: number;
  totalExercises: number;
  onFinishClick: () => void;
}

export default function WorkoutHeader({
  routine,
  currentExerciseIndex,
  totalExercises,
  onFinishClick,
}: WorkoutHeaderProps) {
  return (
    <header className="flex items-center justify-between pb-3 border-b border-zinc-800/80 mb-3">
      <div className="flex items-center gap-2.5">
        <Link
          href="/"
          className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white hover:border-zinc-700 active:scale-95 transition-all"
          title="Back to routines"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
            stroke="currentColor"
            className="w-4 h-4"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 19.5L8.25 12l7.5-7.5"
            />
          </svg>
        </Link>

        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-sm font-black uppercase text-zinc-100 tracking-tight">
              {routine.name || routine.dayName}
            </h1>
            <span className="text-zinc-600 text-xs">•</span>
            <span className="text-[11px] font-mono text-emerald-400 font-bold">
              Ex {currentExerciseIndex + 1}/{totalExercises}
            </span>
          </div>
          <p className="text-[10px] text-zinc-400 line-clamp-1 font-medium">
            {routine.description || routine.focusTarget}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onFinishClick}
        className="text-[11px] font-mono font-bold uppercase tracking-wider text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 px-3 py-1.5 rounded-lg active:scale-95 transition-all"
      >
        Finish
      </button>
    </header>
  );
}
