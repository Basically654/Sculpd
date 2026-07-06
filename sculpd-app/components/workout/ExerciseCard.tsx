"use client";

import { useState, useEffect } from "react";
import { logSetAction, deleteLastSetAction } from "@/app/workout/actions";
import { useRouter } from "next/navigation";
import ProgressChart from "./ProgressChart";
import { useTimer } from "@/components/timer/TimerContext";

interface Exercise {
  id: string;
  name: string;
  target_sets: number;
  target_reps: string;
  coaching_cue: string | null;
}

interface SessionSet {
  w: number;
  r: number;
}

interface SessionHistoryItem {
  date: string;
  sets: SessionSet[];
}

interface ExerciseCardProps {
  exercise: Exercise;
  previousData?: { weight: number; reps: number };
  history: SessionHistoryItem[];
}

export default function ExerciseCard({
  exercise,
  previousData,
  history,
}: ExerciseCardProps) {
  const router = useRouter();
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [setsLogged, setSetsLogged] = useState<
    Array<{ weight: number; reps: number }>
  >([]);
  const [isLogging, setIsLogging] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedSession, setSelectedSession] =
    useState<SessionHistoryItem | null>(null);
  const [selectedRPE, setSelectedRPE] = useState<number | null>(null);
  const timer = useTimer();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedSets = localStorage.getItem(`sets-${exercise.id}`);
      if (savedSets) setSetsLogged(JSON.parse(savedSets));
    }
  }, [exercise.id]);

  const handleLogSet = async () => {
    if (!weight || !reps) return;
    setIsLogging(true);

    const numericWeight = parseFloat(weight);
    const numericReps = parseInt(reps, 10);
    const newSet = { weight: numericWeight, reps: numericReps };
    const updatedSets = [...setsLogged, newSet];

    try {
      await logSetAction(
        exercise.id,
        numericWeight,
        numericReps,
        selectedRPE ?? null,
      );
      setSetsLogged(updatedSets);
      localStorage.setItem(`sets-${exercise.id}`, JSON.stringify(updatedSets));
      setWeight("");
      setReps("");
      // start rest timer after successful log
      try {
        timer.start(90);
      } catch (e) {
        // ignore if timer not available
      }
      router.refresh();
    } catch (err) {
      console.warn("Cloud write failed.");
    } finally {
      setIsLogging(false);
    }
  };

  const chartData = history.map((session) => {
    const weights = session.sets.map((set) => set.w);
    const reps = session.sets.map((set) => set.r);

    return {
      date: session.date,
      weight: weights.length ? Math.max(...weights) : 0,
      reps: reps.length ? Math.max(...reps) : 0,
      session,
    };
  });

  const handleChartClick = (payload: {
    date: string;
    weight: number;
    reps: number;
    session?: SessionHistoryItem;
  }) => {
    if (payload.session) {
      setSelectedSession(payload.session);
    }
  };

  const handleHeaderClick = () => {
    setIsExpanded((prev) => !prev);
    if (selectedSession) {
      setSelectedSession(null);
    }
  };

  const isComplete = setsLogged.length >= exercise.target_sets;

  return (
    <div
      className={`p-4 rounded-xl transition-all ${isComplete ? "border-emerald-900/50 bg-emerald-900/5 border" : "bg-zinc-900 border border-zinc-800"}`}
    >
      {/* HEADER: Always Visible */}
      <div
        onClick={handleHeaderClick}
        className="flex justify-between items-center cursor-pointer mb-2"
      >
        <h3 className="font-bold text-sm text-zinc-100">{exercise.name}</h3>
        <span className="text-[10px] text-zinc-400 font-mono bg-zinc-800 px-2 py-0.5 rounded">
          {isExpanded ? "CLOSE" : "DETAILS"}
        </span>
      </div>

      {/* EXPANDED VIEW: Stats + Chart */}
      {isExpanded && (
        <div className="space-y-3">
          <ProgressChart
            data={chartData}
            onPointClick={handleChartClick}
            selectedDate={selectedSession?.date}
          />

          {selectedSession && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h4 className="text-[10px] font-semibold uppercase tracking-wide text-zinc-300">
                    Session Detail
                  </h4>
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                    {selectedSession.sets.length} set
                    {selectedSession.sets.length === 1 ? "" : "s"}
                  </span>
                </div>
                <span className="text-[10px] text-zinc-500">
                  {selectedSession.date}
                </span>
              </div>
              <ul className="space-y-1 text-xs text-zinc-400">
                {selectedSession.sets.map((set, index) => (
                  <li key={`${selectedSession.date}-${index}`}>
                    {index + 1}. {set.w} lbs × {set.r} reps
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* COLLAPSED/STATIC VIEW: Targets & Logging */}
      {!isExpanded && (
        <div className="flex gap-2 text-xs font-mono mb-3">
          <span className="text-zinc-500">
            Target: {exercise.target_sets}x{exercise.target_reps}
          </span>
          <span className="text-emerald-500">
            Prev:{" "}
            {previousData
              ? `${previousData.weight}x${previousData.reps}`
              : "None"}
          </span>
        </div>
      )}

      <div className="flex gap-2 items-center">
        <input
          type="number"
          placeholder="lbs"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          className="w-1/3 bg-zinc-950 border border-zinc-800 rounded-lg py-2 text-center text-sm"
        />
        <input
          type="number"
          placeholder="reps"
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          className="w-1/3 bg-zinc-950 border border-zinc-800 rounded-lg py-2 text-center text-sm"
        />
        <button
          onClick={handleLogSet}
          disabled={isLogging}
          className="flex-1 bg-emerald-500 text-black font-black text-lg rounded-lg py-2"
        >
          +
        </button>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={async () => {
            if (setsLogged.length === 0) return;
            try {
              await deleteLastSetAction(exercise.id);
              const updatedSets = setsLogged.slice(0, -1);
              setSetsLogged(updatedSets);
              localStorage.setItem(
                `sets-${exercise.id}`,
                JSON.stringify(updatedSets),
              );
              router.refresh();
            } catch (error) {
              console.warn("Failed to remove last set.", error);
            }
          }}
          className="text-xs text-zinc-200 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2"
        >
          Remove Last Set
        </button>
        <div className="text-xs text-zinc-500">{setsLogged.length} logged</div>
      </div>
      {/* RPE selector row */}
      <div className="mt-3 flex gap-2 items-center">
        <div className="text-xs text-zinc-400 mr-2">RPE:</div>
        <div className="flex gap-1">
          {Array.from({ length: 10 }).map((_, i) => {
            const val = i + 1;
            const active = selectedRPE === val;
            return (
              <button
                key={val}
                onClick={() => setSelectedRPE(val)}
                className={`w-6 h-6 rounded-full text-[10px] flex items-center justify-center ${active ? "bg-emerald-500 text-black" : "bg-zinc-800 text-zinc-400"}`}
                aria-pressed={active}
              >
                {val}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
