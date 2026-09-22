// components/dashboard/DashboardClient.tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useUser } from "@/components/auth/UserContext";
import WhoIsTrainingView from "@/components/auth/WhoIsTrainingView";
import UserBar from "@/components/auth/UserBar";
import { getAllRoutines, seedDefaultCatalog } from "@/lib/db/routine-repository";
import {
  getActiveWorkoutSession,
  cancelWorkoutSession,
} from "@/lib/db/workout-repository";

export default function DashboardClient() {
  const { activeUserId, isLoading: isAuthLoading } = useUser();
  const [isDiscarding, setIsDiscarding] = useState(false);

  // Seed default routines and exercises on mount (runs outside liveQuery)
  useEffect(() => {
    seedDefaultCatalog().catch((err) => {
      console.warn("Catalog seed notice:", err);
    });
  }, []);

  // 1. Live Query: Load all routines from IndexedDB
  const routines = useLiveQuery(
    async () => {
      return getAllRoutines();
    },
    [],
    []
  );

  // 2. Live Query: Detect if active user has an in-progress workout session
  const activeSession = useLiveQuery(
    async () => {
      if (!activeUserId) return undefined;
      return getActiveWorkoutSession(activeUserId);
    },
    [activeUserId],
    undefined
  );

  // Find the routine corresponding to the active workout session
  const activeSessionRoutine = useLiveQuery(
    async () => {
      if (!activeSession) return undefined;
      return db.routines.get(activeSession.routineId);
    },
    [activeSession?.routineId],
    undefined
  );

  const handleDiscardSession = async () => {
    if (!activeUserId || !activeSession) return;
    try {
      setIsDiscarding(true);
      await cancelWorkoutSession(activeUserId, activeSession.id);
    } catch (err) {
      console.error("Failed to discard session:", err);
    } finally {
      setIsDiscarding(false);
    }
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4">
        <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin mb-4" />
        <p className="text-xs font-mono uppercase tracking-widest text-zinc-500">
          Loading Sculp’d...
        </p>
      </div>
    );
  }

  // Gate: If no active user is signed in, present "Who's training?"
  if (!activeUserId) {
    return <WhoIsTrainingView />;
  }

  return (
    <main className="min-h-screen bg-black text-white p-4 font-sans flex flex-col justify-between pb-12 max-w-md mx-auto w-full">
      {/* Upper Section with Active Profile Bar & Brand */}
      <div>
        <UserBar />

        <header className="pt-3 pb-3">
          <h1 className="text-3xl font-black tracking-tighter text-zinc-100 uppercase">
            SCULP’D
          </h1>
          <p className="text-xs font-medium text-zinc-500 mt-0.5 tracking-wide">
            High-Efficiency Workout Architecture
          </p>
        </header>

        {/* Resume Unfinished Workout Banner */}
        {activeSession && activeSessionRoutine && (
          <div className="mb-4 p-3.5 rounded-xl bg-gradient-to-r from-emerald-500/20 via-zinc-900 to-zinc-900 border border-emerald-500/40 shadow-lg shadow-emerald-950/30 animate-in fade-in duration-200">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400">
                  Workout In Progress
                </span>
              </div>
              <button
                type="button"
                onClick={handleDiscardSession}
                disabled={isDiscarding}
                className="text-[10px] font-mono uppercase text-zinc-500 hover:text-rose-400 transition-colors"
              >
                {isDiscarding ? "Discarding..." : "Discard"}
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black uppercase text-white tracking-tight">
                  {activeSessionRoutine.dayName}
                </h3>
                <p className="text-xs text-zinc-400 line-clamp-1">
                  {activeSessionRoutine.focusTarget}
                </p>
              </div>

              <Link
                href={`/workout/${activeSessionRoutine.slug}`}
                className="h-9 px-3.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-mono font-black text-xs uppercase tracking-wider flex items-center gap-1 active:scale-95 transition-all shadow-md shadow-emerald-950/40"
              >
                <span>Resume</span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={3}
                  stroke="currentColor"
                  className="w-3.5 h-3.5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.25 4.5l7.5 7.5-7.5 7.5"
                  />
                </svg>
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Main Routine Navigation Array loaded from IndexedDB */}
      <div className="flex-1 flex flex-col justify-center space-y-3 my-auto w-full">
        {routines.map((routine) => {
          const isThisActive = activeSession?.routineId === routine.id;

          return (
            <Link
              key={routine.id}
              href={`/workout/${routine.slug}`}
              className={`w-full p-4 rounded-xl bg-gradient-to-r ${routine.color} border ${
                isThisActive
                  ? "border-emerald-500/70 shadow-md shadow-emerald-950/30"
                  : "border-zinc-800/80 hover:border-zinc-700"
              } flex items-center justify-between transition-all duration-200 active:scale-[0.98] group`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-black tracking-tight text-zinc-200 group-hover:text-white uppercase">
                    {routine.dayName}
                  </h2>
                  {isThisActive && (
                    <span className="text-[9px] font-mono uppercase bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 px-1.5 py-0.5 rounded font-bold">
                      Active
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-400 font-medium line-clamp-1">
                  {routine.focusTarget}
                </p>
              </div>
              <div className="w-8 h-8 rounded-lg bg-zinc-950/60 border border-zinc-800 flex items-center justify-center text-zinc-500 group-hover:text-zinc-300">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2.5}
                  stroke="currentColor"
                  className="w-3.5 h-3.5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.25 4.5l7.5 7.5-7.5 7.5"
                  />
                </svg>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Static Footer Context */}
      <footer className="text-center pt-4">
        <p className="text-[10px] font-mono tracking-widest text-zinc-600 uppercase">
          Sculp’d 2.0 • Gym-Floor Architecture Verified
        </p>
      </footer>
    </main>
  );
}
