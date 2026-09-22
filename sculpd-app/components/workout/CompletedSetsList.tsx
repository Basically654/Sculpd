// components/workout/CompletedSetsList.tsx
"use client";

import React, { useState } from "react";
import { WorkoutSet } from "@/types/models";

interface CompletedSetsListProps {
  sets: WorkoutSet[];
  onDeleteLastSet: () => Promise<any>;
}

export default function CompletedSetsList({
  sets,
  onDeleteLastSet,
}: CompletedSetsListProps) {
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const handleDelete = async () => {
    if (sets.length === 0) return;
    try {
      setIsDeleting(true);
      await onDeleteLastSet();
    } catch (err) {
      console.error("Failed to delete set:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-2 mb-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-400">
          Completed Sets ({sets.length})
        </h3>
        {sets.length > 0 && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="text-[10px] font-mono text-rose-400 hover:text-rose-300 disabled:opacity-50 flex items-center gap-1 active:scale-95 transition-all"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-3 h-3"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
              />
            </svg>
            <span>{isDeleting ? "Deleting..." : "Delete Last Set"}</span>
          </button>
        )}
      </div>

      {sets.length === 0 ? (
        <div className="p-4 rounded-xl bg-zinc-950/40 border border-zinc-900 text-center">
          <p className="text-xs font-mono text-zinc-600">
            No sets logged yet for this exercise
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {sets.map((set, idx) => (
            <div
              key={set.id}
              className="flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-900/40 border border-zinc-800/60 font-mono text-xs"
            >
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-300 flex items-center justify-center text-[10px] font-bold">
                  {set.setNumber}
                </span>
                <span className="text-zinc-300 font-semibold">
                  {set.weight} lbs
                </span>
                <span className="text-zinc-600">×</span>
                <span className="text-emerald-400 font-bold">
                  {set.reps} reps
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-500">
                  {new Date(set.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                {idx === sets.length - 1 && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Most recent set" />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
