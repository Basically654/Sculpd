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
    <header className="flex items-center justify-between pb-3 border-b border-stone-200 mb-3">
      <div className="flex items-center gap-2.5">
        <Link
          href="/"
          className="w-8 h-8 rounded-lg bg-stone-100 border border-stone-200 flex items-center justify-center text-zinc-600 hover:text-zinc-900 hover:border-stone-300 active:scale-95 transition-all"
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
            <h1 className="text-sm font-bold uppercase text-zinc-900 tracking-tight">
              {routine.name || routine.dayName}
            </h1>
            <span className="text-zinc-400 text-xs">•</span>
            <span className="text-[11px] font-mono text-zinc-600 font-bold">
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
        className="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-900 hover:text-black bg-stone-100 hover:bg-stone-200 border border-stone-200 px-3 py-1.5 rounded-lg active:scale-95 transition-all cursor-pointer"
      >
        Finish
      </button>
    </header>
  );
}
