// components/history/WorkoutDetailClient.tsx
"use client";

import React from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { useUser } from "@/components/auth/UserContext";
import WhoIsTrainingView from "@/components/auth/WhoIsTrainingView";
import UserBar from "@/components/auth/UserBar";
import {
  getCompletedWorkoutDetail,
  CompletedWorkoutDetail,
} from "@/lib/history/history-service";
import { formatSetLoad } from "@/lib/load/load-utils";

interface WorkoutDetailClientProps {
  sessionId: string;
}

export default function WorkoutDetailClient({
  sessionId,
}: WorkoutDetailClientProps) {
  const { activeUserId, isLoading: isAuthLoading } = useUser();

  const workoutDetail = useLiveQuery(
    async () => {
      if (!activeUserId || !sessionId) return undefined;
      return getCompletedWorkoutDetail(activeUserId, sessionId);
    },
    [activeUserId, sessionId]
  );

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-[#fafaf8] text-zinc-900 flex flex-col items-center justify-center p-4">
        <div className="w-8 h-8 rounded-full border-2 border-zinc-800 border-t-transparent animate-spin mb-4" />
        <p className="text-xs font-mono uppercase tracking-widest text-stone-500">
          Loading Workout Record...
        </p>
      </div>
    );
  }

  if (!activeUserId) {
    return <WhoIsTrainingView />;
  }

  if (!workoutDetail) {
    return (
      <main className="min-h-screen bg-[#fafaf8] text-zinc-900 p-4 font-sans flex flex-col justify-between max-w-md mx-auto w-full">
        <div>
          <UserBar />
          <div className="pt-4 pb-8 space-y-4 text-center">
            <p className="text-xs font-mono text-stone-500">
              Workout record not found or still in progress.
            </p>
            <Link
              href="/history"
              className="inline-block px-4 py-2 rounded-xl bg-zinc-900 text-white text-xs font-mono uppercase font-bold tracking-wider"
            >
              ← Back to History
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#fafaf8] text-zinc-900 p-4 font-sans flex flex-col justify-between pb-12 max-w-md mx-auto w-full">
      {/* Upper Navigation & Session Header */}
      <div className="space-y-6">
        <UserBar />

        {/* Back link to History */}
        <div>
          <Link
            href="/history"
            className="text-stone-400 hover:text-zinc-900 text-xs font-mono uppercase font-bold inline-flex items-center gap-1 transition-colors p-1 -m-1"
            title="Return to History"
          >
            <span>←</span>
            <span>Back to History</span>
          </Link>
        </div>

        {/* Workout Title, Date & Time Details */}
        <header className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-zinc-950 leading-tight">
            {workoutDetail.routineName}
          </h1>
          <p className="text-xs font-mono text-stone-500">
            {workoutDetail.formattedDate}
          </p>
          <div className="pt-2 flex items-baseline gap-2">
            <span className="text-base font-bold font-mono text-zinc-900">
              {workoutDetail.formattedDuration}
            </span>
            <span className="text-xs font-mono text-stone-400">
              ({workoutDetail.startTimeFormatted} – {workoutDetail.completionTimeFormatted})
            </span>
          </div>
        </header>

        {/* SUMMARY Card */}
        <section className="p-4 rounded-2xl bg-white border border-stone-200 shadow-xs space-y-3 font-mono">
          <span className="text-[10px] uppercase tracking-widest text-stone-400 font-bold block">
            SUMMARY
          </span>

          <div className="grid grid-cols-2 gap-y-3 gap-x-4 pt-1">
            <div>
              <span className="text-xs text-stone-400 block uppercase text-[10px]">
                Total Sets
              </span>
              <span className="text-lg font-bold text-zinc-900">
                {workoutDetail.totalSets}
              </span>
            </div>

            <div>
              <span className="text-xs text-stone-400 block uppercase text-[10px]">
                Exercises
              </span>
              <span className="text-lg font-bold text-zinc-900">
                {workoutDetail.totalExercises}
              </span>
            </div>

            <div>
              <span className="text-xs text-stone-400 block uppercase text-[10px]">
                Volume
              </span>
              <span className="text-lg font-bold text-zinc-900">
                {workoutDetail.formattedVolume}
              </span>
            </div>

            {workoutDetail.prCount > 0 ? (
              <div>
                <span className="text-xs text-amber-700 block uppercase text-[10px]">
                  Personal Records
                </span>
                <span className="text-lg font-bold text-amber-800">
                  {workoutDetail.prCount} {workoutDetail.prCount === 1 ? "PR" : "PRs"}
                </span>
              </div>
            ) : (
              <div>
                <span className="text-xs text-stone-400 block uppercase text-[10px]">
                  Personal Records
                </span>
                <span className="text-sm font-semibold text-stone-400">
                  —
                </span>
              </div>
            )}
          </div>
        </section>

        {/* PR Highlights Callout (if any PRs were achieved) */}
        {workoutDetail.prs.length > 0 && (
          <section className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/80 space-y-2 font-mono">
            <div className="flex items-center gap-1.5 text-amber-900 text-xs font-bold uppercase tracking-wider">
              <span>★</span>
              <span>PRs Achieved This Workout</span>
            </div>
            <div className="space-y-1.5 pt-1">
              {workoutDetail.prs.map((pr, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between text-xs py-1 border-b border-amber-200/40 last:border-b-0"
                >
                  <span className="font-bold text-zinc-900">
                    {pr.exerciseName}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {pr.badgeText && (
                      <span className="text-[10px] bg-amber-100/90 text-amber-900 px-1.5 py-0.5 rounded font-bold">
                        {pr.badgeText}
                      </span>
                    )}
                    <span className="text-amber-900 font-semibold">
                      {pr.current?.displayText || `${pr.current?.weight} lbs`} × {pr.current?.reps}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Exercises & Logged Sets in Actual Order */}
        <section className="space-y-5">
          {workoutDetail.exercises.map((ex) => (
            <div
              key={ex.exerciseId}
              className="p-4 rounded-2xl bg-white border border-stone-200 shadow-xs space-y-2.5"
            >
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-black uppercase tracking-tight text-zinc-950 font-mono">
                  {ex.exerciseName}
                </h2>
                {ex.isBodyweight && (
                  <span className="text-[9px] font-mono uppercase bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded font-semibold">
                    Bodyweight
                  </span>
                )}
              </div>

              {/* Logged Sets in Actual Order */}
              <div className="space-y-1.5 font-mono">
                {ex.sets.map((s) => {
                  const loadStr = formatSetLoad(s, ex.isBodyweight);
                  return (
                    <div
                      key={s.id}
                      className="flex items-center justify-between py-1 px-2.5 rounded-lg bg-stone-50/80 text-xs"
                    >
                      <span className="text-stone-400 text-[11px] font-medium">
                        Set {s.setNumber}
                      </span>
                      <span className="font-bold text-zinc-900">
                        {loadStr} × {s.reps}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>

        {/* Workout Notes (if saved during workout) */}
        {workoutDetail.notes && (
          <section className="p-4 rounded-2xl bg-stone-50 border border-stone-200 shadow-xs space-y-1 font-mono">
            <span className="text-[10px] uppercase tracking-wider text-stone-500 font-bold block">
              Session Notes
            </span>
            <p className="text-xs text-zinc-800 whitespace-pre-wrap leading-relaxed">
              {workoutDetail.notes}
            </p>
          </section>
        )}
      </div>

      {/* Bottom Navigation */}
      <footer className="pt-8 text-center space-y-3">
        <Link
          href="/history"
          className="inline-flex items-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wider text-stone-500 hover:text-zinc-900 transition-colors"
        >
          <span>←</span>
          <span>Back to History</span>
        </Link>
        <p className="text-[10px] font-mono tracking-widest text-stone-400 uppercase block">
          Sculp’d • Immutable Workout History
        </p>
      </footer>
    </main>
  );
}
