// components/calendar/CalendarClient.tsx
"use client";

import React from "react";
import Link from "next/link";
import { useUser } from "@/components/auth/UserContext";
import WhoIsTrainingView from "@/components/auth/WhoIsTrainingView";
import UserBar from "@/components/auth/UserBar";
import WorkoutCalendar from "./WorkoutCalendar";

export default function CalendarClient() {
  const { activeUserId, isLoading: isAuthLoading } = useUser();

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-[#fafaf8] text-zinc-900 flex flex-col items-center justify-center p-4">
        <div className="w-8 h-8 rounded-full border-2 border-zinc-800 border-t-transparent animate-spin mb-4" />
        <p className="text-xs font-mono uppercase tracking-widest text-stone-500">
          Loading Calendar...
        </p>
      </div>
    );
  }

  if (!activeUserId) {
    return <WhoIsTrainingView />;
  }

  return (
    <main className="min-h-screen bg-[#fafaf8] text-zinc-900 p-4 font-sans flex flex-col justify-between pb-12 max-w-md mx-auto w-full">
      <div>
        <UserBar />

        {/* Navigation header */}
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
            <Link
              href="/history"
              className="text-stone-400 hover:text-zinc-900 uppercase font-bold flex items-center gap-1 transition-colors p-1 -m-1"
              title="View History List"
            >
              <span>History List</span>
              <span>→</span>
            </Link>
          </div>
        </header>

        {/* Workout Calendar Component */}
        <WorkoutCalendar userId={activeUserId} />
      </div>

      {/* Footer */}
      <footer className="text-center pt-6">
        <p className="text-[10px] font-mono tracking-widest text-stone-400 uppercase">
          Sculp’d • Training Calendar & History
        </p>
      </footer>
    </main>
  );
}
