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
          // Fallback if accessed via slug
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
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4">
        <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin mb-4" />
        <p className="text-xs font-mono uppercase tracking-widest text-zinc-500">
          Loading Workout Preview...
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center">
        <p className="text-sm text-rose-400 font-mono mb-4">{error || "Workout not found."}</p>
        <Link
          href="/"
          className="px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs font-mono uppercase text-zinc-300 hover:text-white"
        >
          ← Return to My Workouts
        </Link>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white p-4 font-sans flex flex-col justify-between pb-8 max-w-md mx-auto w-full">
      {/* Header & Back Navigation */}
      <div>
        <div className="flex items-center justify-between py-2 mb-3">
          <Link
            href="/"
            className="text-xs font-mono uppercase text-zinc-500 hover:text-zinc-300 flex items-center gap-1 transition-colors"
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
            className="text-xs font-mono uppercase text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors px-2.5 py-1 rounded bg-emerald-950/40 border border-emerald-800/40"
          >
            Edit
          </Link>
        </div>

        {/* Workout Details */}
        <div className="mb-6">
          <h1 className="text-2xl font-black uppercase tracking-tight text-white mb-1">
            {data.name}
          </h1>
          {data.description && (
            <p className="text-xs text-zinc-400 leading-relaxed">{data.description}</p>
          )}
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[11px] font-mono text-zinc-500 uppercase">
              {data.exercises.length} {data.exercises.length === 1 ? "Exercise" : "Exercises"}
            </span>
          </div>
        </div>

        {/* Exercise List Preview */}
        <div className="space-y-2.5">
          <h2 className="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-400 mb-2">
            Exercise List
          </h2>

          {data.exercises.length === 0 ? (
            <div className="p-6 text-center border border-dashed border-zinc-800 rounded-xl">
              <p className="text-xs text-zinc-500">No exercises added yet.</p>
              <Link
                href={`/workout/edit/${data.id}`}
                className="mt-2 inline-block text-xs font-mono uppercase text-emerald-400 hover:underline"
              >
                + Add Exercises
              </Link>
            </div>
          ) : (
            data.exercises.map((item, index) => (
              <div
                key={item.id || index}
                className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800/90 flex items-start justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-zinc-500 font-bold">
                      {index + 1}.
                    </span>
                    <h3 className="text-sm font-bold text-zinc-200">
                      {item.exercise?.name || "Exercise"}
                    </h3>
                  </div>

                  <div className="flex items-center gap-3 text-xs font-mono text-zinc-400 pl-4">
                    <span>
                      {item.targetSets} × {item.targetReps}
                    </span>
                    <span className="text-zinc-600">•</span>
                    <span>Rest: {item.restSeconds}s</span>
                  </div>

                  {item.notes && (
                    <p className="text-[11px] text-zinc-500 italic pl-4 mt-0.5">
                      {item.notes}
                    </p>
                  )}
                </div>

                {item.exercise?.category && (
                  <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-500 border border-zinc-800">
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
          className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:pointer-events-none text-black font-mono font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-lg shadow-emerald-950/40 cursor-pointer"
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
