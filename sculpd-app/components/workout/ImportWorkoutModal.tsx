// components/workout/ImportWorkoutModal.tsx
"use client";

import React, { useState, useRef } from "react";
import Link from "next/link";
import { useUser } from "@/components/auth/UserContext";
import {
  validateWorkoutData,
  importWorkout,
  importWorkoutBundle,
} from "@/lib/workout/workout-transfer-service";
import { ExportedWorkout, WorkoutValidationResult } from "@/types/transfer";

interface ImportWorkoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess?: (routineId: string) => void;
}

export default function ImportWorkoutModal({
  isOpen,
  onClose,
  onImportSuccess,
}: ImportWorkoutModalProps) {
  const { activeUserId } = useUser();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [activeTab, setActiveTab] = useState<"file" | "paste">("file");
  const [rawText, setRawText] = useState("");
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [validation, setValidation] = useState<WorkoutValidationResult | null>(null);

  // Editable fields for single workout
  const [customWorkoutName, setCustomWorkoutName] = useState("");

  // Multi-workout selection for bundle
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);

  // Import state
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importedRoutineId, setImportedRoutineId] = useState<string | null>(null);
  const [importedSummary, setImportedSummary] = useState<string | null>(null);

  if (!isOpen) return null;

  const resetState = () => {
    setRawText("");
    setSelectedFileName(null);
    setValidation(null);
    setCustomWorkoutName("");
    setSelectedIndices([]);
    setIsImporting(false);
    setImportError(null);
    setImportedRoutineId(null);
    setImportedSummary(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  // Parses workout data and sets up preview
  const processPayload = (content: string, fileName?: string) => {
    setImportError(null);
    if (fileName) setSelectedFileName(fileName);

    const result = validateWorkoutData(content);
    setValidation(result);

    if (result.valid && result.workouts && result.workouts.length > 0) {
      if (result.isBundle) {
        // Default to selecting all workouts in bundle
        setSelectedIndices(result.workouts.map((_, i) => i));
      } else {
        setCustomWorkoutName(result.workouts[0].name);
      }
    }
  };

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      processPayload(text, file.name);
    };
    reader.onerror = () => {
      setImportError("Failed to read file.");
    };
    reader.readAsText(file);
  };

  // Handle text paste/change
  const handleTextChange = (text: string) => {
    setRawText(text);
    if (!text.trim()) {
      setValidation(null);
      return;
    }
    processPayload(text);
  };

  // Perform import
  const handleExecuteImport = async () => {
    if (!activeUserId) {
      setImportError("Please sign in or select an athlete profile before importing.");
      return;
    }

    if (!validation?.valid || !validation.workouts || validation.workouts.length === 0) {
      setImportError("No valid workout to import.");
      return;
    }

    setIsImporting(true);
    setImportError(null);

    try {
      if (validation.isBundle) {
        // Multi-workout bundle import
        const workoutsToImport = validation.workouts.filter((_, idx) =>
          selectedIndices.includes(idx)
        );

        if (workoutsToImport.length === 0) {
          setImportError("Please select at least one workout to import.");
          setIsImporting(false);
          return;
        }

        const res = await importWorkoutBundle(activeUserId, workoutsToImport);
        if (res.success) {
          const firstSuccess = res.results.find((r) => r.success && r.routineId);
          setImportedRoutineId(firstSuccess?.routineId || null);
          setImportedSummary(
            `Imported ${res.importedWorkoutsCount} of ${workoutsToImport.length} workouts into your library.`
          );
          if (firstSuccess?.routineId && onImportSuccess) {
            onImportSuccess(firstSuccess.routineId);
          }
        } else {
          setImportError(res.error || "Failed to import workouts.");
        }
      } else {
        // Single workout import
        const targetWorkout: ExportedWorkout = {
          ...validation.workouts[0],
          name: customWorkoutName.trim() || validation.workouts[0].name,
        };

        const res = await importWorkout(activeUserId, targetWorkout, {
          customName: customWorkoutName.trim(),
        });

        if (res.success && res.routineId) {
          setImportedRoutineId(res.routineId);
          setImportedSummary(
            `Added "${res.routineName}" (${res.exerciseCount} exercises) to your workouts.`
          );
          if (onImportSuccess) {
            onImportSuccess(res.routineId);
          }
        } else {
          setImportError(res.error || "Failed to import workout.");
        }
      }
    } catch (err: any) {
      setImportError(err?.message || "An unexpected error occurred while importing.");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-workout-title"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-md bg-[#fafaf8] border border-stone-300 rounded-3xl shadow-2xl p-5 sm:p-6 text-zinc-900 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-200">
          <div className="flex items-center gap-2">
            <span className="text-xl">📥</span>
            <div>
              <h2
                id="import-workout-title"
                className="text-lg font-bold tracking-tight text-zinc-900"
              >
                Import Workout
              </h2>
              <p className="text-xs text-stone-500 font-mono">
                Load a routine sent by a coach or friend
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close import modal"
            className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center text-stone-500 hover:text-zinc-900 transition-colors text-sm font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {/* Success Screen */}
          {importedSummary ? (
            <div className="py-6 text-center space-y-4 animate-in fade-in">
              <div className="w-12 h-12 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-800 text-xl font-bold flex items-center justify-center mx-auto">
                ✓
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-zinc-900">
                  Workout Imported!
                </h3>
                <p className="text-xs text-stone-600 max-w-xs mx-auto leading-relaxed">
                  {importedSummary}
                </p>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                {importedRoutineId && (
                  <Link
                    href={`/workout/${importedRoutineId}`}
                    onClick={handleClose}
                    className="w-full h-11 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-mono font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95"
                  >
                    <span>Start Workout Now →</span>
                  </Link>
                )}
                <button
                  type="button"
                  onClick={handleClose}
                  className="w-full h-10 rounded-xl bg-stone-100 hover:bg-stone-200 text-zinc-800 font-mono font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Tab Selector: File vs Paste */}
              <div className="flex items-center gap-1 p-1 bg-stone-100 rounded-xl border border-stone-200 text-xs font-mono">
                <button
                  type="button"
                  onClick={() => setActiveTab("file")}
                  className={`flex-1 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                    activeTab === "file"
                      ? "bg-white text-zinc-900 shadow-2xs"
                      : "text-stone-500 hover:text-zinc-800"
                  }`}
                >
                  📁 Upload File
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("paste")}
                  className={`flex-1 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                    activeTab === "paste"
                      ? "bg-white text-zinc-900 shadow-2xs"
                      : "text-stone-500 hover:text-zinc-800"
                  }`}
                >
                  📋 Paste Code
                </button>
              </div>

              {/* Input Area */}
              {activeTab === "file" ? (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="p-6 rounded-2xl border-2 border-dashed border-stone-300 hover:border-zinc-800 bg-white hover:bg-stone-50/50 text-center cursor-pointer transition-colors shadow-2xs flex flex-col items-center justify-center space-y-2"
                  >
                    <span className="text-2xl">📄</span>
                    <div>
                      <p className="text-xs font-bold text-zinc-900">
                        {selectedFileName || "Choose a workout JSON file"}
                      </p>
                      <p className="text-[11px] text-stone-500 font-mono mt-0.5">
                        Tap to browse or drop file here (.json)
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <textarea
                    rows={4}
                    value={rawText}
                    onChange={(e) => handleTextChange(e.target.value)}
                    placeholder="Paste the workout code or JSON text here..."
                    className="w-full bg-white border border-stone-200 rounded-2xl p-3 text-xs font-mono text-zinc-800 placeholder-zinc-400 focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 shadow-2xs transition-colors"
                  />
                </div>
              )}

              {/* Error Alert */}
              {validation?.valid === false && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                  <p className="font-bold">Invalid Workout Data</p>
                  <p className="mt-0.5">{validation.error}</p>
                </div>
              )}

              {importError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                  <p className="font-bold">Import Failed</p>
                  <p className="mt-0.5">{importError}</p>
                </div>
              )}

              {/* Valid Preview: Single Workout */}
              {validation?.valid && !validation.isBundle && validation.workouts?.[0] && (
                <div className="p-4 rounded-2xl bg-white border border-stone-200 shadow-xs space-y-3">
                  <span className="text-[10px] font-mono uppercase font-bold text-emerald-700 tracking-wider block">
                    ✓ Valid Workout Detected
                  </span>

                  <div>
                    <label className="block text-[11px] font-mono uppercase font-bold text-stone-500 mb-1">
                      Workout Name
                    </label>
                    <input
                      type="text"
                      value={customWorkoutName}
                      onChange={(e) => setCustomWorkoutName(e.target.value)}
                      className="w-full h-9 bg-[#fafaf8] border border-stone-200 rounded-xl px-3 text-xs font-bold text-zinc-900 focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 shadow-2xs"
                    />
                  </div>

                  {validation.workouts[0].description && (
                    <p className="text-xs text-stone-500 leading-relaxed italic">
                      &quot;{validation.workouts[0].description}&quot;
                    </p>
                  )}

                  <div className="pt-2 border-t border-stone-100">
                    <p className="text-[11px] font-mono font-bold uppercase text-stone-500 mb-2">
                      Exercises ({validation.workouts[0].exercises.length})
                    </p>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {validation.workouts[0].exercises.map((ex, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between text-xs py-1 border-b border-stone-100/60 last:border-none"
                        >
                          <div className="min-w-0 pr-2">
                            <span className="font-medium text-zinc-900 block truncate">
                              {ex.name}
                            </span>
                            {ex.notes && (
                              <span className="text-[10px] text-stone-400 block truncate">
                                💬 {ex.notes}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] font-mono text-stone-500 shrink-0 font-medium">
                            {ex.targetSets} × {ex.targetReps}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Valid Preview: Multi-Workout Bundle */}
              {validation?.valid && validation.isBundle && validation.workouts && (
                <div className="p-4 rounded-2xl bg-white border border-stone-200 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase font-bold text-emerald-700 tracking-wider">
                      ✓ Bundle Detected ({validation.workouts.length} Workouts)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedIndices.length === validation.workouts!.length) {
                          setSelectedIndices([]);
                        } else {
                          setSelectedIndices(validation.workouts!.map((_, i) => i));
                        }
                      }}
                      className="text-[11px] font-mono text-stone-500 hover:text-zinc-900 font-medium"
                    >
                      {selectedIndices.length === validation.workouts.length
                        ? "Deselect All"
                        : "Select All"}
                    </button>
                  </div>

                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {validation.workouts.map((w, idx) => {
                      const isChecked = selectedIndices.includes(idx);
                      return (
                        <label
                          key={idx}
                          className={`flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition-colors ${
                            isChecked
                              ? "bg-stone-50 border-stone-300"
                              : "bg-white border-stone-200 opacity-60"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedIndices([...selectedIndices, idx]);
                                } else {
                                  setSelectedIndices(selectedIndices.filter((i) => i !== idx));
                                }
                              }}
                              className="w-4 h-4 rounded text-zinc-900 accent-zinc-900"
                            />
                            <span className="font-bold text-zinc-900 truncate">
                              {w.name}
                            </span>
                          </div>
                          <span className="text-[11px] font-mono text-stone-400 shrink-0">
                            {w.exercises.length} movements
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Action Button */}
              {validation?.valid && (
                <button
                  type="button"
                  onClick={handleExecuteImport}
                  disabled={isImporting}
                  className="w-full h-11 rounded-xl bg-zinc-900 hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50 text-white font-mono font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
                >
                  {isImporting ? (
                    <>
                      <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      <span>Importing...</span>
                    </>
                  ) : (
                    <span>
                      {validation.isBundle
                        ? `Import Selected (${selectedIndices.length}) Workouts`
                        : "Import Workout to Library"}
                    </span>
                  )}
                </button>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!importedSummary && (
          <div className="pt-3 border-t border-stone-200 flex justify-end">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-zinc-800 text-xs font-mono font-bold uppercase transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
