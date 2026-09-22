// components/workout/WorkoutNavControls.tsx
"use client";

import React from "react";
import { Exercise } from "@/types/models";

interface WorkoutNavControlsProps {
  currentIndex: number;
  totalExercises: number;
  exercises: Exercise[];
  onPrevious: () => void;
  onNext: () => void;
  onSelectExercise: (index: number) => void;
  onFinish: () => void;
}

export default function WorkoutNavControls({
  currentIndex,
  totalExercises,
  exercises,
  onPrevious,
  onNext,
  onSelectExercise,
  onFinish,
}: WorkoutNavControlsProps) {
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === totalExercises - 1;

  return (
    <div className="space-y-3 pt-2">
      {/* Exercise Pill Jump Bar */}
      <div className="flex items-center justify-center gap-1.5 overflow-x-auto py-1">
        {exercises.map((ex, idx) => {
          const isActive = idx === currentIndex;
          return (
            <button
              key={ex.id}
              type="button"
              onClick={() => onSelectExercise(idx)}
              className={`h-7 min-w-[28px] px-2 rounded-lg text-xs font-mono font-bold transition-all ${
                isActive
                  ? "bg-emerald-500 text-black shadow-md shadow-emerald-950/50"
                  : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white"
              }`}
              title={ex.name}
            >
              {idx + 1}
            </button>
          );
        })}
      </div>

      {/* Main Forward / Backward Action Buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onPrevious}
          disabled={isFirst}
          className="h-11 rounded-xl bg-zinc-900 hover:bg-zinc-850 active:scale-[0.98] border border-zinc-800 text-zinc-300 hover:text-white font-mono font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 disabled:opacity-30 disabled:pointer-events-none transition-all"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
            stroke="currentColor"
            className="w-3.5 h-3.5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 19.5L8.25 12l7.5-7.5"
            />
          </svg>
          <span>Prev Exercise</span>
        </button>

        {isLast ? (
          <button
            type="button"
            onClick={onFinish}
            className="h-11 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-black font-mono font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-950/40 transition-all cursor-pointer"
          >
            <span>Finish Workout</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={3}
              stroke="currentColor"
              className="w-3.5 h-3.5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.5 12.75l6 6 9-13.5"
              />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            onClick={onNext}
            className="h-11 rounded-xl bg-zinc-900 hover:bg-zinc-850 active:scale-[0.98] border border-zinc-800 text-zinc-200 hover:text-white font-mono font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer"
          >
            <span>Next Exercise</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2.5}
              stroke="currentColor"
              className="w-3.5 h-3.5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8.25 4.5l7.5 7.5-7.5 7.5"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
