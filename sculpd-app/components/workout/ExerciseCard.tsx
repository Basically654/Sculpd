"use client";

import { useState, useEffect } from "react";
import { logSetAction } from "@/app/workout/actions";
import { useRouter } from "next/navigation"; // <-- ADD THIS IMPORT

interface Exercise {
  id: string;
  name: string;
  target_sets: number;
  target_reps: string;
  coaching_cue: string | null;
}

interface ExerciseCardProps {
  exercise: Exercise;
  previousData?: { weight: number; reps: number };
}

export default function ExerciseCard({ exercise, previousData }: ExerciseCardProps) {
  const router = useRouter(); // <-- INITIALIZE ROUTER
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [setsLogged, setSetsLogged] = useState<Array<{ weight: number; reps: number }>>([]);
  const [isLogging, setIsLogging] = useState(false);
  const [lastSavedOverload, setLastSavedOverload] = useState<{ weight: number; reps: number } | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedSets = localStorage.getItem(`sets-${exercise.id}`);
      if (savedSets) {
        setSetsLogged(JSON.parse(savedSets));
      }
      const savedOverload = localStorage.getItem(`overload-${exercise.id}`);
      if (savedOverload) {
        setLastSavedOverload(JSON.parse(savedOverload));
      }
    }
  }, [exercise.id]);

  // Look inside components/workout/ExerciseCard.tsx -> find the handleLogSet function block
const handleLogSet = async () => {
  if (!weight || !reps) return;
  setIsLogging(true);

  const numericWeight = parseFloat(weight);
  const numericReps = parseInt(reps, 10);
  const newSet = { weight: numericWeight, reps: numericReps };
  const updatedSets = [...setsLogged, newSet];

  try {
    // REMOVE any strings checking for startsWith("m") or "mock"
    // ALWAYS call the live server tracking function direct:
    await logSetAction(exercise.id, numericWeight, numericReps);
    router.refresh(); 
  } catch (err) {
    console.warn("Cloud write error intercepted. Preserving local device storage fallback index.");
  }

  setSetsLogged(updatedSets);
  setLastSavedOverload(newSet);
  localStorage.setItem(`sets-${exercise.id}`, JSON.stringify(updatedSets));
  localStorage.setItem(`overload-${exercise.id}`, JSON.stringify(newSet));
  
  setWeight("");
  setReps("");
  setIsLogging(false);
};

  const displayOverload = lastSavedOverload || previousData;

  return (
    <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3">
      <div>
        <h3 className="font-bold text-base text-zinc-100">{exercise.name}</h3>
        {exercise.coaching_cue && (
          <p className="text-xs text-zinc-400 mt-0.5 italic">“{exercise.coaching_cue}”</p>
        )}
      </div>

      <div className="flex gap-2 text-xs font-mono">
        <span className="text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">
          Target: {exercise.target_sets}x{exercise.target_reps}
        </span>
        <span className="text-emerald-400 bg-emerald-950/40 border border-emerald-900/50 px-2 py-0.5 rounded">
          Prev: {displayOverload ? `${displayOverload.weight} lbs x ${displayOverload.reps}` : "None"}
        </span>
      </div>

      <div className="flex gap-2 items-center pt-1">
        <div className="flex-1">
          <input
            type="number"
            pattern="[0-9]*"
            inputMode="decimal"
            placeholder="lbs"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg py-2.5 px-3 text-center text-sm text-white focus:outline-none focus:border-zinc-700 font-bold"
          />
        </div>
        <div className="flex-1">
          <input
            type="number"
            pattern="[0-9]*"
            inputMode="numeric"
            placeholder="reps"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg py-2.5 px-3 text-center text-sm text-white focus:outline-none focus:border-zinc-700 font-bold"
          />
        </div>
        <button
          onClick={handleLogSet}
          disabled={isLogging}
          className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-black font-black text-xl w-12 h-10 rounded-lg flex items-center justify-center active:scale-95 transition-transform"
        >
          +
        </button>
      </div>

      {setsLogged.length > 0 && (
        <div className="pt-2 border-t border-zinc-800/60 flex flex-wrap gap-1.5">
          {setsLogged.map((s, idx) => (
            <span key={idx} className="text-[11px] font-bold font-mono bg-zinc-800 text-zinc-300 px-2 py-1 rounded">
              S{idx + 1}: {s.weight}x{s.reps}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}