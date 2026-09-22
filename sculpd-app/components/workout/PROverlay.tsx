// components/workout/PROverlay.tsx
"use client";

import React, { useEffect } from "react";
import { PRResult } from "@/lib/pr/pr-detector";

interface PROverlayProps {
  prData: PRResult | null;
  onDismiss: () => void;
  autoDismissMs?: number;
}

export default function PROverlay({
  prData,
  onDismiss,
  autoDismissMs = 3200,
}: PROverlayProps) {
  useEffect(() => {
    if (!prData || !prData.isPR) return;

    const timer = setTimeout(() => {
      onDismiss();
    }, autoDismissMs);

    return () => clearTimeout(timer);
  }, [prData, onDismiss, autoDismissMs]);

  if (!prData || !prData.isPR || !prData.current) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-label="Personal Record Achievement"
      onClick={onDismiss}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 bg-black/95 backdrop-blur-md cursor-pointer animate-in fade-in duration-200"
    >
      <div className="w-full max-w-sm text-center space-y-6">
        {/* PR Badge */}
        <div className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-amber-500/20 border border-amber-400/60 shadow-lg shadow-amber-950/50 animate-bounce">
          <span className="text-amber-400 text-xs font-mono font-black tracking-widest uppercase">
            ★ NEW PR
          </span>
          {prData.badgeText && (
            <span className="text-[10px] font-mono font-bold bg-amber-400 text-black px-1.5 py-0.5 rounded-full">
              {prData.badgeText}
            </span>
          )}
        </div>

        {/* Exercise Name */}
        <div>
          <h2 className="text-3xl font-black uppercase tracking-tight text-white leading-tight">
            {prData.exerciseName || "EXERCISE"}
          </h2>
        </div>

        {/* New Performance Highlight */}
        <div className="py-4 border-y border-zinc-800 space-y-1">
          <div className="text-5xl font-mono font-black text-amber-400 tracking-tight">
            {prData.current.weight} <span className="text-2xl text-zinc-400 font-medium">lbs</span> × {prData.current.reps}
          </div>
          <p className="text-xs font-mono uppercase tracking-widest text-zinc-500">
            All-Time Milestone
          </p>
        </div>

        {/* Previous Benchmark Reference */}
        {prData.previous && (
          <div className="font-mono text-sm space-y-1 text-zinc-400">
            <span className="text-[11px] uppercase tracking-widest text-zinc-600 block">
              Previous:
            </span>
            <span className="text-zinc-300 font-bold">
              {prData.previous.weight} lbs × {prData.previous.reps}
            </span>
          </div>
        )}

        <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-600 pt-2">
          Tap anywhere to return
        </p>
      </div>
    </div>
  );
}
