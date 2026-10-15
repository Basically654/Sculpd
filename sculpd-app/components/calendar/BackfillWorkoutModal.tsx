// components/calendar/BackfillWorkoutModal.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { getUserRoutines } from "@/lib/db/routine-repository";
import { backfillHistoricalWorkoutSession } from "@/lib/db/workout-repository";
import { getLocalDateKey } from "@/lib/calendar/calendar-service";
import { Routine, WorkoutSession } from "@/types/models";

interface BackfillWorkoutModalProps {
  isOpen: boolean;
  userId: string;
  initialDateKey?: string; // "YYYY-MM-DD"
  onClose: () => void;
  onSuccess?: (session: WorkoutSession) => void;
}

export default function BackfillWorkoutModal({
  isOpen,
  userId,
  initialDateKey,
  onClose,
  onSuccess,
}: BackfillWorkoutModalProps) {
  const router = useRouter();
  const todayKey = getLocalDateKey(new Date());

  const [selectedRoutineId, setSelectedRoutineId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>(initialDateKey || todayKey);
  const [durationMinutes, setDurationMinutes] = useState<number>(45);
  const [notes, setNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load user routines
  const routines = useLiveQuery(
    async () => {
      if (!userId) return [];
      return getUserRoutines(userId);
    },
    [userId],
    []
  );

  useEffect(() => {
    if (initialDateKey) {
      setSelectedDate(initialDateKey);
    }
  }, [initialDateKey]);

  useEffect(() => {
    if (routines && routines.length > 0 && !selectedRoutineId) {
      setSelectedRoutineId(routines[0].id);
    }
  }, [routines, selectedRoutineId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoutineId) {
      setErrorMessage("Please select a workout routine.");
      return;
    }

    if (!selectedDate) {
      setErrorMessage("Please choose a workout date.");
      return;
    }

    if (selectedDate > todayKey) {
      setErrorMessage("Backfilled workout date cannot be in the future.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const session = await backfillHistoricalWorkoutSession(userId, {
        routineId: selectedRoutineId,
        historicalDate: selectedDate,
        durationMinutes: Number(durationMinutes) || 45,
        notes: notes.trim() || undefined,
      });

      if (onSuccess) {
        onSuccess(session);
      }
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to backfill workout.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="backfill-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="w-full max-w-sm rounded-3xl bg-[#fafaf8] border border-stone-200 p-6 shadow-2xl flex flex-col space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2
              id="backfill-modal-title"
              className="text-lg font-black tracking-tight text-zinc-900 uppercase"
            >
              Log Past Workout
            </h2>
            <p className="text-xs font-mono text-stone-500 mt-0.5">
              Backfill a session onto your calendar
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-400 hover:text-zinc-700 p-1 rounded-lg transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Routine selector */}
          <div className="space-y-1.5">
            <label
              htmlFor="routine-select"
              className="block text-xs font-mono uppercase tracking-wider font-bold text-zinc-700"
            >
              Routine Template
            </label>
            {routines && routines.length > 0 ? (
              <select
                id="routine-select"
                value={selectedRoutineId}
                onChange={(e) => setSelectedRoutineId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-stone-300 text-zinc-900 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all cursor-pointer"
              >
                {routines.map((r: Routine) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-stone-500 font-mono">
                No routines found. Create a routine first.
              </p>
            )}
          </div>

          {/* Date Picker */}
          <div className="space-y-1.5">
            <label
              htmlFor="backfill-date"
              className="block text-xs font-mono uppercase tracking-wider font-bold text-zinc-700"
            >
              Workout Date
            </label>
            <input
              id="backfill-date"
              type="date"
              max={todayKey}
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setErrorMessage(null);
              }}
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-stone-300 text-zinc-900 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all"
            />
          </div>

          {/* Duration */}
          <div className="space-y-1.5">
            <label
              htmlFor="duration-input"
              className="block text-xs font-mono uppercase tracking-wider font-bold text-zinc-700"
            >
              Estimated Duration (Minutes)
            </label>
            <input
              id="duration-input"
              type="number"
              min="1"
              max="360"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value) || 45)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-stone-300 text-zinc-900 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label
              htmlFor="notes-input"
              className="block text-xs font-mono uppercase tracking-wider font-bold text-zinc-700"
            >
              Notes (Optional)
            </label>
            <input
              id="notes-input"
              type="text"
              placeholder="e.g. Completed while traveling"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-stone-300 text-zinc-900 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all"
            />
          </div>

          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {errorMessage}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 py-2.5 rounded-xl bg-white hover:bg-stone-100 border border-stone-200 text-zinc-700 font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !routines || routines.length === 0}
              className="flex-1 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  <span>Logging...</span>
                </>
              ) : (
                <span>Log Workout</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
