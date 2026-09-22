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
import WorkoutPreview from "./WorkoutPreview";

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
  const [hasStartedWorkout, setHasStartedWorkout] = useState<boolean>(false);

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

  // If session is already completed, transition to post-workout summary
  React.useEffect(() => {
    if (session?.status === "completed") {
      setIsCompletedSession(true);
    }
  }, [session?.status]);

  // Auth gate
  if (isUserLoading) {
    return (
      <div className="min-h-screen bg-[#fafaf8] text-zinc-900 flex flex-col items-center justify-center p-4">
        <div className="w-8 h-8 rounded-full border-2 border-zinc-800 border-t-transparent animate-spin mb-4" />
      </div>
    );
  }

  if (!activeUserId) {
    return <WhoIsTrainingView />;
  }

  // Database loading
  if (isLoading) {
    return (
      <main className="min-h-screen bg-[#fafaf8] text-zinc-900 flex flex-col items-center justify-center p-4">
        <div className="w-8 h-8 rounded-full border-2 border-zinc-800 border-t-transparent animate-spin mb-3" />
      </main>
    );
  }

  // Error handling
  if (error || !routine || !currentExercise || !session) {
    return (
      <main className="min-h-screen bg-[#fafaf8] text-zinc-900 p-6 max-w-md mx-auto flex flex-col items-center justify-center text-center space-y-4 font-mono">
        <p className="text-rose-600 text-xs">{error || "Could not load workout."}</p>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="px-4 py-2 rounded-xl bg-white border border-stone-300 text-xs uppercase text-zinc-800 shadow-xs"
        >
          Return to Dashboard
        </button>
      </main>
    );
  }

  // Workout Preview before starting
  const hasLoggedSets = sessionSets && sessionSets.length > 0;
  if (!hasStartedWorkout && !hasLoggedSets) {
    return (
      <WorkoutPreview
        routineId={routine.id}
        onStart={() => setHasStartedWorkout(true)}
      />
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
    try {
      timer.stop();
      await finishWorkout();
      setIsCompletedSession(true);
    } catch (err) {
      console.error("Failed to finish workout:", err);
      // Ensure we transition to the post-workout view even if background tasks warn
      setIsCompletedSession(true);
    }
  };

  // DOMINANT REST STATE
  // Sculp'd disappears and timer becomes dominant while resting
  if (timer.isActive) {
    return (
      <main className="min-h-screen bg-[#fafaf8] text-zinc-900 p-4 max-w-md mx-auto w-full font-sans flex flex-col justify-between select-none">
        <DominantRestView
          exercise={currentExercise}
          lastLoggedSet={lastLoggedSet}
          nextSetNumber={nextSetNumber}
          totalSetsTarget={currentExercise.targetSets || 3}
          onSkipRest={timer.skip}
          onDeleteLastSet={deleteLastSet}
          onFinishWorkout={handleFinishWorkout}
        />

        {/* PR Overlay if hit on that set */}
        <PROverlay prData={activePR} onDismiss={dismissPR} />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#fafaf8] text-zinc-900 p-4 pb-12 max-w-md mx-auto w-full font-sans flex flex-col justify-between select-none">
      {/* Upper Context Header */}
      <div>
        <header className="flex items-center justify-between pb-3.5 border-b border-stone-200/80 text-xs font-mono">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="text-stone-400 hover:text-zinc-900 transition-colors"
              title="Return to dashboard"
            >
              ←
            </Link>
            <span className="text-zinc-800 uppercase font-bold tracking-wider">
              {routine.name || routine.dayName}
            </span>
            <span className="text-stone-300">•</span>
            <span className="text-stone-500">
              {currentExerciseIndex + 1} of {exercises.length}
            </span>
          </div>

          <button
            type="button"
            onClick={handleFinishWorkout}
            className="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-900 hover:text-black bg-stone-100 hover:bg-stone-200 border border-stone-200 px-3 py-1.5 rounded-lg active:scale-95 transition-all cursor-pointer shadow-xs min-h-[36px] flex items-center justify-center"
          >
            Finish Workout
          </button>
        </header>

        {/* Active Exercise Heading & Target */}
        <section className="pt-6 pb-4 space-y-1">
          <h1 className="text-3xl font-black uppercase tracking-tight text-zinc-900 leading-none">
            {currentExercise.name}
          </h1>

          <div className="flex items-center gap-2 pt-1">
            <span className="text-xs font-mono text-stone-600">
              Target: {currentExercise.targetSets} sets × {currentExercise.targetReps}
            </span>
            {currentExercise.coachingCue && (
              <>
                <span className="text-stone-300">•</span>
                <span className="text-[11px] font-mono text-stone-500 line-clamp-1">
                  {currentExercise.coachingCue}
                </span>
              </>
            )}
          </div>
        </section>

        {/* Previous Performance Telemetry */}
        <section className="py-3 border-t border-stone-200/80 font-mono space-y-1.5">
          <span className="text-[11px] uppercase tracking-widest text-stone-400 font-semibold block">
            Previous:
          </span>

          {previousSessionSets.length > 0 ? (
            <div className="space-y-1 text-sm text-stone-700 font-medium">
              {previousSessionSets.map((s, idx) => (
                <div key={s.id || idx} className="tabular-nums">
                  {s.weight} × {s.reps}
                </div>
              ))}
            </div>
          ) : previousSet ? (
            <div className="text-sm text-stone-700 font-medium tabular-nums">
              {previousSet.weight} × {previousSet.reps}
            </div>
          ) : (
            <p className="text-xs text-stone-400 italic">
              First time logging this exercise
            </p>
          )}
        </section>

        {/* Today's Completed Sets */}
        {currentExerciseSets.length > 0 && (
          <section className="py-3 border-t border-stone-200/80 font-mono space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-widest text-stone-500 font-semibold block">
                Today:
              </span>
              <button
                type="button"
                onClick={deleteLastSet}
                className="text-xs text-stone-400 hover:text-rose-600 transition-colors cursor-pointer"
              >
                Undo
              </button>
            </div>

            <div className="space-y-1 text-sm text-zinc-900 font-bold">
              {currentExerciseSets.map((s, idx) => (
                <div key={s.id || idx} className="flex items-center gap-2 tabular-nums">
                  <span className="text-emerald-700 font-bold">✓</span>
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
            <p className="text-xs font-mono text-rose-600 font-medium">{validationError}</p>
          )}

          <div className="flex items-end gap-2.5">
            {/* Weight / Load Input */}
            <div className="flex-1">
              <label
                htmlFor="weight-input"
                className="block text-[11px] font-mono uppercase tracking-wider text-stone-600 font-bold mb-1 pl-0.5"
              >
                Load (lbs)
              </label>
              <div className="relative">
                <input
                  id="weight-input"
                  type="number"
                  step="any"
                  min="0"
                  inputMode="decimal"
                  placeholder="Load (lbs)"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  className="w-full h-14 bg-white border-2 border-stone-300 hover:border-stone-400 focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 rounded-xl px-3 font-mono font-bold text-2xl text-center text-zinc-900 placeholder-stone-400 transition-colors shadow-sm cursor-text"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono uppercase text-stone-500 pointer-events-none font-bold">
                  lbs
                </span>
              </div>
            </div>

            {/* Reps Input */}
            <div className="w-28">
              <label
                htmlFor="reps-input"
                className="block text-[11px] font-mono uppercase tracking-wider text-stone-600 font-bold mb-1 pl-0.5"
              >
                Reps
              </label>
              <div className="relative">
                <input
                  id="reps-input"
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  placeholder="Reps"
                  value={reps}
                  onChange={(e) => setReps(e.target.value)}
                  className="w-full h-14 bg-white border-2 border-stone-300 hover:border-stone-400 focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 rounded-xl px-3 font-mono font-bold text-2xl text-center text-zinc-900 placeholder-stone-400 transition-colors shadow-sm cursor-text"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono uppercase text-stone-500 pointer-events-none font-bold">
                  reps
                </span>
              </div>
            </div>

            {/* LOG SET Action Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="h-14 px-5 rounded-xl bg-zinc-900 hover:bg-zinc-800 active:scale-95 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all cursor-pointer disabled:opacity-50 min-w-[96px] flex items-center justify-center"
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
            const isDone = exSets.length >= (ex.targetSets || 3);

            return (
              <button
                key={ex.id}
                type="button"
                onClick={() => goToExercise(idx)}
                className={`h-2 rounded-full transition-all cursor-pointer ${
                  isActive
                    ? "w-8 bg-zinc-900"
                    : isDone
                    ? "w-2 bg-emerald-700"
                    : "w-2 bg-stone-300 hover:bg-stone-400"
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
            className="h-11 px-3 rounded-xl text-stone-400 hover:text-zinc-900 disabled:opacity-20 uppercase font-medium transition-colors cursor-pointer flex items-center justify-center min-h-[44px]"
          >
            ← Previous
          </button>

          {isLastExercise ? (
            <button
              type="button"
              onClick={handleFinishWorkout}
              className="h-11 px-5 rounded-xl bg-zinc-900 hover:bg-zinc-800 active:scale-95 text-white font-mono font-bold uppercase tracking-wider text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer min-h-[44px]"
            >
              <span>Finish Workout</span>
              <span>✓</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={goToNextExercise}
              className="h-11 px-3 rounded-xl text-zinc-800 hover:text-black font-bold uppercase transition-colors cursor-pointer flex items-center justify-center min-h-[44px]"
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
