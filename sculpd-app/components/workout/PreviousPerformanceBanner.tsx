// components/workout/PreviousPerformanceBanner.tsx
"use client";

import React from "react";
import { WorkoutSet } from "@/types/models";

interface PreviousPerformanceBannerProps {
  previousSet: WorkoutSet | null;
  isLoading?: boolean;
}

export default function PreviousPerformanceBanner({
  previousSet,
  isLoading,
}: PreviousPerformanceBannerProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-900/40 border border-zinc-800/80 mb-3 text-xs text-zinc-500 animate-pulse font-mono">
        Loading previous performance...
      </div>
    );
  }

  if (!previousSet) {
    return (
      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-900/40 border border-zinc-800/70 mb-3">
        <span className="text-[11px] font-mono text-zinc-400">
          Previous Benchmark
        </span>
        <span className="text-[11px] font-mono text-zinc-500 italic">
          First time logging this exercise
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-emerald-950/20 border border-emerald-500/30 mb-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 font-bold">
          Prev Performance
        </span>
      </div>
      <div className="flex items-center gap-1.5 font-mono">
        <span className="text-xs font-bold text-white">
          {previousSet.weight} lbs
        </span>
        <span className="text-zinc-500 text-xs">×</span>
        <span className="text-xs font-bold text-emerald-400">
          {previousSet.reps} reps
        </span>
      </div>
    </div>
  );
}
