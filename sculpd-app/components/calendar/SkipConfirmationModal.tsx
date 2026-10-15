// components/calendar/SkipConfirmationModal.tsx
"use client";

import React, { useState, useEffect } from "react";
import {
  getMonthlyAccountabilitySummary,
  recordWorkoutSkip,
  MonthlyAccountabilitySummary,
} from "@/lib/accountability/accountability-service";
import { formatCalendarDate } from "@/lib/calendar/calendar-service";

interface SkipConfirmationModalProps {
  isOpen: boolean;
  userId: string;
  dateKey: string;
  routineName?: string;
  routineId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function SkipConfirmationModal({
  isOpen,
  userId,
  dateKey,
  routineName,
  routineId,
  onClose,
  onSuccess,
}: SkipConfirmationModalProps) {
  const [summary, setSummary] = useState<MonthlyAccountabilitySummary | null>(null);
  const [reason, setReason] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && userId) {
      setError(null);
      getMonthlyAccountabilitySummary(userId, dateKey)
        .then(setSummary)
        .catch((e) => setError(e?.message || "Failed to load skip allowance."));
    }
  }, [isOpen, userId, dateKey]);

  if (!isOpen) return null;

  const willUseType =
    summary && summary.freeSkipsRemaining > 0 ? "free" : summary && summary.earnedSkipsAvailable > 0 ? "earned" : null;

  const handleConfirm = async () => {
    setError(null);
    if (!willUseType) {
      setError("No skips available. Complete a fitness alternative (e.g. 20+ min walk) to earn an extra skip.");
      return;
    }

    try {
      setIsSubmitting(true);
      await recordWorkoutSkip(userId, {
        dateKey,
        routineId,
        routineName,
        reason: reason.trim() || undefined,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to record workout skip.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-sm rounded-3xl bg-white border border-stone-200 p-5 shadow-2xl space-y-4 font-sans">
        <div>
          <div className="flex items-center justify-between pb-1">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
              Accountability Check
            </span>
            <button
              type="button"
              onClick={onClose}
              className="text-stone-400 hover:text-zinc-800 text-lg leading-none cursor-pointer"
            >
              ✕
            </button>
          </div>
          <h2 className="text-lg font-black tracking-tight text-zinc-950 uppercase pt-1">
            Skip Planned Workout?
          </h2>
          <p className="text-xs text-stone-500 font-medium">
            {formatCalendarDate(dateKey, "full")} • {routineName || "Planned Workout"}
          </p>
        </div>

        {/* Skip Allowance Status Card */}
        {summary && (
          <div className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200/80 space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-stone-600">Monthly Free Skips:</span>
              <span className="font-bold text-zinc-900">
                {summary.freeSkipsRemaining} of {summary.freeSkipsTotal} remaining
              </span>
            </div>
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-stone-600">Carried-Over Earned Skips:</span>
              <span className="font-bold text-emerald-800">
                {summary.earnedSkipsAvailable} available
              </span>
            </div>
            <div className="pt-1.5 border-t border-stone-200 text-[11px] text-stone-500">
              {willUseType === "free" ? (
                <span>
                  Using 1 of your 3 monthly free skips. This will not break your streak or count against your training history.
                </span>
              ) : willUseType === "earned" ? (
                <span>
                  Monthly free skips used up. Consuming 1 of your carried-over earned skips.
                </span>
              ) : (
                <span className="text-rose-600 font-medium">
                  You have exhausted all skips this month. Complete a 20+ min active recovery session or walk to earn an extra skip!
                </span>
              )}
            </div>
          </div>
        )}

        {/* Optional Reason */}
        <div className="space-y-1">
          <label className="text-[11px] font-mono uppercase tracking-wider text-stone-500 font-semibold block">
            Reason or Notes (Optional)
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Travel, illness, rest needed"
            className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
          />
        </div>

        {error && (
          <p className="text-xs font-mono text-rose-600 bg-rose-50 border border-rose-200 p-2.5 rounded-xl">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-mono text-xs uppercase font-bold transition-colors cursor-pointer"
          >
            Keep Planned
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting || !willUseType}
            className="flex-1 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white font-mono text-xs uppercase font-bold transition-all shadow-xs cursor-pointer active:scale-95"
          >
            {isSubmitting ? "Skipping..." : "Confirm Skip"}
          </button>
        </div>
      </div>
    </div>
  );
}
