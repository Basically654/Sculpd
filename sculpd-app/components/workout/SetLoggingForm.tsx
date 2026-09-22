// components/workout/SetLoggingForm.tsx
"use client";

import React, { useState, useEffect } from "react";
import { WorkoutSet } from "@/types/models";

interface SetLoggingFormProps {
  exerciseId: string;
  nextSetNumber: number;
  lastLoggedSet?: WorkoutSet;
  previousPerformance?: WorkoutSet | null;
  onLogSet: (weight: number, reps: number, rpe?: number | null) => Promise<any>;
}

export default function SetLoggingForm({
  exerciseId,
  nextSetNumber,
  lastLoggedSet,
  previousPerformance,
  onLogSet,
}: SetLoggingFormProps) {
  const [weight, setWeight] = useState<string>("");
  const [reps, setReps] = useState<string>("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Auto-seed inputs based on most recent set or previous performance
  useEffect(() => {
    if (lastLoggedSet) {
      setWeight(String(lastLoggedSet.weight));
      setReps(String(lastLoggedSet.reps));
    } else if (previousPerformance) {
      setWeight(String(previousPerformance.weight));
      setReps(String(previousPerformance.reps));
    } else {
      setWeight("");
      setReps("");
    }
    setValidationError(null);
  }, [exerciseId, lastLoggedSet?.id, previousPerformance?.id]);

  const adjustWeight = (delta: number) => {
    const current = parseFloat(weight) || 0;
    const next = Math.max(0, current + delta);
    setWeight(String(next));
  };

  const adjustReps = (delta: number) => {
    const current = parseInt(reps, 10) || 0;
    const next = Math.max(1, current + delta);
    setReps(String(next));
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setValidationError(null);

    const parsedWeight = parseFloat(weight);
    const parsedReps = parseInt(reps, 10);

    if (isNaN(parsedWeight) || parsedWeight <= 0) {
      setValidationError("Please enter a valid weight (> 0)");
      return;
    }

    if (isNaN(parsedReps) || parsedReps <= 0) {
      setValidationError("Please enter valid reps (≥ 1)");
      return;
    }

    try {
      setIsSubmitting(true);
      await onLogSet(parsedWeight, parsedReps, null);
      // Keep weight for next set, but allow athlete to tweak reps if desired
    } catch (err: any) {
      setValidationError(err?.message || "Failed to log set.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="p-3.5 rounded-xl bg-zinc-900/70 border border-zinc-800/80 mb-3 space-y-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-300">
          Set {nextSetNumber}
        </span>
        {validationError && (
          <span className="text-[11px] font-mono text-rose-400 font-medium">
            {validationError}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Weight / Load Input */}
        <div className="space-y-1.5">
          <label
            htmlFor="weight-input"
            className="text-[11px] font-mono uppercase text-zinc-400 font-semibold block"
          >
            Load (lbs)
          </label>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => adjustWeight(-5)}
              className="h-11 w-9 rounded-lg bg-zinc-800 text-zinc-300 hover:text-white font-mono font-bold text-sm active:scale-95 border border-zinc-700/60"
            >
              -5
            </button>
            <input
              id="weight-input"
              type="number"
              step="any"
              min="0"
              inputMode="decimal"
              placeholder="Load (lbs)"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="flex-1 h-11 bg-black border border-zinc-700 rounded-lg text-center font-mono font-bold text-lg text-white focus:outline-none focus:border-emerald-500 transition-colors"
            />
            <button
              type="button"
              onClick={() => adjustWeight(5)}
              className="h-11 w-9 rounded-lg bg-zinc-800 text-zinc-300 hover:text-white font-mono font-bold text-sm active:scale-95 border border-zinc-700/60"
            >
              +5
            </button>
          </div>
        </div>

        {/* Reps Input */}
        <div className="space-y-1.5">
          <label
            htmlFor="reps-input"
            className="text-[11px] font-mono uppercase text-zinc-400 font-semibold block"
          >
            Reps
          </label>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => adjustReps(-1)}
              className="h-11 w-9 rounded-lg bg-zinc-800 text-zinc-300 hover:text-white font-mono font-bold text-sm active:scale-95 border border-zinc-700/60"
            >
              -1
            </button>
            <input
              id="reps-input"
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              placeholder="0"
              value={reps}
              onChange={(e) => setReps(e.target.value)}
              className="flex-1 h-11 bg-black border border-zinc-700 rounded-lg text-center font-mono font-bold text-lg text-white focus:outline-none focus:border-emerald-500 transition-colors"
            />
            <button
              type="button"
              onClick={() => adjustReps(1)}
              className="h-11 w-9 rounded-lg bg-zinc-800 text-zinc-300 hover:text-white font-mono font-bold text-sm active:scale-95 border border-zinc-700/60"
            >
              +1
            </button>
          </div>
        </div>
      </div>

      {/* Log Set Button */}
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-black font-black uppercase tracking-wider text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40 transition-all cursor-pointer disabled:opacity-50"
      >
        <span>LOG SET</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={3}
          stroke="currentColor"
          className="w-4 h-4"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4.5 12.75l6 6 9-13.5"
          />
        </svg>
      </button>
    </form>
  );
}
