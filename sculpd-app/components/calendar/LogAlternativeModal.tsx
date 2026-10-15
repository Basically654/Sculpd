// components/calendar/LogAlternativeModal.tsx
"use client";

import React, { useState } from "react";
import {
  recordFitnessAlternative,
  getDefaultAlternativeTitle,
  MIN_ALTERNATIVE_MINUTES,
} from "@/lib/accountability/accountability-service";
import { FitnessAlternativeType } from "@/types/models";
import { formatCalendarDate } from "@/lib/calendar/calendar-service";

interface LogAlternativeModalProps {
  isOpen: boolean;
  userId: string;
  initialDateKey: string;
  onClose: () => void;
  onSuccess: () => void;
}

const ACTIVITY_OPTIONS: { type: FitnessAlternativeType; label: string; icon: string }[] = [
  { type: "walking", label: "Outdoor Walking", icon: "🚶" },
  { type: "light_cardio", label: "Light Cardio / Zone 2", icon: "🚴" },
  { type: "mobility", label: "Mobility & Stretching", icon: "🧘" },
  { type: "recovery", label: "Active Recovery Session", icon: "🌊" },
];

export default function LogAlternativeModal({
  isOpen,
  userId,
  initialDateKey,
  onClose,
  onSuccess,
}: LogAlternativeModalProps) {
  const [activityType, setActivityType] = useState<FitnessAlternativeType>("walking");
  const [title, setTitle] = useState<string>(getDefaultAlternativeTitle("walking"));
  const [durationMinutes, setDurationMinutes] = useState<number>(30);
  const [notes, setNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleActivityChange = (type: FitnessAlternativeType) => {
    setActivityType(type);
    setTitle(getDefaultAlternativeTitle(type));
  };

  const isEligibleForSkip = durationMinutes >= MIN_ALTERNATIVE_MINUTES;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (durationMinutes <= 0 || isNaN(durationMinutes)) {
      setError("Please enter a valid positive duration in minutes.");
      return;
    }

    try {
      setIsSubmitting(true);
      await recordFitnessAlternative(userId, {
        dateKey: initialDateKey,
        activityType,
        title,
        durationMinutes,
        notes: notes.trim() || undefined,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to log fitness alternative.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-sm rounded-3xl bg-white border border-stone-200 p-5 shadow-2xl space-y-4 font-sans">
        <div>
          <div className="flex items-center justify-between pb-1">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
              Earn an Extra Skip
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
            Log Fitness Alternative
          </h2>
          <p className="text-xs text-stone-500 font-medium">
            {formatCalendarDate(initialDateKey, "full")}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Activity Type Picker */}
          <div className="space-y-1">
            <label className="text-[11px] font-mono uppercase tracking-wider text-stone-500 font-semibold block">
              Activity Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              {ACTIVITY_OPTIONS.map((opt) => (
                <button
                  key={opt.type}
                  type="button"
                  onClick={() => handleActivityChange(opt.type)}
                  className={`p-2.5 rounded-xl border text-left text-xs font-mono font-medium flex items-center gap-2 transition-all cursor-pointer ${
                    activityType === opt.type
                      ? "bg-zinc-900 text-white border-zinc-900 shadow-xs"
                      : "bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100"
                  }`}
                >
                  <span className="text-sm">{opt.icon}</span>
                  <span className="truncate">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Activity Title */}
          <div className="space-y-1">
            <label className="text-[11px] font-mono uppercase tracking-wider text-stone-500 font-semibold block">
              Title / Activity Name
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white font-medium"
              required
            />
          </div>

          {/* Duration in Minutes & Eligibility Callout */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-mono uppercase tracking-wider text-stone-500 font-semibold">
                Duration (Minutes)
              </label>
              <span
                className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                  isEligibleForSkip
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-amber-50 text-amber-800 border border-amber-200"
                }`}
              >
                {isEligibleForSkip ? "✓ Qualifies for +1 Skip" : "Min 20m for +1 Skip"}
              </span>
            </div>
            <input
              type="number"
              min={1}
              max={300}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(parseInt(e.target.value, 10) || 0)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white font-mono font-bold"
              required
            />
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <label className="text-[11px] font-mono uppercase tracking-wider text-stone-500 font-semibold block">
              Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. 2.5 miles brisk walk, felt great"
              className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white resize-none"
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
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white font-mono text-xs uppercase font-bold transition-all shadow-xs cursor-pointer active:scale-95"
            >
              {isSubmitting ? "Saving..." : "Save Activity"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
