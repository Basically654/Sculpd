"use client";

import React from "react";
import { useTimer } from "./TimerContext";

export default function RestTimerBar() {
  const { remaining, isActive, skip } = useTimer();

  if (!isActive && remaining === 0) return null;

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;

  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 w-[92%] max-w-md z-50">
      <div
        className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900/80 backdrop-blur-sm shadow-lg ${remaining === 0 ? "animate-pulse border-emerald-400" : ""}`}
      >
        <div className="flex flex-col">
          <span className="text-xs text-zinc-400">Rest</span>
          <span className="text-sm font-mono font-bold text-emerald-300">
            {mins > 0 ? `${mins}:` : ""}
            {secs.toString().padStart(2, "0")}
          </span>
        </div>
        <div className="flex-1 bg-zinc-800 h-2 rounded-full overflow-hidden mx-3">
          <div
            style={{
              width: `${Math.min(100, ((90 - remaining) / 90) * 100)}%`,
            }}
            className="h-full bg-emerald-500"
          />
        </div>
        <button
          onClick={skip}
          className="text-xs text-zinc-200 bg-zinc-800/50 px-3 py-1 rounded-md"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
