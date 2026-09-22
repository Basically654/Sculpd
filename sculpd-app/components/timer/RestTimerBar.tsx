// components/timer/RestTimerBar.tsx
"use client";

import React from "react";
import { useTimer } from "./TimerContext";

export default function RestTimerBar() {
  const { remaining, totalDuration, isActive, skip, addTime } = useTimer();

  if (!isActive && remaining === 0) return null;

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const progressPercent =
    totalDuration > 0
      ? Math.min(100, Math.max(0, ((totalDuration - remaining) / totalDuration) * 100))
      : 0;

  return (
    <aside
      aria-label="Rest timer"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[94%] max-w-md z-50 pointer-events-auto transition-all"
    >
      <div
        className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border border-emerald-500/50 bg-zinc-950/95 backdrop-blur-md shadow-2xl shadow-emerald-950/40 ${
          remaining === 0 ? "animate-pulse border-emerald-400" : ""
        }`}
      >
        <div className="flex flex-col min-w-[56px]">
          <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-400">
            Rest
          </span>
          <span className="text-base font-mono font-black text-emerald-400">
            {mins > 0 ? `${mins}:${secs.toString().padStart(2, "0")}` : `${secs}s`}
          </span>
        </div>

        <div className="flex-1 bg-zinc-900 h-2 rounded-full overflow-hidden mx-1 border border-zinc-800">
          <div
            style={{ width: `${progressPercent}%` }}
            className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => addTime(30)}
            className="text-[11px] font-mono font-bold text-zinc-300 hover:text-white bg-zinc-800/80 hover:bg-zinc-700 active:scale-95 px-2.5 py-1 rounded-md transition-all"
            title="Add 30 seconds"
          >
            +30s
          </button>
          <button
            type="button"
            onClick={skip}
            className="text-[11px] font-mono font-bold text-zinc-400 hover:text-white bg-zinc-800/40 hover:bg-zinc-800 active:scale-95 px-2.5 py-1 rounded-md transition-all"
          >
            Skip
          </button>
        </div>
      </div>
    </aside>
  );
}
