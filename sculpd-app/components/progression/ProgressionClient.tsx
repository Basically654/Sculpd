// components/progression/ProgressionClient.tsx
"use client";

import React from "react";
import Link from "next/link";
import { useUser } from "@/components/auth/UserContext";
import WhoIsTrainingView from "@/components/auth/WhoIsTrainingView";
import UserBar from "@/components/auth/UserBar";
import AchievementsView from "./AchievementsView";

export default function ProgressionClient() {
  const { activeUserId, isLoading: isAuthLoading } = useUser();

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-[#fafaf8] text-zinc-900 flex flex-col items-center justify-center p-4">
        <div className="w-8 h-8 rounded-full border-2 border-zinc-800 border-t-transparent animate-spin mb-4" />
        <p className="text-xs font-mono uppercase tracking-widest text-stone-500">
          Loading Progression...
        </p>
      </div>
    );
  }

  if (!activeUserId) {
    return <WhoIsTrainingView />;
  }

  return (
    <main className="min-h-screen bg-[#fafaf8] text-zinc-900 p-4 font-sans flex flex-col justify-between pb-12 max-w-md mx-auto w-full overflow-x-hidden">
      <div>
        <UserBar />

        {/* Navigation Header */}
        <header className="pt-2 pb-3">
          <div className="flex items-center justify-between mb-2 text-xs font-mono">
            <Link
              href="/"
              className="text-stone-400 hover:text-zinc-900 uppercase font-bold flex items-center gap-1 transition-colors p-1 -m-1"
              title="Return to Dashboard"
            >
              <span>←</span>
              <span>Dashboard</span>
            </Link>
            <div className="flex items-center gap-3">
              <Link
                href="/history"
                className="text-stone-400 hover:text-zinc-900 uppercase font-bold flex items-center gap-1 transition-colors p-1 -m-1"
                title="View Workout Calendar & History"
              >
                <span>History</span>
              </Link>
              <Link
                href="/analytics"
                className="text-stone-400 hover:text-zinc-900 uppercase font-bold flex items-center gap-1 transition-colors p-1 -m-1"
                title="View Analytics"
              >
                <span>Stats</span>
                <span>→</span>
              </Link>
            </div>
          </div>

          <div className="flex items-baseline justify-between">
            <h1 className="text-2xl font-black tracking-tight text-zinc-900 uppercase">
              Ranks & Progression
            </h1>
          </div>
          <p className="text-xs text-stone-500 font-medium tracking-wide mt-0.5">
            Verified Accomplishments & Monthly Accountability
          </p>
        </header>

        {/* Achievements & Progression Content */}
        <AchievementsView userId={activeUserId} />
      </div>

      {/* Footer */}
      <footer className="mt-8 pt-4 border-t border-stone-200/80 text-center">
        <p className="text-[10px] font-mono uppercase tracking-widest text-stone-400">
          Sculp&apos;d Progression Engine • Deterministic Training Milestones
        </p>
      </footer>
    </main>
  );
}
