// components/workout/WorkoutScreen.tsx
"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/auth/UserContext";
import WhoIsTrainingView from "@/components/auth/WhoIsTrainingView";
import { useWorkoutSession } from "./hooks/useWorkoutSession";
import WorkoutHeader from "./WorkoutHeader";
import ExerciseHeader from "./ExerciseHeader";
import PreviousPerformanceBanner from "./PreviousPerformanceBanner";
import SetLoggingForm from "./SetLoggingForm";
import CompletedSetsList from "./CompletedSetsList";
import WorkoutNavControls from "./WorkoutNavControls";
import FinishWorkoutModal from "./FinishWorkoutModal";

interface WorkoutScreenProps {
  routineSlug: string;
}

export default function WorkoutScreen({ routineSlug }: WorkoutScreenProps) {
  const router = useRouter();
  const { activeUserId, sessionToken, isLoading: isUserLoading } = useUser();
  const [isFinishModalOpen, setIsFinishModalOpen] = useState(false);
  const [isWorkoutCompleted, setIsWorkoutCompleted] = useState(false);

  const {
    routine,
    exercises,
    session,
    sessionSets,
    currentExerciseIndex,
    currentExercise,
    currentExerciseSets,
    previousSet,
    isLoading,
    isLoadingPrevious,
    error,
    goToExercise,
    goToNextExercise,
    goToPreviousExercise,
    logSet,
    deleteLastSet,
    finishWorkout,
  } = useWorkoutSession({
    routineSlug,
    userId: activeUserId,
    sessionToken,
  });

  // 1. Auth check
  if (isUserLoading) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4">
        <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin mb-4" />
        <p className="text-xs font-mono uppercase tracking-widest text-zinc-500">
          Verifying Identity...
        </p>
      </div>
    );
  }

  if (!activeUserId) {
    return <WhoIsTrainingView />;
  }

  // 2. Loading workout session from IndexedDB
  if (isLoading) {
    return (
      <main className="min-h-screen bg-black text-white p-4 max-w-md mx-auto flex flex-col items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin mb-3" />
        <p className="text-xs font-mono uppercase tracking-widest text-zinc-400">
          Loading Gym Session...
        </p>
      </main>
    );
  }

  // 3. Error state
  if (error || !routine || !currentExercise) {
    return (
      <main className="min-h-screen bg-black text-white p-6 max-w-md mx-auto flex flex-col items-center justify-center text-center space-y-4 font-mono">
        <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="w-6 h-6"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
        </div>
        <div>
          <h2 className="text-base font-black uppercase text-white mb-1">
            Workout Session Error
          </h2>
          <p className="text-xs text-zinc-400">
            {error || "Could not resolve routine details."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-mono uppercase text-zinc-300 hover:text-white"
        >
          Return to Dashboard
        </button>
      </main>
    );
  }

  // 4. Workout Completed Celebration Screen
  if (isWorkoutCompleted) {
    return (
      <main className="min-h-screen bg-black text-white p-6 max-w-md mx-auto flex flex-col items-center justify-center text-center space-y-6 animate-in fade-in duration-300 font-mono">
        <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shadow-2xl shadow-emerald-950/60">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={3}
            stroke="currentColor"
            className="w-8 h-8"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.5 12.75l6 6 9-13.5"
            />
          </svg>
        </div>

        <div className="space-y-1">
          <h1 className="text-2xl font-black uppercase tracking-tight text-white">
            Workout Completed!
          </h1>
          <p className="text-xs text-zinc-400">
            {routine.dayName} • {sessionSets?.length || 0} total sets recorded
          </p>
        </div>

        <button
          type="button"
          onClick={() => router.push("/")}
          className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase tracking-wider text-xs active:scale-[0.98] shadow-lg shadow-emerald-950/50 transition-all cursor-pointer"
        >
          Return to Dashboard
        </button>
      </main>
    );
  }

  const lastLoggedSet =
    currentExerciseSets.length > 0
      ? currentExerciseSets[currentExerciseSets.length - 1]
      : undefined;

  const nextSetNumber = currentExerciseSets.length + 1;

  const handleFinishConfirm = async (notes?: string) => {
    await finishWorkout(notes);
    setIsFinishModalOpen(false);
    setIsWorkoutCompleted(true);
  };

  return (
    <main className="min-h-screen bg-black text-white p-4 pb-28 max-w-md mx-auto w-full font-sans flex flex-col justify-between">
      <div>
        {/* Header navigation & title */}
        <WorkoutHeader
          routine={routine}
          currentExerciseIndex={currentExerciseIndex}
          totalExercises={exercises.length}
          onFinishClick={() => setIsFinishModalOpen(true)}
        />

        {/* Active Exercise details */}
        <ExerciseHeader exercise={currentExercise} />

        {/* Previous performance isolated to active user */}
        <PreviousPerformanceBanner
          previousSet={previousSet}
          isLoading={isLoadingPrevious}
        />

        {/* Weight & Reps inputs + Log Set */}
        <SetLoggingForm
          exerciseId={currentExercise.id}
          nextSetNumber={nextSetNumber}
          lastLoggedSet={lastLoggedSet}
          previousPerformance={previousSet}
          onLogSet={logSet}
        />

        {/* Sets completed during current session for this exercise */}
        <CompletedSetsList
          sets={currentExerciseSets}
          onDeleteLastSet={deleteLastSet}
        />
      </div>

      {/* Navigation footer */}
      <div>
        <WorkoutNavControls
          currentIndex={currentExerciseIndex}
          totalExercises={exercises.length}
          exercises={exercises}
          onPrevious={goToPreviousExercise}
          onNext={goToNextExercise}
          onSelectExercise={goToExercise}
          onFinish={() => setIsFinishModalOpen(true)}
        />
      </div>

      {/* Confirmation modal for finishing workout */}
      <FinishWorkoutModal
        isOpen={isFinishModalOpen}
        routine={routine}
        sets={sessionSets || []}
        onConfirm={handleFinishConfirm}
        onCancel={() => setIsFinishModalOpen(false)}
      />
    </main>
  );
}
