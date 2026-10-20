// components/dashboard/DashboardClient.tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useUser } from "@/components/auth/UserContext";
import WhoIsTrainingView from "@/components/auth/WhoIsTrainingView";
import UserBar from "@/components/auth/UserBar";
import { getUserRoutines } from "@/lib/db/routine-repository";
import { seedExerciseCatalog } from "@/lib/db/exercise-repository";
import {
  getActiveWorkoutSession,
  cancelWorkoutSession,
} from "@/lib/db/workout-repository";
import ExportWorkoutModal from "@/components/workout/ExportWorkoutModal";
import ImportWorkoutModal from "@/components/workout/ImportWorkoutModal";

export default function DashboardClient() {
  const { activeUserId, isLoading: isAuthLoading } = useUser();
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isExportAllModalOpen, setIsExportAllModalOpen] = useState(false);
  const [selectedRoutineForExport, setSelectedRoutineForExport] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // Seed standard exercise library on mount outside liveQuery
  useEffect(() => {
    seedExerciseCatalog().catch((err) => {
      console.warn("Exercise catalog seed notice:", err);
    });
  }, []);

  // 1. Live Query: Load user routines from IndexedDB with exercise counts
  const userRoutinesWithCounts = useLiveQuery(
    async () => {
      if (!activeUserId) return [];
      const routines = await getUserRoutines(activeUserId);

      const withCounts = await Promise.all(
        routines.map(async (routine) => {
          let count = await db.routineExercises
            .where("routineId")
            .equals(routine.id)
            .count();

          // Fallback check for legacy exercises
          if (count === 0) {
            count = await db.exercises.where("routineId").equals(routine.id).count();
          }

          return {
            routine,
            exerciseCount: count,
          };
        })
      );

      return withCounts;
    },
    [activeUserId],
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

  // Find routine corresponding to active workout session
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
      <div className="min-h-screen bg-[#fafaf8] text-zinc-900 flex flex-col items-center justify-center p-4">
        <div className="w-8 h-8 rounded-full border-2 border-zinc-800 border-t-transparent animate-spin mb-4" />
        <p className="text-xs font-mono uppercase tracking-widest text-stone-500">
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
    <main className="min-h-screen bg-[#fafaf8] text-zinc-900 p-4 font-sans flex flex-col justify-between pb-12 max-w-md mx-auto w-full overflow-x-hidden">
      {/* Upper Section */}
      <div>
        <UserBar />

        {/* Header with Title, New Button, and Mobile Navigation Pills */}
        <header className="pt-2 pb-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-zinc-900 uppercase">
                MY WORKOUTS
              </h1>
              <p className="text-xs text-stone-500 font-medium tracking-wide mt-0.5">
                Personal Training Library
              </p>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsImportModalOpen(true)}
                className="h-9 px-2.5 sm:px-3 rounded-xl bg-white hover:bg-stone-100 border border-stone-200/90 text-zinc-800 font-medium text-xs tracking-wider flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer shrink-0"
                title="Import Workout from file or code"
              >
                <span>📥</span>
                <span>Import</span>
              </button>

              <Link
                href="/workout/new"
                className="h-9 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-medium text-xs tracking-wider flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer shrink-0"
              >
                <span>+</span>
                <span>New</span>
              </Link>
            </div>
          </div>

          {/* Clean responsive navigation pill bar */}
          <nav aria-label="Feature navigation" className="flex items-center gap-1.5 mt-3 pt-2.5 border-t border-stone-200/60">
            <Link
              href="/progression"
              className="flex-1 h-8 px-2 rounded-xl bg-stone-100 hover:bg-stone-200 border border-stone-200/80 text-zinc-800 font-mono text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer"
              title="View Ranks, Badges & Accountability"
            >
              <span>🏅</span>
              <span>Ranks</span>
            </Link>

            <Link
              href="/history"
              className="flex-1 h-8 px-2 rounded-xl bg-stone-100 hover:bg-stone-200 border border-stone-200/80 text-zinc-800 font-mono text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer"
              title="View Workout History"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-3.5 h-3.5 text-stone-500"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>History</span>
            </Link>

            <Link
              href="/analytics"
              className="flex-1 h-8 px-2 rounded-xl bg-stone-100 hover:bg-stone-200 border border-stone-200/80 text-zinc-800 font-mono text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer"
              title="View Training Analytics"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-3.5 h-3.5 text-stone-500"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
                />
              </svg>
              <span>Stats</span>
            </Link>
          </nav>
        </header>

        {/* Resume Unfinished Workout Banner */}
        {activeSession && (
          <div className="mb-5 p-4 rounded-2xl bg-white border border-stone-300 shadow-sm animate-in fade-in duration-200">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-800">
                  Workout In Progress
                </span>
              </div>
              <button
                type="button"
                onClick={handleDiscardSession}
                disabled={isDiscarding}
                className="text-[11px] text-stone-400 hover:text-rose-600 transition-colors cursor-pointer"
              >
                {isDiscarding ? "Discarding..." : "Discard"}
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-zinc-900 tracking-tight">
                  {activeSession.routineName || activeSessionRoutine?.name || "Workout"}
                </h3>
                <p className="text-xs text-stone-500 font-mono mt-0.5">
                  {activeSession.exerciseSnapshots?.length || 0} exercises configured
                </p>
              </div>

              <Link
                href={`/workout/${activeSession.routineId}`}
                className="h-9 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-1 active:scale-95 transition-all shadow-xs"
              >
                <span>Resume</span>
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
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Routine Library List or Clean Empty State */}
      <div className="flex-1 my-auto w-full py-2">
        {userRoutinesWithCounts.length === 0 ? (
          <div className="p-8 rounded-2xl border border-dashed border-stone-300 bg-white/60 text-center flex flex-col items-center justify-center space-y-3 shadow-xs">
            <div className="w-12 h-12 rounded-2xl bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-500 text-lg font-bold">
              🏋️
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-bold text-zinc-900">No workouts yet</h2>
              <p className="text-xs text-stone-500 max-w-xs leading-relaxed">
                Build your custom workout routines to get started on the gym floor.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
              <Link
                href="/workout/new"
                className="px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-xs cursor-pointer active:scale-95"
              >
                + Create Workout
              </Link>
              <button
                type="button"
                onClick={() => setIsImportModalOpen(true)}
                className="px-4 py-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 border border-stone-200 text-zinc-800 font-bold text-xs uppercase tracking-wider transition-all shadow-2xs cursor-pointer active:scale-95 flex items-center gap-1.5"
              >
                <span>📥</span>
                <span>Import Workout</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {userRoutinesWithCounts.map(({ routine, exerciseCount }) => {
              const isThisActive = activeSession?.routineId === routine.id;

              return (
                <div
                  key={routine.id}
                  className={`w-full p-4 rounded-2xl bg-white border ${
                    isThisActive
                      ? "border-emerald-500/80 shadow-sm ring-1 ring-emerald-500/20"
                      : "border-stone-200 hover:border-stone-300"
                  } flex items-center justify-between transition-all duration-150 group shadow-xs`}
                >
                  <Link
                    href={`/workout/${routine.id}`}
                    className="flex-1 pr-3 flex flex-col justify-center space-y-1"
                  >
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold tracking-tight text-zinc-900 group-hover:text-zinc-700 transition-colors">
                        {routine.name}
                      </h2>
                      {isThisActive && (
                        <span className="text-[9px] font-mono uppercase bg-emerald-50 border border-emerald-200 text-emerald-800 px-1.5 py-0.5 rounded font-bold">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-mono text-stone-500">
                      {exerciseCount} {exerciseCount === 1 ? "exercise" : "exercises"}
                    </p>
                  </Link>

                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedRoutineForExport({ id: routine.id, name: routine.name });
                        setIsExportModalOpen(true);
                      }}
                      className="h-8 px-2 rounded-lg bg-stone-50 hover:bg-stone-100 border border-stone-200 text-stone-600 hover:text-zinc-900 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                      title={`Share / Export ${routine.name}`}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                        className="w-3.5 h-3.5 text-stone-500"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z"
                        />
                      </svg>
                      <span className="hidden xs:inline">Share</span>
                    </button>
                    <Link
                      href={`/workout/edit/${routine.id}`}
                      className="h-8 px-2.5 rounded-lg bg-stone-50 hover:bg-stone-100 border border-stone-200 text-stone-600 hover:text-zinc-900 text-xs font-medium flex items-center transition-colors"
                      title="Edit Routine"
                    >
                      Edit
                    </Link>
                    <Link
                      href={`/workout/${routine.id}`}
                      className="h-8 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs uppercase flex items-center transition-colors shadow-xs active:scale-95"
                    >
                      Start
                    </Link>
                  </div>
                </div>
              );
            })}

            {userRoutinesWithCounts.length > 1 && (
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => setIsExportAllModalOpen(true)}
                  className="text-xs font-mono text-stone-500 hover:text-zinc-900 inline-flex items-center gap-1.5 transition-colors cursor-pointer p-1"
                >
                  <span>📦</span>
                  <span>Export all {userRoutinesWithCounts.length} workouts as a bundle</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Static Footer Context */}
      <footer className="text-center pt-4">
        <p className="text-[10px] font-mono tracking-widest text-stone-400 uppercase">
          Sculp’d • High-Efficiency Architecture
        </p>
      </footer>

      {/* Import Workout Modal */}
      <ImportWorkoutModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
      />

      {/* Export Single Workout Modal */}
      <ExportWorkoutModal
        isOpen={isExportModalOpen}
        onClose={() => {
          setIsExportModalOpen(false);
          setSelectedRoutineForExport(null);
        }}
        routineId={selectedRoutineForExport?.id}
        routineName={selectedRoutineForExport?.name}
        userId={activeUserId}
      />

      {/* Export All Workouts Bundle Modal */}
      <ExportWorkoutModal
        isOpen={isExportAllModalOpen}
        onClose={() => setIsExportAllModalOpen(false)}
        isBundle={true}
        userId={activeUserId}
      />
    </main>
  );
}
