// components/calendar/EditSessionDateModal.tsx
"use client";

import React, { useState, useEffect } from "react";
import { updateWorkoutSessionDate } from "@/lib/db/workout-repository";
import { getLocalDateKey, formatCalendarDate } from "@/lib/calendar/calendar-service";
import { WorkoutSession } from "@/types/models";

interface EditSessionDateModalProps {
  isOpen: boolean;
  userId: string;
  session: {
    id: string;
    routineName: string;
    startedAt: string;
    completedAt?: string | null;
  } | null;
  onClose: () => void;
  onSuccess?: (updated: WorkoutSession) => void;
}

export default function EditSessionDateModal({
  isOpen,
  userId,
  session,
  onClose,
  onSuccess,
}: EditSessionDateModalProps) {
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initialize selectedDate to the session's current local date key
  useEffect(() => {
    if (session) {
      try {
        const key = getLocalDateKey(session.startedAt);
        setSelectedDate(key);
        setErrorMessage(null);
      } catch {
        setSelectedDate("");
      }
    }
  }, [session]);

  if (!isOpen || !session) return null;

  const todayKey = getLocalDateKey(new Date());

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate) {
      setErrorMessage("Please select a date.");
      return;
    }

    if (selectedDate > todayKey) {
      setErrorMessage("Workout session date cannot be in the future.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const updated = await updateWorkoutSessionDate(userId, session.id, selectedDate);
      if (onSuccess) {
        onSuccess(updated);
      }
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to update workout date.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentFormatted = formatCalendarDate(getLocalDateKey(session.startedAt), "full");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-date-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="w-full max-w-sm rounded-3xl bg-[#fafaf8] border border-stone-200 p-6 shadow-2xl flex flex-col space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2
              id="edit-date-modal-title"
              className="text-lg font-black tracking-tight text-zinc-900 uppercase"
            >
              Correct Session Date
            </h2>
            <p className="text-xs font-mono text-stone-500 mt-0.5">
              {session.routineName}
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

        {/* Informative Note */}
        <div className="p-3 rounded-2xl bg-white border border-stone-200 text-xs text-stone-600 font-mono space-y-1">
          <div className="text-[10px] text-stone-400 uppercase font-bold">
            Current Date
          </div>
          <div className="font-bold text-zinc-900">{currentFormatted}</div>
        </div>

        {/* Date Form */}
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="workout-date-input"
              className="block text-xs font-mono uppercase tracking-wider font-bold text-zinc-700"
            >
              New Workout Date
            </label>
            <input
              id="workout-date-input"
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

          <p className="text-[11px] text-stone-500 leading-relaxed font-sans">
            Adjusts the historical date on your calendar. Your sets, weights, reps, and exercise
            configurations remain strictly preserved.
          </p>

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
              disabled={isSubmitting}
              className="flex-1 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Date</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
