// components/workout/ExportWorkoutModal.tsx
"use client";

import React, { useState, useEffect } from "react";
import {
  exportWorkout,
  exportAllWorkouts,
  exportWorkoutSessionAsRoutine,
  workoutToJson,
  triggerWorkoutDownload,
  shareOrCopyWorkout,
} from "@/lib/workout/workout-transfer-service";
import {
  SculpdWorkoutExport,
  SculpdWorkoutBundleExport,
  WORKOUT_BUNDLE_IDENTIFIER,
} from "@/types/transfer";

interface ExportWorkoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  routineId?: string;
  routineName?: string;
  userId?: string;
  sessionId?: string;
  isBundle?: boolean;
}

export default function ExportWorkoutModal({
  isOpen,
  onClose,
  routineId,
  routineName,
  userId,
  sessionId,
  isBundle = false,
}: ExportWorkoutModalProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [exportData, setExportData] = useState<
    SculpdWorkoutExport | SculpdWorkoutBundleExport | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  const [showJsonPreview, setShowJsonPreview] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    async function loadData() {
      setIsLoading(true);
      setError(null);
      setCopySuccess(false);
      setDownloadSuccess(null);
      setShowJsonPreview(false);

      try {
        let result: SculpdWorkoutExport | SculpdWorkoutBundleExport;
        if (isBundle && userId) {
          result = await exportAllWorkouts(userId);
        } else if (sessionId && userId) {
          result = await exportWorkoutSessionAsRoutine(userId, sessionId);
        } else if (routineId) {
          result = await exportWorkout(routineId);
        } else {
          throw new Error("No workout selected for export.");
        }

        if (isMounted) {
          setExportData(result);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err?.message || "Failed to prepare workout export.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, [isOpen, routineId, userId, sessionId, isBundle]);

  if (!isOpen) return null;

  const handleShareOrCopy = async () => {
    if (!exportData) return;
    const res = await shareOrCopyWorkout(exportData);
    if (res.method === "clipboard" && res.success) {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 3000);
    } else if (res.method === "download" && res.success) {
      setDownloadSuccess("Workout downloaded as file.");
      setTimeout(() => setDownloadSuccess(null), 3000);
    }
  };

  const handleCopyCode = async () => {
    if (!exportData) return;
    try {
      const text = workoutToJson(exportData);
      await navigator.clipboard.writeText(text);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 3000);
    } catch {
      setError("Could not copy to clipboard. You can select and copy the code below.");
    }
  };

  const handleDownloadFile = () => {
    if (!exportData) return;
    const res = triggerWorkoutDownload(exportData);
    if (res.success) {
      setDownloadSuccess(`Saved ${res.filename}`);
      setTimeout(() => setDownloadSuccess(null), 3000);
    } else {
      setError(res.error || "Failed to download file.");
    }
  };

  const isMultiple = exportData?.format === WORKOUT_BUNDLE_IDENTIFIER;
  const singleWorkout = !isMultiple
    ? (exportData as SculpdWorkoutExport)?.workout
    : undefined;
  const bundleWorkouts = isMultiple
    ? (exportData as SculpdWorkoutBundleExport)?.workouts
    : undefined;

  const title = isMultiple
    ? "Export All Workouts"
    : singleWorkout?.name || routineName || "Export Workout";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-workout-title"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#fafaf8] border border-stone-300 rounded-3xl shadow-2xl p-5 sm:p-6 text-zinc-900 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-200">
          <div className="flex items-center gap-2">
            <span className="text-xl">📤</span>
            <div>
              <h2
                id="export-workout-title"
                className="text-lg font-bold tracking-tight text-zinc-900"
              >
                Share Workout
              </h2>
              <p className="text-xs text-stone-500 font-mono">
                Send to a friend or fellow lifter
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close export modal"
            className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center text-stone-500 hover:text-zinc-900 transition-colors text-sm font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center text-stone-500 space-y-2">
              <div className="w-7 h-7 rounded-full border-2 border-zinc-800 border-t-transparent animate-spin" />
              <p className="text-xs font-mono uppercase tracking-wider">
                Packaging Workout...
              </p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
              <p className="font-bold mb-1">Export Error</p>
              <p>{error}</p>
            </div>
          ) : (
            <>
              {/* Workout Preview Card */}
              <div className="p-4 rounded-2xl bg-white border border-stone-200 shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-zinc-900 truncate">
                    {title}
                  </h3>
                  <span className="text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 border border-stone-200">
                    {isMultiple
                      ? `${bundleWorkouts?.length || 0} Workouts`
                      : `${singleWorkout?.exercises.length || 0} Exercises`}
                  </span>
                </div>

                {!isMultiple && singleWorkout?.description && (
                  <p className="text-xs text-stone-500 leading-relaxed">
                    {singleWorkout.description}
                  </p>
                )}

                {/* Exercise Summary Preview */}
                {!isMultiple && singleWorkout?.exercises && (
                  <div className="pt-2 border-t border-stone-100 space-y-1.5">
                    {singleWorkout.exercises.slice(0, 4).map((ex, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="text-zinc-800 font-medium truncate max-w-[220px]">
                          {ex.name}
                        </span>
                        <span className="text-[11px] font-mono text-stone-400 shrink-0">
                          {ex.targetSets} × {ex.targetReps}
                        </span>
                      </div>
                    ))}
                    {singleWorkout.exercises.length > 4 && (
                      <p className="text-[11px] font-mono text-stone-400 pt-0.5">
                        + {singleWorkout.exercises.length - 4} more movements
                      </p>
                    )}
                  </div>
                )}

                {/* Multiple Workouts List Preview */}
                {isMultiple && bundleWorkouts && (
                  <div className="pt-2 border-t border-stone-100 space-y-1.5">
                    {bundleWorkouts.map((w, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="text-zinc-800 font-medium truncate">
                          {w.name}
                        </span>
                        <span className="text-[11px] font-mono text-stone-400 shrink-0">
                          {w.exercises.length} exercises
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Success toasts */}
              {copySuccess && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-mono flex items-center gap-2 animate-in fade-in">
                  <span>✓</span>
                  <span>Copied to clipboard! Ready to paste into chat or text.</span>
                </div>
              )}

              {downloadSuccess && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-mono flex items-center gap-2 animate-in fade-in">
                  <span>✓</span>
                  <span>{downloadSuccess}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-2 pt-1">
                {/* 1. Send via Share Sheet (Mobile / AirDrop / Messages) */}
                <button
                  type="button"
                  onClick={handleShareOrCopy}
                  className="w-full h-11 rounded-xl bg-zinc-900 hover:bg-zinc-800 active:scale-[0.98] text-white font-mono font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
                >
                  <span>📲</span>
                  <span>Send via Share Sheet / Chat</span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  {/* 2. Copy Code */}
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="h-10 rounded-xl bg-white hover:bg-stone-50 border border-stone-200 active:scale-95 text-zinc-800 font-mono font-medium text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                  >
                    <span>📋</span>
                    <span>Copy Code</span>
                  </button>

                  {/* 3. Download JSON */}
                  <button
                    type="button"
                    onClick={handleDownloadFile}
                    className="h-10 rounded-xl bg-white hover:bg-stone-50 border border-stone-200 active:scale-95 text-zinc-800 font-mono font-medium text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                  >
                    <span>💾</span>
                    <span>Download File</span>
                  </button>
                </div>
              </div>

              {/* View JSON / Code Toggle */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowJsonPreview(!showJsonPreview)}
                  className="text-[11px] font-mono text-stone-500 hover:text-zinc-800 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <span>{showJsonPreview ? "▼ Hide" : "▶ View"} Workout Code / JSON</span>
                </button>

                {showJsonPreview && exportData && (
                  <div className="mt-2 relative">
                    <pre className="p-3 rounded-xl bg-stone-900 text-stone-100 text-[11px] font-mono overflow-x-auto max-h-48 scrollbar-thin select-all">
                      {workoutToJson(exportData)}
                    </pre>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-stone-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-zinc-800 text-xs font-mono font-bold uppercase transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
