// components/workout/WorkoutPreview.tsx
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RoutineWithExercises } from "@/types/models";
import { getRoutineWithExercises, getRoutineById, getRoutineBySlug } from "@/lib/db/routine-repository";
import { useUser } from "@/components/auth/UserContext";

interface WorkoutPreviewProps {
  routineId: string;
  onStart: () => void;
}

export default function WorkoutPreview({ routineId, onStart }: WorkoutPreviewProps) {
  const router = useRouter();
  const { activeUserId } = useUser();
  const [data, setData] = useState<RoutineWithExercises | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        let loaded = await getRoutineWithExercises(routineId);
        if (!loaded) {
          const routine = (await getRoutineBySlug(routineId)) || (await getRoutineById(routineId));
          if (routine) {
            loaded = await getRoutineWithExercises(routine.id);
          }
        }

        if (isMounted) {
          if (loaded) {
            setData(loaded);
          } else {
            setError("Workout routine not found.");
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err?.message || "Failed to load workout preview.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, [routineId]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#fafaf8] text-zinc-900 flex flex-col items-center justify-center p-4">
        <div className="w-8 h-8 rounded-full border-2 border-zinc-800 border-t-transparent animate-spin mb-4" />
        <p className="text-xs font-mono uppercase tracking-widest text-stone-500">
          Loading Workout Preview...
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#fafaf8] text-zinc-900 flex flex-col items-center justify-center p-6 text-center">
        <p className="text-sm text-rose-600 font-medium mb-4">{error || "Workout not found."}</p>
        <Link
          href="/"
          className="px-4 py-2 bg-white border border-stone-200 rounded-xl text-xs font-medium uppercase text-zinc-700 hover:text-zinc-900 shadow-xs"
        >
          ← Return to My Workouts
        </Link>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#fafaf8] text-zinc-900 p-4 font-sans flex flex-col justify-between pb-8 max-w-md mx-auto w-full">
      {/* Header & Back Navigation */}
      <div>
        <div className="flex items-center justify-between py-2 mb-4">
          <Link
            href="/"
            className="text-xs font-medium uppercase tracking-wider text-stone-500 hover:text-zinc-900 flex items-center gap-1 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2.5}
              stroke="currentColor"
              className="w-3.5 h-3.5"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            <span>My Workouts</span>
          </Link>

          <Link
            href={`/workout/edit/${data.id}`}
            className="text-xs font-medium text-stone-600 hover:text-zinc-900 px-3 py-1 rounded-lg bg-white border border-stone-200 hover:border-stone-300 shadow-xs transition-colors"
          >
            Edit Routine
          </Link>
        </div>

        {/* Workout Details */}
        <div className="mb-6">
          <h1 className="text-2xl font-black uppercase tracking-tight text-zinc-900 mb-1">
            {data.name}
          </h1>
          {data.description && (
            <p className="text-xs text-stone-600 leading-relaxed">{data.description}</p>
          )}
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[11px] font-mono text-stone-500">
              {data.exercises.length} {data.exercises.length === 1 ? "Exercise" : "Exercises"}
            </span>
          </div>
        </div>

        {/* Exercise List Preview */}
        <div className="space-y-2.5">
          <h2 className="text-[11px] font-mono font-bold uppercase tracking-wider text-stone-400 mb-2">
            Exercise List
          </h2>

          {data.exercises.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-stone-300 rounded-2xl bg-white shadow-xs">
              <p className="text-xs text-stone-500">No exercises added yet.</p>
              <Link
                href={`/workout/edit/${data.id}`}
                className="mt-2 inline-block text-xs font-bold uppercase text-zinc-900 hover:underline"
              >
                + Add Exercises
              </Link>
            </div>
          ) : (
            data.exercises.map((item, index) => (
              <div
                key={item.id || index}
                className="p-3.5 rounded-xl bg-white border border-stone-200 shadow-xs flex items-start justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-stone-400 font-bold">
                      {index + 1}.
                    </span>
                    <h3 className="text-sm font-bold text-zinc-900">
                      {item.exercise?.name || "Exercise"}
                    </h3>
                  </div>

                  <div className="flex items-center gap-3 text-xs font-mono text-stone-600 pl-4">
                    <span>
                      {item.targetSets} sets × {item.targetReps} reps
                    </span>
                    <span className="text-stone-300">•</span>
                    <span>Rest: {item.restSeconds}s</span>
                  </div>

                  {item.notes && (
                    <p className="text-[11px] text-stone-500 italic pl-4 mt-0.5">
                      {item.notes}
                    </p>
                  )}
                </div>

                {item.exercise?.category && (
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 border border-stone-200">
                    {item.exercise.category}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Start Workout Action */}
      <div className="pt-6">
        <button
          type="button"
          onClick={onStart}
          disabled={data.exercises.length === 0}
          className="w-full h-14 rounded-2xl bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 disabled:pointer-events-none text-white font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-md shadow-zinc-900/10 cursor-pointer"
        >
          <span>START WORKOUT</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-4 h-4"
          >
            <path
              fillRule="evenodd"
              d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
    </main>
  );
}
