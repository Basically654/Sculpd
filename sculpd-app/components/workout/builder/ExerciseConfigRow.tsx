// components/workout/builder/ExerciseConfigRow.tsx
"use client";

import React from "react";

export interface ConfiguredExerciseItem {
  id?: string;
  exerciseId: string;
  name: string;
  category?: string;
  equipment?: string;
  targetSets: number;
  targetReps: string;
  restSeconds: number;
  notes?: string;
}

interface ExerciseConfigRowProps {
  item: ConfiguredExerciseItem;
  index: number;
  totalCount: number;
  onChange: (updated: ConfiguredExerciseItem) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}

const REST_PRESETS = [60, 90, 120, 180];

export default function ExerciseConfigRow({
  item,
  index,
  totalCount,
  onChange,
  onMoveUp,
  onMoveDown,
  onRemove,
}: ExerciseConfigRowProps) {
  return (
    <div className="p-4 rounded-xl bg-white border border-stone-200 shadow-sm space-y-3">
      {/* Exercise Title and Reorder/Delete Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="w-5 h-5 rounded-full bg-stone-100 border border-stone-200 text-zinc-600 flex items-center justify-center text-[10px] font-mono font-bold">
            {index + 1}
          </span>
          <div>
            <h3 className="text-sm font-bold text-zinc-900 leading-none">{item.name}</h3>
            {(item.category || item.equipment) && (
              <p className="text-[10px] font-mono text-zinc-400 mt-0.5">
                {[item.category, item.equipment].filter(Boolean).join(" • ")}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Reorder Buttons */}
          <button
            type="button"
            disabled={index === 0}
            onClick={onMoveUp}
            title="Move Up"
            className="w-7 h-7 rounded-lg bg-stone-100 hover:bg-stone-200 disabled:opacity-30 disabled:pointer-events-none text-zinc-600 hover:text-zinc-900 flex items-center justify-center text-xs font-bold transition-colors"
          >
            ▲
          </button>
          <button
            type="button"
            disabled={index === totalCount - 1}
            onClick={onMoveDown}
            title="Move Down"
            className="w-7 h-7 rounded-lg bg-stone-100 hover:bg-stone-200 disabled:opacity-30 disabled:pointer-events-none text-zinc-600 hover:text-zinc-900 flex items-center justify-center text-xs font-bold transition-colors"
          >
            ▼
          </button>
          {/* Remove Button */}
          <button
            type="button"
            onClick={onRemove}
            title="Remove Exercise"
            className="w-7 h-7 rounded-lg bg-stone-100 hover:bg-red-50 border border-transparent hover:border-red-200 text-zinc-400 hover:text-red-600 flex items-center justify-center text-xs transition-colors ml-1"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Configuration Grid: Sets, Reps, Rest */}
      <div className="grid grid-cols-3 gap-2 pt-1">
        <div>
          <label className="block text-[10px] font-mono uppercase text-zinc-400 font-medium mb-1">
            Target Sets
          </label>
          <input
            type="number"
            min={1}
            max={20}
            value={item.targetSets}
            onChange={(e) =>
              onChange({
                ...item,
                targetSets: Math.max(1, parseInt(e.target.value, 10) || 1),
              })
            }
            className="w-full h-8 bg-stone-50 border border-stone-200 rounded-lg px-2 text-center text-xs font-mono font-bold text-zinc-900 focus:bg-white focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900"
          />
        </div>

        <div>
          <label className="block text-[10px] font-mono uppercase text-zinc-400 font-medium mb-1">
            Target Reps
          </label>
          <input
            type="text"
            value={item.targetReps}
            placeholder="e.g. 8-10"
            onChange={(e) =>
              onChange({
                ...item,
                targetReps: e.target.value,
              })
            }
            className="w-full h-8 bg-stone-50 border border-stone-200 rounded-lg px-2 text-center text-xs font-mono font-bold text-zinc-900 focus:bg-white focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900"
          />
        </div>

        <div>
          <label className="block text-[10px] font-mono uppercase text-zinc-400 font-medium mb-1">
            Rest (sec)
          </label>
          <input
            type="number"
            min={10}
            max={600}
            step={5}
            value={item.restSeconds}
            onChange={(e) =>
              onChange({
                ...item,
                restSeconds: Math.max(10, parseInt(e.target.value, 10) || 60),
              })
            }
            className="w-full h-8 bg-stone-50 border border-stone-200 rounded-lg px-2 text-center text-xs font-mono font-bold text-zinc-900 focus:bg-white focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900"
          />
        </div>
      </div>

      {/* Quick Rest Preset Buttons */}
      <div className="flex items-center gap-1.5 pt-0.5">
        <span className="text-[10px] font-mono text-zinc-400 mr-1">Rest:</span>
        {REST_PRESETS.map((sec) => (
          <button
            key={sec}
            type="button"
            onClick={() => onChange({ ...item, restSeconds: sec })}
            className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
              item.restSeconds === sec
                ? "bg-zinc-900 text-white font-bold border border-zinc-900"
                : "bg-stone-100 text-zinc-600 hover:text-zinc-900 hover:bg-stone-200 border border-stone-200"
            }`}
          >
            {sec}s
          </button>
        ))}
      </div>

      {/* Optional Coaching Notes */}
      <div>
        <input
          type="text"
          value={item.notes || ""}
          placeholder="Optional exercise cue / setup notes..."
          onChange={(e) =>
            onChange({
              ...item,
              notes: e.target.value,
            })
          }
          className="w-full h-7 bg-stone-50 border border-stone-200 rounded-lg px-2.5 text-[11px] text-zinc-800 placeholder-zinc-400 focus:bg-white focus:outline-none focus:border-zinc-900"
        />
      </div>
    </div>
  );
}
