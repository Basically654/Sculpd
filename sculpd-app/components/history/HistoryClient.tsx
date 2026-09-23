// components/history/HistoryClient.tsx
"use client";

import React from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { useUser } from "@/components/auth/UserContext";
import WhoIsTrainingView from "@/components/auth/WhoIsTrainingView";
import UserBar from "@/components/auth/UserBar";
import {
  getCompletedWorkoutSummaries,
  CompletedWorkoutSummary,
} from "@/lib/history/history-service";
import { getActiveWorkoutSession } from "@/lib/db/workout-repository";

export default function HistoryClient() {
  const { activeUserId, isLoading: isAuthLoading } = useUser();

  // 1. Live Query: Retrieve all completed workout summaries
  const completedWorkouts = useLiveQuery(
    async () => {
      if (!activeUserId) return [];
      return getCompletedWorkoutSummaries(activeUserId);
    },
    [activeUserId]
  );

  // 2. Live Query: Check for any unfinished in-progress workout session
  const activeSession = useLiveQuery(
    async () => {
      if (!activeUserId) return undefined;
      return getActiveWorkoutSession(activeUserId);
    },
    [activeUserId],
    undefined
  );

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-[#fafaf8] text-zinc-900 flex flex-col items-center justify-center p-4">
        <div className="w-8 h-8 rounded-full border-2 border-zinc-800 border-t-transparent animate-spin mb-4" />
        <p className="text-xs font-mono uppercase tracking-widest text-stone-500">
          Loading History...
        </p>
      </div>
    );
  }

  if (!activeUserId) {
    return <WhoIsTrainingView />;
  }

  const workouts = completedWorkouts || [];

  return (
    <main className="min-h-screen bg-[#fafaf8] text-zinc-900 p-4 font-sans flex flex-col justify-between pb-12 max-w-md mx-auto w-full">
      {/* Upper Section */}
      <div>
        <UserBar />

        {/* Header with Back button to Dashboard */}
        <header className="pt-2 pb-4">
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
              href="/analytics"
              className="text-stone-400 hover:text-zinc-900 uppercase font-bold flex items-center gap-1 transition-colors p-1 -m-1"
              title="View Training Analytics"
            >
              <span>Analytics</span>
              <span>→</span>
            </Link>
          </div>

          <div className="flex items-baseline justify-between">
            <h1 className="text-2xl font-black tracking-tight text-zinc-900 uppercase">
              WORKOUT HISTORY
            </h1>
            <span className="text-xs font-mono text-stone-400">
              {workouts.length} {workouts.length === 1 ? "workout" : "workouts"}
            </span>
          </div>
          <p className="text-xs text-stone-500 font-medium tracking-wide mt-0.5">
            Completed Gym-Floor Sessions
          </p>
        </header>

        {/* In-Progress Session Distinct Callout (Excluded from completed history) */}
        {activeSession && (
          <div className="mb-5 p-3.5 rounded-2xl bg-amber-50/60 border border-amber-200/80 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-600 animate-pulse" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-900">
                  In Progress
                </span>
                <span className="text-stone-400">•</span>
                <span className="text-xs font-bold text-zinc-900 truncate max-w-[150px]">
                  {activeSession.routineName || "Workout"}
                </span>
              </div>
              <Link
                href={`/workout/${activeSession.routineId}`}
                className="text-[11px] font-mono font-bold uppercase tracking-wider text-amber-900 hover:text-black underline underline-offset-2"
              >
                Resume →
              </Link>
            </div>
          </div>
        )}

        {/* Completed Workouts List or Empty State */}
        {workouts.length === 0 ? (
          <div className="py-12 p-8 rounded-2xl border border-dashed border-stone-300 bg-white/60 text-center flex flex-col items-center justify-center space-y-3 shadow-xs my-6">
            <div className="w-12 h-12 rounded-2xl bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-400 text-lg">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.75}
                stroke="currentColor"
                className="w-6 h-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-bold text-zinc-900">
                No completed workouts yet.
              </h2>
              <p className="text-xs text-stone-500 max-w-xs leading-relaxed">
                When you finish a workout on the gym floor, your recorded sets, volume, and PRs will appear here.
              </p>
            </div>
            <Link
              href="/"
              className="mt-2 px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-xs cursor-pointer active:scale-95"
            >
              Start a Workout
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {workouts.map((workout) => (
              <Link
                key={workout.id}
                href={`/history/${workout.id}`}
                className="block p-4 rounded-2xl bg-white border border-stone-200 hover:border-stone-300 transition-all shadow-xs group cursor-pointer active:scale-[0.99]"
              >
                {/* Header row: Routine Name & Date */}
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <h2 className="text-base font-bold tracking-tight text-zinc-900 group-hover:text-zinc-700 transition-colors">
                    {workout.routineName}
                  </h2>
                  <span className="text-xs font-mono text-stone-500 shrink-0 pt-0.5">
                    {workout.formattedDate}
                  </span>
                </div>

                {/* Second row: Duration */}
                <div className="text-xs font-mono font-medium text-stone-600 mb-2">
                  {workout.formattedDuration}
                </div>

                {/* Third row: Sets • Exercises & PRs / Volume */}
                <div className="flex items-center justify-between pt-2 border-t border-stone-100 text-xs font-mono">
                  <span className="text-stone-500">
                    {workout.totalSets} {workout.totalSets === 1 ? "set" : "sets"} •{" "}
                    {workout.totalExercises} {workout.totalExercises === 1 ? "exercise" : "exercises"}
                  </span>

                  <div className="flex items-center gap-2">
                    {workout.prCount > 0 && (
                      <span className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded font-mono">
                        {workout.prCount} {workout.prCount === 1 ? "PR" : "PRs"}
                      </span>
                    )}
                    <span className="text-stone-300 group-hover:text-zinc-800 group-hover:translate-x-0.5 transition-all">
                      →
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Static Footer Context */}
      <footer className="text-center pt-6">
        <p className="text-[10px] font-mono tracking-widest text-stone-400 uppercase">
          Sculp’d • Immutable Workout History
        </p>
      </footer>
    </main>
  );
}
