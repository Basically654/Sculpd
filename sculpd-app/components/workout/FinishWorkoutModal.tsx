// components/workout/FinishWorkoutModal.tsx
"use client";

import React, { useState } from "react";
import { Routine, WorkoutSet } from "@/types/models";

interface FinishWorkoutModalProps {
  isOpen: boolean;
  routine: Routine;
  sets: WorkoutSet[];
  onConfirm: (notes?: string) => Promise<void>;
  onCancel: () => void;
}

export default function FinishWorkoutModal({
  isOpen,
  routine,
  sets = [],
  onConfirm,
  onCancel,
}: FinishWorkoutModalProps) {
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  // Calculate quick summary metrics safely
  const safeSets = sets || [];
  const totalSets = safeSets.length;
  const uniqueExercises = new Set(safeSets.map((s) => s.exerciseId)).size;

  const handleFinish = async () => {
    try {
      setIsSubmitting(true);
      await onConfirm(notes.trim() || undefined);
    } catch (err) {
      console.error("Failed to complete session:", err);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-sm rounded-2xl bg-white border border-stone-200 p-5 space-y-4 shadow-xl">
        <div className="text-center space-y-1">
          <div className="w-10 h-10 rounded-full bg-stone-100 border border-stone-200 text-zinc-900 mx-auto flex items-center justify-center mb-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2.5}
              stroke="currentColor"
              className="w-5 h-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.5 12.75l6 6 9-13.5"
              />
            </svg>
          </div>
          <h2 className="text-lg font-bold uppercase tracking-tight text-zinc-900">
            Complete Workout
          </h2>
          <p className="text-xs font-mono text-zinc-500">
            {routine.name || routine.dayName}
            {(routine.description || routine.focusTarget) ? ` • ${routine.description || routine.focusTarget}` : ""}
          </p>
        </div>

        {/* Workout Stats Summary */}
        <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-stone-50 border border-stone-200 font-mono text-center">
          <div>
            <span className="text-[10px] uppercase text-zinc-400 block">
              Sets Logged
            </span>
            <span className="text-lg font-bold text-zinc-900">
              {totalSets}
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase text-zinc-400 block">
              Exercises
            </span>
            <span className="text-lg font-bold text-zinc-700">
              {uniqueExercises}
            </span>
          </div>
        </div>

        {/* Session Notes */}
        <div className="space-y-1">
          <label
            htmlFor="workout-notes"
            className="text-[11px] font-mono uppercase text-zinc-500 font-semibold block"
          >
            Workout Notes (Optional)
          </label>
          <textarea
            id="workout-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Energy levels, pump, equipment notes..."
            rows={2}
            className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs text-zinc-900 placeholder-zinc-400 font-mono focus:bg-white focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900"
          />
        </div>

        {/* Action Buttons */}
        <div className="space-y-2 pt-1">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleFinish}
            className="w-full h-11 rounded-xl bg-zinc-900 hover:bg-zinc-850 text-white font-mono font-bold uppercase tracking-wider text-xs flex items-center justify-center gap-2 active:scale-[0.98] shadow-sm disabled:opacity-50 transition-all cursor-pointer"
          >
            <span>{isSubmitting ? "Completing..." : "Complete Workout"}</span>
          </button>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={onCancel}
            className="w-full h-10 rounded-xl bg-stone-100 hover:bg-stone-200 text-zinc-600 hover:text-zinc-900 font-mono text-xs uppercase tracking-wider active:scale-[0.98] transition-all cursor-pointer"
          >
            Keep Training
          </button>
        </div>
      </div>
    </div>
  );
}
