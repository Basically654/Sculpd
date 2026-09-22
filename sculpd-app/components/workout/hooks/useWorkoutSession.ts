// components/workout/hooks/useWorkoutSession.ts
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { Routine, Exercise, WorkoutSession, WorkoutSet } from "@/types/models";
import {
  getRoutineBySlug,
  getExercisesForRoutine,
  seedDefaultCatalog,
} from "@/lib/db/routine-repository";
import {
  startWorkoutSession,
  completeWorkoutSession,
  cancelWorkoutSession,
  getActiveWorkoutSession,
  logUserSet,
  deleteUserLastSet,
  getUserPreviousSet,
  getUserPreviousSetsForExercise,
  getUserSetsForExercise,
} from "@/lib/db/workout-repository";
import { useTimer } from "@/components/timer/TimerContext";
import { pushPendingMutations } from "@/lib/sync/sync-client";
import { detectPersonalRecord, PRResult } from "@/lib/pr/pr-detector";

interface UseWorkoutSessionOptions {
  routineSlug: string;
  userId: string | null;
  sessionToken?: string | null;
}

export function useWorkoutSession({
  routineSlug,
  userId,
  sessionToken,
}: UseWorkoutSessionOptions) {
  const timer = useTimer();

  const [routine, setRoutine] = useState<Routine | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Previous performance tracking
  const [previousSet, setPreviousSet] = useState<WorkoutSet | null>(null);
  const [previousSessionSets, setPreviousSessionSets] = useState<WorkoutSet[]>([]);
  const [isLoadingPrevious, setIsLoadingPrevious] = useState<boolean>(false);

  // PR Celebration State
  const [activePR, setActivePR] = useState<PRResult | null>(null);
  const [prsHit, setPrsHit] = useState<PRResult[]>([]);

  // Storage key for keeping exercise index sticky per session
  const sessionIndexStorageKey = useMemo(() => {
    return session ? `sculpd_session_${session.id}_ex_idx` : null;
  }, [session]);

  // 1. Initialize Routine, Exercises, and Workout Session
  useEffect(() => {
    if (!userId || !routineSlug) {
      setIsLoading(false);
      return;
    }

    const currentUserId = userId;
    let isMounted = true;

    async function init() {
      setIsLoading(true);
      setError(null);

      try {
        // Ensure catalog is seeded outside liveQuery
        await seedDefaultCatalog();

        // Fetch routine by slug from IndexedDB
        const loadedRoutine = await getRoutineBySlug(routineSlug);
        if (!loadedRoutine) {
          if (isMounted) {
            setError(`Routine "${routineSlug}" not found in database.`);
            setIsLoading(false);
          }
          return;
        }

        // Fetch exercises for this routine from IndexedDB
        const loadedExercises = await getExercisesForRoutine(loadedRoutine.id);
        if (loadedExercises.length === 0) {
          if (isMounted) {
            setError(`No exercises found for routine "${loadedRoutine.dayName}".`);
            setIsLoading(false);
          }
          return;
        }

        // Check if an active session already exists for this routine
        const existingActive = await getActiveWorkoutSession(currentUserId);
        let currentSession: WorkoutSession;

        if (existingActive && existingActive.routineId === loadedRoutine.id) {
          // Resume existing session
          currentSession = existingActive;
        } else {
          // Start a new session in IndexedDB
          currentSession = await startWorkoutSession(currentUserId, loadedRoutine.id);
        }

        if (isMounted) {
          setRoutine(loadedRoutine);
          setExercises(loadedExercises);
          setSession(currentSession);

          // Restore sticky exercise index if user previously navigated
          if (typeof window !== "undefined") {
            const savedIdx = localStorage.getItem(
              `sculpd_session_${currentSession.id}_ex_idx`
            );
            if (savedIdx !== null) {
              const parsed = parseInt(savedIdx, 10);
              if (!isNaN(parsed) && parsed >= 0 && parsed < loadedExercises.length) {
                setCurrentExerciseIndex(parsed);
              }
            }
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err?.message || "Failed to initialize workout session.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    init();

    return () => {
      isMounted = false;
    };
  }, [routineSlug, userId]);

  // 2. Real-time Live Query for sets logged in this session
  const sessionSets = useLiveQuery(
    async () => {
      if (!userId || !session) return [];
      return db.sets
        .where("[userId+workoutSessionId]")
        .equals([userId, session.id])
        .sortBy("setNumber");
    },
    [userId, session?.id],
    []
  );

  // Active exercise derived from current index
  const currentExercise = useMemo(() => {
    if (exercises.length === 0) return null;
    return exercises[currentExerciseIndex] || exercises[0];
  }, [exercises, currentExerciseIndex]);

  // Sets logged specifically for the current exercise in this session
  const currentExerciseSets = useMemo(() => {
    if (!currentExercise || !sessionSets) return [];
    return sessionSets.filter((s) => s.exerciseId === currentExercise.id);
  }, [sessionSets, currentExercise]);

  // 3. Query Previous Performance for Current Exercise
  useEffect(() => {
    if (!userId || !currentExercise || !session) {
      setPreviousSet(null);
      setPreviousSessionSets([]);
      return;
    }

    let isMounted = true;
    setIsLoadingPrevious(true);

    Promise.all([
      getUserPreviousSet(userId, currentExercise.id, session.id),
      getUserPreviousSetsForExercise(userId, currentExercise.id, session.id),
    ])
      .then(([prevSingle, prevSets]) => {
        if (isMounted) {
          setPreviousSet(prevSingle || null);
          setPreviousSessionSets(prevSets);
          setIsLoadingPrevious(false);
        }
      })
      .catch((err) => {
        console.warn("Failed to query previous performance:", err);
        if (isMounted) {
          setPreviousSet(null);
          setPreviousSessionSets([]);
          setIsLoadingPrevious(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [userId, currentExercise?.id, session?.id]);

  // 4. Navigation handlers
  const goToExercise = useCallback(
    (index: number) => {
      if (index >= 0 && index < exercises.length) {
        setCurrentExerciseIndex(index);
        if (sessionIndexStorageKey && typeof window !== "undefined") {
          localStorage.setItem(sessionIndexStorageKey, String(index));
        }
      }
    },
    [exercises.length, sessionIndexStorageKey]
  );

  const goToNextExercise = useCallback(() => {
    goToExercise(currentExerciseIndex + 1);
  }, [goToExercise, currentExerciseIndex]);

  const goToPreviousExercise = useCallback(() => {
    goToExercise(currentExerciseIndex - 1);
  }, [goToExercise, currentExerciseIndex]);

  // 5. Log a set with PR Detection and Dominant Rest Trigger
  const logSet = useCallback(
    async (weight: number, reps: number, rpe?: number | null) => {
      if (!userId || !session || !currentExercise) {
        throw new Error("Cannot log set: workout session not active.");
      }

      if (typeof weight !== "number" || isNaN(weight) || weight <= 0) {
        throw new Error("Please enter a valid weight (must be greater than 0).");
      }

      if (
        typeof reps !== "number" ||
        isNaN(reps) ||
        reps <= 0 ||
        !Number.isInteger(reps)
      ) {
        throw new Error("Please enter a valid number of reps (positive integer).");
      }

      // Check for PR before inserting (query all prior sets excluding current session)
      const allHistoricalSets = await getUserSetsForExercise(
        userId,
        currentExercise.id
      );
      const priorHistoricalSets = allHistoricalSets.filter(
        (s) => s.workoutSessionId !== session.id
      );

      const prCheck = detectPersonalRecord(
        { weight, reps },
        currentExercise.name,
        priorHistoricalSets
      );

      // 1. Immediately write to IndexedDB
      const newSet = await logUserSet(
        userId,
        session.id,
        currentExercise.id,
        weight,
        reps,
        rpe
      );

      // 2. If PR detected, trigger accomplishment overlay and track in session
      if (prCheck.isPR) {
        setActivePR(prCheck);
        setPrsHit((prev) => [...prev, prCheck]);
      }

      // 3. Start Rest Timer immediately (dominant rest state)
      try {
        const nextSetNum = currentExerciseSets.length + 2;
        timer.start(90, currentExercise.name, nextSetNum);
      } catch (timerErr) {
        console.warn("Could not start rest timer:", timerErr);
      }

      // 4. Asynchronously trigger background cloud sync
      if (sessionToken) {
        pushPendingMutations(userId, sessionToken).catch((syncErr) => {
          console.warn("Background sync warning:", syncErr);
        });
      }

      return newSet;
    },
    [userId, session, currentExercise, currentExerciseSets.length, timer, sessionToken]
  );

  // 6. Delete last logged set
  const deleteLastSet = useCallback(async () => {
    if (!userId || !session || !currentExercise) return false;

    const success = await deleteUserLastSet(
      userId,
      session.id,
      currentExercise.id
    );

    if (success && sessionToken) {
      pushPendingMutations(userId, sessionToken).catch((syncErr) => {
        console.warn("Background sync warning on delete:", syncErr);
      });
    }

    return success;
  }, [userId, session, currentExercise, sessionToken]);

  // 7. Complete the workout session
  const finishWorkout = useCallback(
    async (notes?: string) => {
      if (!userId || !session) {
        throw new Error("No active session to complete.");
      }

      const completed = await completeWorkoutSession(userId, session.id, notes);
      setSession(completed);

      // Clean up sticky exercise storage
      if (sessionIndexStorageKey && typeof window !== "undefined") {
        localStorage.removeItem(sessionIndexStorageKey);
      }

      // Push sync outbox asynchronously
      if (sessionToken) {
        pushPendingMutations(userId, sessionToken).catch((syncErr) => {
          console.warn("Background sync warning on finish:", syncErr);
        });
      }

      return completed;
    },
    [userId, session, sessionIndexStorageKey, sessionToken]
  );

  // 8. Cancel / discard session
  const cancelWorkout = useCallback(async () => {
    if (!userId || !session) return;

    await cancelWorkoutSession(userId, session.id);
    setSession(null);

    if (sessionIndexStorageKey && typeof window !== "undefined") {
      localStorage.removeItem(sessionIndexStorageKey);
    }

    if (sessionToken) {
      pushPendingMutations(userId, sessionToken).catch((syncErr) => {
        console.warn("Background sync warning on cancel:", syncErr);
      });
    }
  }, [userId, session, sessionIndexStorageKey, sessionToken]);

  const dismissPR = useCallback(() => {
    setActivePR(null);
  }, []);

  return {
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
    isLoadingPrevious,
    error,
    isFirstExercise: currentExerciseIndex === 0,
    isLastExercise: currentExerciseIndex === exercises.length - 1,
    goToExercise,
    goToNextExercise,
    goToPreviousExercise,
    logSet,
    deleteLastSet,
    finishWorkout,
    cancelWorkout,
    dismissPR,
  };
}
