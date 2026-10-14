// components/history/DeleteWorkoutModal.tsx
"use client";

import React, { useState } from "react";

interface DeleteWorkoutModalProps {
  isOpen: boolean;
  workoutName: string;
  formattedDate: string;
  formattedDuration?: string;
  totalSets?: number;
  formattedVolume?: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export default function DeleteWorkoutModal({
  isOpen,
  workoutName,
  formattedDate,
  formattedDuration,
  totalSets,
  formattedVolume,
  onClose,
  onConfirm,
}: DeleteWorkoutModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDelete = async () => {
    setIsDeleting(true);
    setErrorMsg(null);
    try {
      await onConfirm();
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to delete workout record.");
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-sm bg-white border border-stone-200 rounded-3xl p-6 shadow-xl space-y-4">
        {/* Header with warning icon */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-200/80 flex items-center justify-center text-rose-600 shrink-0">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-5 h-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-bold text-zinc-950 tracking-tight">
              Delete Workout Record?
            </h3>
            <p className="text-xs text-stone-500 font-medium mt-0.5">
              Confirm permanent deletion
            </p>
          </div>
        </div>

        {/* Workout Info Card */}
        <div className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200 text-xs space-y-1 font-mono">
          <div className="font-bold text-zinc-900 text-sm font-sans truncate">
            {workoutName}
          </div>
          <div className="text-stone-600 flex items-center gap-1.5 flex-wrap">
            <span>{formattedDate}</span>
            {formattedDuration && (
              <>
                <span>•</span>
                <span>{formattedDuration}</span>
              </>
            )}
            {typeof totalSets === "number" && (
              <>
                <span>•</span>
                <span>{totalSets} {totalSets === 1 ? "set" : "sets"}</span>
              </>
            )}
            {formattedVolume && (
              <>
                <span>•</span>
                <span>{formattedVolume}</span>
              </>
            )}
          </div>
        </div>

        <p className="text-xs text-stone-600 leading-relaxed">
          This will permanently delete this completed workout and all of its recorded sets from your device. Training statistics will update automatically. This cannot be undone.
        </p>

        {errorMsg && (
          <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium text-center">
            {errorMsg}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="flex-1 py-2.5 px-4 rounded-xl bg-stone-100 hover:bg-stone-200 text-zinc-800 font-medium text-xs transition-colors cursor-pointer disabled:opacity-50 text-center"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-xs cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isDeleting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Deleting...</span>
              </>
            ) : (
              <span>Delete Workout</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
