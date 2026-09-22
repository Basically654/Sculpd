// components/workout/builder/ExercisePickerModal.tsx
"use client";

import React, { useState, useEffect } from "react";
import { Exercise } from "@/types/models";
import {
  getExercises,
  searchExercises,
  createCustomExercise,
  seedExerciseCatalog,
} from "@/lib/db/exercise-repository";

const CATEGORIES = ["All", "Chest", "Back", "Legs", "Shoulders", "Arms", "Core", "Other"];

interface ExercisePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectExercise: (exercise: Exercise) => void;
  userId: string;
}

export default function ExercisePickerModal({
  isOpen,
  onClose,
  onSelectExercise,
  userId,
}: ExercisePickerModalProps) {
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Custom Exercise creation state
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customCategory, setCustomCategory] = useState("Chest");
  const [customEquipment, setCustomEquipment] = useState("Barbell");
  const [isCreatingCustom, setIsCreatingCustom] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    async function fetchList() {
      setIsLoading(true);
      try {
        await seedExerciseCatalog();
        const results = await searchExercises(query, selectedCategory, userId);
        if (isMounted) {
          setExercises(results);
        }
      } catch (err) {
        console.error("Failed to load exercises:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    fetchList();
    return () => {
      isMounted = false;
    };
  }, [isOpen, query, selectedCategory, userId]);

  if (!isOpen) return null;

  const handleCreateCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customName.trim()) {
      setCustomError("Please enter an exercise name.");
      return;
    }

    try {
      setIsCreatingCustom(true);
      setCustomError(null);
      const created = await createCustomExercise(userId, {
        name: customName.trim(),
        category: customCategory,
        equipment: customEquipment,
      });

      onSelectExercise(created);
      setShowCustomForm(false);
      setCustomName("");
      onClose();
    } catch (err: any) {
      setCustomError(err?.message || "Failed to create exercise.");
    } finally {
      setIsCreatingCustom(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex flex-col justify-end sm:justify-center p-0 sm:p-4">
      <div className="w-full max-w-lg mx-auto bg-[#fafaf8] border border-stone-200 rounded-t-2xl sm:rounded-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
        {/* Header */}
        <div className="p-4 border-b border-stone-200 bg-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold uppercase tracking-tight text-zinc-900">
              Add Exercise
            </h2>
            <span className="text-[11px] font-mono text-zinc-400 font-semibold">
              ({exercises.length})
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-stone-100 hover:bg-stone-200 text-zinc-500 hover:text-zinc-900 flex items-center justify-center text-sm font-bold transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-4 border-b border-stone-200 bg-white space-y-3">
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={selectedCategory !== "All" ? `Search ${selectedCategory} exercises...` : "Search exercise catalog..."}
              className="w-full h-10 bg-stone-50 border border-stone-200 rounded-xl px-3.5 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:bg-white focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 transition-colors"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-3 top-2.5 text-xs text-zinc-400 hover:text-zinc-600 font-mono cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(selectedCategory === cat ? "All" : cat)}
                className={`px-3 py-1 rounded-full text-xs font-mono uppercase whitespace-nowrap transition-colors cursor-pointer ${
                  selectedCategory === cat
                    ? "bg-zinc-900 text-white font-bold"
                    : "bg-stone-100 text-zinc-600 hover:text-zinc-900 border border-stone-200"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Exercise Creator Expander */}
        <div className="px-4 py-2 bg-stone-50 border-b border-stone-200">
          {!showCustomForm ? (
            <button
              type="button"
              onClick={() => setShowCustomForm(true)}
              className="w-full py-1.5 text-xs font-mono uppercase text-zinc-700 hover:text-zinc-900 flex items-center justify-center gap-1 font-bold transition-colors cursor-pointer"
            >
              <span>+ Create Custom Exercise</span>
            </button>
          ) : (
            <form onSubmit={handleCreateCustom} className="space-y-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase text-zinc-600 font-bold">
                  New Custom Exercise
                </span>
                <button
                  type="button"
                  onClick={() => setShowCustomForm(false)}
                  className="text-xs text-zinc-400 hover:text-zinc-600 cursor-pointer"
                >
                  Cancel
                </button>
              </div>

              {customError && <p className="text-xs text-red-600 font-mono">{customError}</p>}

              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Exercise name (e.g. Incline Cable Fly)"
                className="w-full h-9 bg-white border border-stone-200 rounded-lg px-3 text-xs text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900"
                autoFocus
              />

              <div className="grid grid-cols-2 gap-2">
                <select
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  className="h-8 bg-white border border-stone-200 rounded-lg px-2 text-xs text-zinc-800"
                >
                  <option value="Chest">Chest</option>
                  <option value="Back">Back</option>
                  <option value="Legs">Legs</option>
                  <option value="Shoulders">Shoulders</option>
                  <option value="Arms">Arms</option>
                  <option value="Core">Core</option>
                  <option value="Other">Other</option>
                </select>

                <select
                  value={customEquipment}
                  onChange={(e) => setCustomEquipment(e.target.value)}
                  className="h-8 bg-white border border-stone-200 rounded-lg px-2 text-xs text-zinc-800"
                >
                  <option value="Barbell">Barbell</option>
                  <option value="Dumbbell">Dumbbell</option>
                  <option value="Cable">Cable</option>
                  <option value="Machine">Machine</option>
                  <option value="Bodyweight">Bodyweight</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={isCreatingCustom || !customName.trim()}
                className="w-full h-8 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
              >
                {isCreatingCustom ? "Creating..." : "Add & Select"}
              </button>
            </form>
          )}
        </div>

        {/* Exercises Scroll List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 max-h-80 min-h-48 bg-[#fafaf8]">
          {isLoading ? (
            <div className="py-8 text-center text-xs font-mono text-zinc-400">
              Loading exercises...
            </div>
          ) : exercises.length === 0 ? (
            <div className="py-8 text-center space-y-2">
              <p className="text-xs font-mono text-zinc-500">
                No exercises found
                {selectedCategory !== "All" ? ` in ${selectedCategory}` : ""}
                {query.trim() ? ` matching "${query.trim()}"` : ""}.
              </p>
              {(query.trim() || selectedCategory !== "All") && (
                <div className="flex items-center justify-center gap-2 pt-1">
                  {query.trim() && (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      className="px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-zinc-800 text-[11px] font-mono font-bold transition-colors cursor-pointer"
                    >
                      Clear Search
                    </button>
                  )}
                  {selectedCategory !== "All" && (
                    <button
                      type="button"
                      onClick={() => setSelectedCategory("All")}
                      className="px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-zinc-800 text-[11px] font-mono font-bold transition-colors cursor-pointer"
                    >
                      Show All Categories
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            exercises.map((ex) => (
              <button
                key={ex.id}
                type="button"
                onClick={() => {
                  onSelectExercise(ex);
                  onClose();
                }}
                className="w-full p-3 rounded-xl bg-white hover:bg-stone-50 border border-stone-200 flex items-center justify-between text-left transition-colors cursor-pointer group shadow-xs"
              >
                <div>
                  <h4 className="text-xs font-bold text-zinc-900 group-hover:text-black">
                    {ex.name}
                  </h4>
                  <div className="flex items-center gap-2 mt-0.5">
                    {ex.category && (
                      <span className="text-[10px] font-mono text-zinc-400">
                        {ex.category}
                      </span>
                    )}
                    {ex.equipment && (
                      <>
                        <span className="text-[10px] text-zinc-300">•</span>
                        <span className="text-[10px] font-mono text-zinc-400">
                          {ex.equipment}
                        </span>
                      </>
                    )}
                    {ex.userId && (
                      <span className="text-[9px] font-mono bg-stone-100 text-zinc-700 px-1 rounded border border-stone-200">
                        Custom
                      </span>
                    )}
                  </div>
                </div>

                <div className="w-6 h-6 rounded-full bg-stone-100 group-hover:bg-zinc-900 text-zinc-500 group-hover:text-white flex items-center justify-center text-xs font-bold transition-colors">
                  +
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
