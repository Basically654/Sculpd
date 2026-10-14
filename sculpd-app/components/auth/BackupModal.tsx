// components/auth/BackupModal.tsx
"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  getLastBackupTime,
  triggerBackupDownload,
  checkDatabaseState,
  validateBackup,
  restoreBackup,
  exportBackupToJson,
  DatabaseStateReport,
  BackupValidationResult,
  RestoreStrategy,
} from "@/lib/db/backup";
import { useUser } from "./UserContext";

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function BackupModal({ isOpen, onClose }: BackupModalProps) {
  const { refreshProfiles, activeUserId } = useUser();
  const [activeTab, setActiveTab] = useState<"export" | "restore">("export");

  // Export state
  const [lastExport, setLastExport] = useState<string | null>(null);
  const [dbState, setDbState] = useState<DatabaseStateReport | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccessMsg, setExportSuccessMsg] = useState<string | null>(null);
  const [exportErrorMsg, setExportErrorMsg] = useState<string | null>(null);
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);

  // Restore state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [rawRestoreInput, setRawRestoreInput] = useState<string>("");
  const [showManualPaste, setShowManualPaste] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<BackupValidationResult | null>(null);
  const [restoreStrategy, setRestoreStrategy] = useState<RestoreStrategy>("merge_skip_existing");
  const [confirmCheckbox, setConfirmCheckbox] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreSuccessMsg, setRestoreSuccessMsg] = useState<string | null>(null);
  const [restoreErrorMsg, setRestoreErrorMsg] = useState<string | null>(null);

  // Load initial status on open
  useEffect(() => {
    if (isOpen) {
      setLastExport(getLastBackupTime());
      checkDatabaseState().then(setDbState).catch(console.warn);
      setExportSuccessMsg(null);
      setExportErrorMsg(null);
      setCopiedToClipboard(false);
      setRestoreSuccessMsg(null);
      setRestoreErrorMsg(null);
      setSelectedFileName(null);
      setRawRestoreInput("");
      setValidationResult(null);
      setConfirmCheckbox(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Format timestamp helper
  const formatTime = (isoString: string | null) => {
    if (!isoString) return "Never";
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  // --- Export Handlers ---
  const handleExportDownload = async () => {
    setIsExporting(true);
    setExportSuccessMsg(null);
    setExportErrorMsg(null);

    try {
      const res = await triggerBackupDownload();
      if (res.success) {
        setExportSuccessMsg(`✓ Backup saved: ${res.filename}`);
        setLastExport(new Date().toISOString());
      } else if (res.error) {
        setExportErrorMsg(res.error);
      }
    } catch (err: any) {
      setExportErrorMsg(err?.message || "Failed to export backup.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyBackupJson = async () => {
    try {
      const { jsonString } = await exportBackupToJson();
      await navigator.clipboard.writeText(jsonString);
      setCopiedToClipboard(true);
      setTimeout(() => setCopiedToClipboard(false), 3000);
    } catch (err: any) {
      setExportErrorMsg("Clipboard copy failed: " + (err?.message || "Unknown error"));
    }
  };

  // --- Restore Handlers ---
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFileName(file.name);
    setRestoreSuccessMsg(null);
    setRestoreErrorMsg(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setRawRestoreInput(content);
      const val = validateBackup(content);
      setValidationResult(val);
      if (!val.valid) {
        setRestoreErrorMsg(val.error || "Invalid backup file");
      }
    };
    reader.onerror = () => {
      setRestoreErrorMsg("Failed to read the selected file.");
    };
    reader.readAsText(file);
  };

  const handleManualPasteChange = (text: string) => {
    setRawRestoreInput(text);
    setRestoreSuccessMsg(null);
    setRestoreErrorMsg(null);
    if (!text.trim()) {
      setValidationResult(null);
      return;
    }
    const val = validateBackup(text);
    setValidationResult(val);
    if (!val.valid) {
      setRestoreErrorMsg(val.error || "Invalid backup JSON");
    }
  };

  const handleExecuteRestore = async () => {
    if (!validationResult?.backup) return;

    if (dbState?.isPopulated && !confirmCheckbox) {
      setRestoreErrorMsg("Please check the confirmation box before proceeding with restore.");
      return;
    }

    setIsRestoring(true);
    setRestoreErrorMsg(null);
    setRestoreSuccessMsg(null);

    try {
      const res = await restoreBackup(validationResult.backup, {
        strategy: restoreStrategy,
        activeUserId,
      });

      if (res.success) {
        await refreshProfiles();
        // Refresh local db state
        const updatedState = await checkDatabaseState();
        setDbState(updatedState);

        const summaryText =
          res.strategy === "replace"
            ? `Restored ${res.restored.workoutSessions} workouts, ${res.restored.routines} routines, and ${res.restored.sets} sets (database replaced).`
            : `Added ${res.restored.workoutSessions} workouts and ${res.restored.routines} routines (${res.skipped?.workoutSessions || 0} existing workouts preserved).`;

        setRestoreSuccessMsg(`✓ Restore complete! ${summaryText}`);
      }
    } catch (err: any) {
      setRestoreErrorMsg(err?.message || "Database restoration failed.");
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white border border-stone-200 rounded-3xl p-6 shadow-xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-stone-100">
          <div>
            <h3 className="text-base font-bold text-zinc-900 tracking-tight">
              Backup & Restore
            </h3>
            <p className="text-[11px] text-stone-500 font-medium">
              Private local database management
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-stone-100 text-stone-500 hover:text-zinc-900 flex items-center justify-center text-xs font-bold transition-colors cursor-pointer"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex rounded-xl bg-stone-100 p-1 mb-5">
          <button
            type="button"
            onClick={() => setActiveTab("export")}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === "export"
                ? "bg-white text-zinc-900 shadow-xs"
                : "text-stone-500 hover:text-zinc-900"
            }`}
          >
            Export Backup
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("restore")}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === "restore"
                ? "bg-white text-zinc-900 shadow-xs"
                : "text-stone-500 hover:text-zinc-900"
            }`}
          >
            Restore Backup
          </button>
        </div>

        {/* --- EXPORT TAB --- */}
        {activeTab === "export" && (
          <div className="space-y-4">
            {/* Status Card */}
            <div className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200 text-xs space-y-1.5">
              <div className="flex justify-between items-center text-stone-600">
                <span className="font-medium">Last Exported:</span>
                <span className="font-mono text-zinc-900 font-semibold">
                  {formatTime(lastExport)}
                </span>
              </div>
              <div className="flex justify-between items-center text-stone-600">
                <span className="font-medium">Workouts on Device:</span>
                <span className="font-mono text-zinc-900 font-semibold">
                  {dbState?.counts.workoutSessions ?? 0}
                </span>
              </div>
              <div className="flex justify-between items-center text-stone-600">
                <span className="font-medium">Routines on Device:</span>
                <span className="font-mono text-zinc-900 font-semibold">
                  {dbState?.counts.routines ?? 0}
                </span>
              </div>
              <div className="flex justify-between items-center text-stone-600">
                <span className="font-medium">Total Sets Logged:</span>
                <span className="font-mono text-zinc-900 font-semibold">
                  {dbState?.counts.sets ?? 0}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-stone-500 leading-relaxed">
              Generates a portable, unencrypted JSON backup of all athlete profiles, custom routines, exercise history, logged sets, and personal records. Credentials and PIN hashes are excluded for your security.
            </p>

            {exportSuccessMsg && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium">
                {exportSuccessMsg}
              </div>
            )}

            {exportErrorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                {exportErrorMsg}
              </div>
            )}

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={handleExportDownload}
                disabled={isExporting}
                className="w-full py-3 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 active:scale-[0.99] text-white font-bold text-xs uppercase tracking-wider transition-all shadow-xs cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isExporting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Preparing Backup...</span>
                  </>
                ) : (
                  <>
                    <span>⬇</span>
                    <span>Download Backup (.json)</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleCopyBackupJson}
                className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-stone-50 active:scale-[0.99] border border-stone-200 text-stone-700 font-medium text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>{copiedToClipboard ? "✓ Copied to Clipboard!" : "📋 Copy JSON to Clipboard"}</span>
              </button>
            </div>

            <div className="pt-2 border-t border-stone-100">
              <p className="text-[10px] text-stone-400 font-mono text-center">
                iOS Tip: When prompted, tap &quot;Save to Files&quot; or AirDrop to your computer.
              </p>
            </div>
          </div>
        )}

        {/* --- RESTORE TAB --- */}
        {activeTab === "restore" && (
          <div className="space-y-4">
            <p className="text-[11px] text-stone-500 leading-relaxed">
              Restore workout history, routines, and exercises from a previously exported Sculp&apos;d JSON backup file.
            </p>

            {/* File Picker Section */}
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 px-4 rounded-xl bg-stone-50 hover:bg-stone-100 border border-dashed border-stone-300 text-zinc-800 font-medium text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>📁</span>
                <span>{selectedFileName ? selectedFileName : "Select Backup File (.json)"}</span>
              </button>

              <div className="flex justify-end mt-1.5">
                <button
                  type="button"
                  onClick={() => setShowManualPaste(!showManualPaste)}
                  className="text-[11px] text-stone-400 hover:text-zinc-700 transition-colors cursor-pointer"
                >
                  {showManualPaste ? "Hide Manual Paste" : "Or paste JSON manually"}
                </button>
              </div>

              {showManualPaste && (
                <div className="mt-2 animate-in fade-in duration-150">
                  <textarea
                    rows={4}
                    value={rawRestoreInput}
                    onChange={(e) => handleManualPasteChange(e.target.value)}
                    placeholder="Paste Sculp'd backup JSON here..."
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-xs font-mono text-zinc-900 focus:outline-none focus:border-zinc-900"
                  />
                </div>
              )}
            </div>

            {/* Validation Feedback & Preview */}
            {validationResult && validationResult.valid && validationResult.summary && (
              <div className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200 text-xs space-y-2 animate-in fade-in duration-150">
                <div className="flex items-center gap-1.5 text-emerald-800 font-semibold text-[11px]">
                  <span>✓</span>
                  <span>Valid Sculp&apos;d Backup</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-stone-600 pt-1">
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-stone-400">Exported</span>
                    <span className="font-mono text-zinc-900 font-medium">
                      {formatTime(validationResult.summary.exportedAt)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-stone-400">Profiles</span>
                    <span className="font-mono text-zinc-900 font-medium">
                      {validationResult.summary.userNames.join(", ") || "1 profile"}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-stone-400">Workouts</span>
                    <span className="font-mono text-zinc-900 font-medium">
                      {validationResult.summary.workoutSessionCount} sessions
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-stone-400">Routines & Sets</span>
                    <span className="font-mono text-zinc-900 font-medium">
                      {validationResult.summary.routineCount} rtn • {validationResult.summary.setCount} sets
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Populated Database Notice & Strategy Choice */}
            {validationResult?.valid && (
              <div className="space-y-3">
                {dbState?.isPopulated ? (
                  <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200/90 text-xs space-y-2.5">
                    <div className="flex items-center gap-1.5 font-bold text-amber-900">
                      <span>⚠️</span>
                      <span>Target Database is Populated</span>
                    </div>
                    <p className="text-amber-800 text-[11px] leading-relaxed">
                      Your device currently holds {dbState.counts.workoutSessions} workouts and {dbState.counts.routines} routines. Choose a safe restoration strategy:
                    </p>

                    <div className="space-y-2 pt-1">
                      <label className="flex items-start gap-2.5 cursor-pointer">
                        <input
                          type="radio"
                          name="strategy"
                          value="merge_skip_existing"
                          checked={restoreStrategy === "merge_skip_existing"}
                          onChange={() => setRestoreStrategy("merge_skip_existing")}
                          className="mt-0.5 accent-zinc-900"
                        />
                        <div>
                          <span className="font-bold text-zinc-900 block text-xs">
                            Merge New Records (Safest)
                          </span>
                          <span className="text-[11px] text-stone-600 block leading-tight">
                            Preserves existing local workouts. Adds new records from backup without overwriting.
                          </span>
                        </div>
                      </label>

                      <label className="flex items-start gap-2.5 cursor-pointer">
                        <input
                          type="radio"
                          name="strategy"
                          value="replace"
                          checked={restoreStrategy === "replace"}
                          onChange={() => setRestoreStrategy("replace")}
                          className="mt-0.5 accent-zinc-900"
                        />
                        <div>
                          <span className="font-bold text-zinc-900 block text-xs">
                            Replace Database (Full Overwrite)
                          </span>
                          <span className="text-[11px] text-stone-600 block leading-tight">
                            Clears current local workouts and restores the exact state from this backup file.
                          </span>
                        </div>
                      </label>
                    </div>

                    <div className="pt-2 border-t border-amber-200">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={confirmCheckbox}
                          onChange={(e) => setConfirmCheckbox(e.target.checked)}
                          className="accent-zinc-900 rounded"
                        />
                        <span className="text-[11px] font-semibold text-amber-950">
                          I confirm I want to update my local database
                        </span>
                      </label>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium">
                    ✓ Clean local database: Ready for initial restoration.
                  </div>
                )}
              </div>
            )}

            {restoreErrorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                {restoreErrorMsg}
              </div>
            )}

            {restoreSuccessMsg && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium">
                {restoreSuccessMsg}
              </div>
            )}

            {/* Execute Restore Button */}
            <button
              type="button"
              onClick={handleExecuteRestore}
              disabled={
                !validationResult?.valid ||
                isRestoring ||
                (Boolean(dbState?.isPopulated) && !confirmCheckbox)
              }
              className="w-full py-3 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 active:scale-[0.99] text-white font-bold text-xs uppercase tracking-wider transition-all shadow-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isRestoring ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Restoring Database...</span>
                </>
              ) : (
                <span>Restore Database</span>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
