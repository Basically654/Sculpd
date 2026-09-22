// components/timer/RestTimerBar.tsx
"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { useTimer } from "./TimerContext";

export default function RestTimerBar() {
  const pathname = usePathname();
  const { remaining, totalDuration, isActive, skip, addTime } = useTimer();

  // If currently on an active workout screen, the dominant rest view takes over
  if (pathname?.startsWith("/workout")) {
    return null;
  }

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
        className={`flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border border-stone-200 bg-white/95 backdrop-blur-md shadow-lg ${
          remaining === 0 ? "ring-2 ring-zinc-900 animate-pulse" : ""
        }`}
      >
        <div className="flex flex-col min-w-[56px]">
          <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-400 font-semibold">
            Rest
          </span>
          <span className="text-base font-mono font-bold text-zinc-900">
            {mins > 0 ? `${mins}:${secs.toString().padStart(2, "0")}` : `${secs}s`}
          </span>
        </div>

        <div className="flex-1 bg-stone-100 h-2 rounded-full overflow-hidden mx-1 border border-stone-200">
          <div
            style={{ width: `${progressPercent}%` }}
            className="h-full bg-zinc-900 transition-all duration-300"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => addTime(30)}
            className="text-[11px] font-mono font-bold text-zinc-700 hover:text-zinc-900 bg-stone-100 hover:bg-stone-200 active:scale-95 px-2.5 py-1 rounded-lg transition-all cursor-pointer"
            title="Add 30 seconds"
          >
            +30s
          </button>
          <button
            type="button"
            onClick={skip}
            className="text-[11px] font-mono font-bold text-zinc-500 hover:text-zinc-900 bg-stone-100 hover:bg-stone-200 active:scale-95 px-2.5 py-1 rounded-lg transition-all cursor-pointer"
          >
            Skip
          </button>
        </div>
      </div>
    </aside>
  );
}
