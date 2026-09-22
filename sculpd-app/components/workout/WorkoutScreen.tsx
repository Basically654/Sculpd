// components/workout/WorkoutScreen.tsx
"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/auth/UserContext";
import WhoIsTrainingView from "@/components/auth/WhoIsTrainingView";
import { useTimer } from "@/components/timer/TimerContext";
import { useWorkoutSession } from "./hooks/useWorkoutSession";
import DominantRestView from "./DominantRestView";
import PROverlay from "./PROverlay";
import PostWorkoutView from "./PostWorkoutView";

interface WorkoutScreenProps {
  routineSlug: string;
}

export default function WorkoutScreen({ routineSlug }: WorkoutScreenProps) {
  const router = useRouter();
  const { activeUserId, sessionToken, isLoading: isUserLoading } = useUser();
  const timer = useTimer();

  // Local state
  const [weight, setWeight] = useState<string>("");
  const [reps, setReps] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isCompletedSession, setIsCompletedSession] = useState<boolean>(false);

  const {
    routine,
    exercises,
    session,
    sessionSets,
    currentExerciseIndex,
    currentExercise,
    currentExerciseSets,
    previousSet,
    previousSessionSets,
    activePR,
    prsHit,
    isLoading,
    error,
    isFirstExercise,
    isLastExercise,
    goToExercise,
    goToNextExercise,
    goToPreviousExercise,
    logSet,
    deleteLastSet,
    finishWorkout,
    dismissPR,
  } = useWorkoutSession({
    routineSlug,
    userId: activeUserId,
    sessionToken,
  });

  // Pre-fill inputs with either the last logged set today or the previous session set
  React.useEffect(() => {
    if (currentExerciseSets.length > 0) {
      const last = currentExerciseSets[currentExerciseSets.length - 1];
      setWeight(String(last.weight));
      setReps(String(last.reps));
    } else if (previousSet) {
      setWeight(String(previousSet.weight));
      setReps(String(previousSet.reps));
    } else {
      setWeight("");
      setReps("");
    }
    setValidationError(null);
  }, [currentExercise?.id, currentExerciseSets.length, previousSet?.id]);

  // Auth gate
  if (isUserLoading) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4">
        <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin mb-4" />
      </div>
    );
  }

  if (!activeUserId) {
    return <WhoIsTrainingView />;
  }

  // Database loading
  if (isLoading) {
    return (
      <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4">
        <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin mb-3" />
      </main>
    );
  }

  // Error handling
  if (error || !routine || !currentExercise || !session) {
    return (
      <main className="min-h-screen bg-black text-white p-6 max-w-md mx-auto flex flex-col items-center justify-center text-center space-y-4 font-mono">
        <p className="text-rose-400 text-xs">{error || "Could not load workout."}</p>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs uppercase text-zinc-300"
        >
          Return to Dashboard
        </button>
      </main>
    );
  }

  // Post-Workout Experience Transition
  if (isCompletedSession) {
    return (
      <PostWorkoutView
        routine={routine}
        session={session}
        sets={sessionSets || []}
        exercises={exercises}
        prsHit={prsHit}
        onSaveNotes={async (notes) => {
          await finishWorkout(notes);
        }}
      />
    );
  }

  const lastLoggedSet =
    currentExerciseSets.length > 0
      ? currentExerciseSets[currentExerciseSets.length - 1]
      : undefined;

  const nextSetNumber = currentExerciseSets.length + 1;

  // Handle Set Logging
  const handleLogSet = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setValidationError(null);

    const parsedWeight = parseFloat(weight);
    const parsedReps = parseInt(reps, 10);

    if (isNaN(parsedWeight) || parsedWeight <= 0) {
      setValidationError("Enter weight > 0");
      return;
    }

    if (isNaN(parsedReps) || parsedReps <= 0) {
      setValidationError("Enter reps ≥ 1");
      return;
    }

    try {
      setIsSubmitting(true);
      await logSet(parsedWeight, parsedReps);
    } catch (err: any) {
      setValidationError(err?.message || "Failed to log set.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFinishWorkout = async () => {
    await finishWorkout();
    setIsCompletedSession(true);
  };

  // DOMINANT REST STATE
  // Sculp'd disappears and timer becomes dominant while resting
  if (timer.isActive) {
    return (
      <main className="min-h-screen bg-black text-white p-4 max-w-md mx-auto w-full font-sans flex flex-col justify-between select-none">
        <DominantRestView
          exercise={currentExercise}
          lastLoggedSet={lastLoggedSet}
          nextSetNumber={nextSetNumber}
          totalSetsTarget={currentExercise.targetSets}
          onSkipRest={timer.skip}
          onDeleteLastSet={deleteLastSet}
        />

        {/* PR Overlay if hit on that set */}
        <PROverlay prData={activePR} onDismiss={dismissPR} />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white p-4 pb-12 max-w-md mx-auto w-full font-sans flex flex-col justify-between select-none">
      {/* Upper Context Header */}
      <div>
        <header className="flex items-center justify-between pb-4 border-b border-zinc-900 text-xs font-mono">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="text-zinc-400 hover:text-white transition-colors"
              title="Return to dashboard"
            >
              ←
            </Link>
            <span className="text-zinc-400 uppercase font-black tracking-wider">
              {routine.dayName}
            </span>
            <span className="text-zinc-600">•</span>
            <span className="text-zinc-500">
              {currentExerciseIndex + 1} of {exercises.length}
            </span>
          </div>

          <button
            type="button"
            onClick={handleFinishWorkout}
            className="text-[11px] uppercase tracking-wider text-zinc-500 hover:text-emerald-400 transition-colors"
          >
            Finish Workout
          </button>
        </header>

        {/* Active Exercise Heading & Target */}
        <section className="pt-6 pb-4 space-y-1">
          <h1 className="text-3xl font-black uppercase tracking-tight text-white leading-none">
            {currentExercise.name}
          </h1>

          <div className="flex items-center gap-2 pt-1">
            <span className="text-xs font-mono text-zinc-400">
              Target: {currentExercise.targetSets} sets × {currentExercise.targetReps}
            </span>
            {currentExercise.coachingCue && (
              <>
                <span className="text-zinc-700">•</span>
                <span className="text-[11px] font-mono text-zinc-500 line-clamp-1">
                  {currentExercise.coachingCue}
                </span>
              </>
            )}
          </div>
        </section>

        {/* Previous Performance Telemetry */}
        <section className="py-3 border-t border-zinc-900/80 font-mono space-y-1.5">
          <span className="text-[11px] uppercase tracking-widest text-zinc-600 block">
            Previous:
          </span>

          {previousSessionSets.length > 0 ? (
            <div className="space-y-1 text-sm text-zinc-400">
              {previousSessionSets.map((s, idx) => (
                <div key={s.id || idx} className="tabular-nums">
                  {s.weight} × {s.reps}
                </div>
              ))}
            </div>
          ) : previousSet ? (
            <div className="text-sm text-zinc-400 tabular-nums">
              {previousSet.weight} × {previousSet.reps}
            </div>
          ) : (
            <p className="text-xs text-zinc-600 italic">
              First time logging this exercise
            </p>
          )}
        </section>

        {/* Today's Completed Sets */}
        {currentExerciseSets.length > 0 && (
          <section className="py-3 border-t border-zinc-900/80 font-mono space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-widest text-zinc-500 block">
                Today:
              </span>
              <button
                type="button"
                onClick={deleteLastSet}
                className="text-[10px] uppercase text-zinc-600 hover:text-rose-400 transition-colors"
              >
                Undo
              </button>
            </div>

            <div className="space-y-1 text-sm text-emerald-400 font-bold">
              {currentExerciseSets.map((s, idx) => (
                <div key={s.id || idx} className="flex items-center gap-1.5 tabular-nums">
                  <span className="text-emerald-500">✓</span>
                  <span>
                    {s.weight} × {s.reps}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Rapid Set Logging Bar */}
        <form onSubmit={handleLogSet} className="pt-4 space-y-2">
          {validationError && (
            <p className="text-xs font-mono text-rose-400">{validationError}</p>
          )}

          <div className="flex items-center gap-2">
            {/* Weight Input */}
            <div className="flex-1 relative">
              <input
                id="weight-input"
                type="number"
                step="any"
                min="0"
                inputMode="decimal"
                placeholder="Weight"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="w-full h-14 bg-zinc-950 border border-zinc-800 rounded-xl px-3 font-mono font-black text-xl text-center text-white placeholder-zinc-700 focus:outline-none focus:border-emerald-500 transition-colors"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono uppercase text-zinc-600 pointer-events-none">
                lbs
              </span>
            </div>

            {/* Reps Input */}
            <div className="w-24 relative">
              <input
                id="reps-input"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                placeholder="Reps"
                value={reps}
                onChange={(e) => setReps(e.target.value)}
                className="w-full h-14 bg-zinc-950 border border-zinc-800 rounded-xl px-3 font-mono font-black text-xl text-center text-white placeholder-zinc-700 focus:outline-none focus:border-emerald-500 transition-colors"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono uppercase text-zinc-600 pointer-events-none">
                reps
              </span>
            </div>

            {/* LOG SET Action Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="h-14 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-black font-mono font-black text-sm uppercase tracking-wider shadow-lg shadow-emerald-950/40 transition-all cursor-pointer disabled:opacity-50"
            >
              LOG SET
            </button>
          </div>
        </form>
      </div>

      {/* Navigation Footer */}
      <footer className="pt-8 space-y-3">
        {/* Compact Exercise Dots / Selector */}
        <div className="flex items-center justify-center gap-2">
          {exercises.map((ex, idx) => {
            const isActive = idx === currentExerciseIndex;
            const exSets = sessionSets?.filter((s) => s.exerciseId === ex.id) || [];
            const isDone = exSets.length >= ex.targetSets;

            return (
              <button
                key={ex.id}
                type="button"
                onClick={() => goToExercise(idx)}
                className={`h-2 rounded-full transition-all ${
                  isActive
                    ? "w-8 bg-emerald-400"
                    : isDone
                    ? "w-2 bg-emerald-800"
                    : "w-2 bg-zinc-800 hover:bg-zinc-700"
                }`}
                title={ex.name}
              />
            );
          })}
        </div>

        {/* Prev / Next Controls */}
        <div className="flex items-center justify-between text-xs font-mono">
          <button
            type="button"
            onClick={goToPreviousExercise}
            disabled={isFirstExercise}
            className="text-zinc-500 hover:text-zinc-200 disabled:opacity-20 uppercase transition-colors"
          >
            ← Previous
          </button>

          {isLastExercise ? (
            <button
              type="button"
              onClick={handleFinishWorkout}
              className="text-emerald-400 hover:text-emerald-300 font-bold uppercase transition-colors"
            >
              Finish Workout →
            </button>
          ) : (
            <button
              type="button"
              onClick={goToNextExercise}
              className="text-zinc-400 hover:text-zinc-200 uppercase transition-colors"
            >
              Next Exercise →
            </button>
          )}
        </div>
      </footer>

      {/* Personal Record Accomplishment Overlay */}
      <PROverlay prData={activePR} onDismiss={dismissPR} />
    </main>
  );
}
