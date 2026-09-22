// components/timer/TimerContext.tsx
"use client";

import React, {
  createContext,
  useContext,
  useRef,
  useState,
  useEffect,
  useCallback,
} from "react";
import {
  initServiceWorker,
  requestNotificationPermission,
  scheduleRestNotification,
  cancelRestNotification,
  playRestCompleteChime,
  calculateRemainingSeconds,
  isRestExpired,
  RestTimerState,
} from "@/lib/notifications/rest-notifier";
import { useUser } from "@/components/auth/UserContext";

export const STORAGE_REST_TIMER_STATE = "sculpd_rest_timer_state";
export const STORAGE_END_KEY = "sculpd_rest_timer_end";
export const STORAGE_TOTAL_KEY = "sculpd_rest_timer_total";

export type TimerContextValue = {
  remaining: number;
  totalDuration: number;
  isActive: boolean;
  isCompleted: boolean;
  exerciseName?: string;
  nextSetNumber?: number;
  timerId?: string;
  restStartedAt?: number | null;
  restEndsAt?: number | null;
  workoutUrl?: string;
  start: (
    seconds?: number,
    exerciseName?: string,
    nextSetNumber?: number,
    workoutUrl?: string
  ) => void;
  stop: () => void;
  skip: () => void;
  addTime: (seconds: number) => void;
  resetCompleted: () => void;
};

const TimerContext = createContext<TimerContextValue | null>(null);

export const TimerProvider = ({ children }: { children: React.ReactNode }) => {
  const [remaining, setRemaining] = useState(0);
  const [totalDuration, setTotalDuration] = useState(90);
  const [isActive, setIsActive] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [exerciseName, setExerciseName] = useState<string | undefined>(undefined);
  const [nextSetNumber, setNextSetNumber] = useState<number | undefined>(undefined);
  const [timerId, setTimerId] = useState<string | undefined>(undefined);
  const [workoutUrl, setWorkoutUrl] = useState<string | undefined>(undefined);

  const endTimeRef = useRef<number | null>(null);
  const startedTimeRef = useRef<number | null>(null);
  const timerIdRef = useRef<string | null>(null);
  const scheduledTimerIdRef = useRef<string | null>(null);
  const intervalRef = useRef<number | null>(null);

  // Safely access authenticated session token if available
  let userCtx: any = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    userCtx = useUser();
  } catch {
    userCtx = null;
  }
  const sessionToken = userCtx?.sessionToken || null;
  const sessionTokenRef = useRef<string | null>(sessionToken);
  useEffect(() => {
    sessionTokenRef.current = sessionToken;
  }, [sessionToken]);

  // Initialize service worker on client startup
  useEffect(() => {
    initServiceWorker().catch(() => {});
  }, []);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    const idToCancel = timerIdRef.current;
    endTimeRef.current = null;
    startedTimeRef.current = null;
    timerIdRef.current = null;
    scheduledTimerIdRef.current = null;

    setIsActive(false);
    setRemaining(0);
    setTimerId(undefined);

    cancelRestNotification(idToCancel || undefined, sessionTokenRef.current).catch(() => {});

    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_REST_TIMER_STATE);
      localStorage.removeItem(STORAGE_END_KEY);
      localStorage.removeItem(STORAGE_TOTAL_KEY);
    }
  }, []);

  const skip = useCallback(() => {
    stop();
    setIsCompleted(false);
  }, [stop]);

  const resetCompleted = useCallback(() => {
    setIsCompleted(false);
  }, []);

  const tick = useCallback(() => {
    if (!endTimeRef.current) {
      stop();
      return;
    }
    const rem = calculateRemainingSeconds(endTimeRef.current);
    setRemaining(rem);
    if (rem <= 0) {
      // Rest period complete!
      stop();
      setIsCompleted(true);
      playRestCompleteChime();
    }
  }, [stop]);

  const start = useCallback(
    (
      seconds = 90,
      exName?: string,
      nextSet?: number,
      targetWorkoutUrl?: string
    ) => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
      }

      const now = Date.now();
      const targetMs = now + seconds * 1000;
      const id = `rest_${now}_${Math.random().toString(36).substring(2, 7)}`;

      endTimeRef.current = targetMs;
      startedTimeRef.current = now;
      timerIdRef.current = id;
      scheduledTimerIdRef.current = id;

      setIsCompleted(false);
      setExerciseName(exName);
      setNextSetNumber(nextSet);
      setWorkoutUrl(targetWorkoutUrl);
      setTimerId(id);
      setTotalDuration(seconds);
      setRemaining(seconds);
      setIsActive(true);

      const stateObj: RestTimerState = {
        id,
        restStartedAt: now,
        restEndsAt: targetMs,
        totalDuration: seconds,
        exerciseName: exName,
        nextSetNumber: nextSet,
        workoutUrl: targetWorkoutUrl,
        status: "running",
        notificationSent: false,
      };

      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_REST_TIMER_STATE, JSON.stringify(stateObj));
        localStorage.setItem(STORAGE_END_KEY, String(targetMs));
        localStorage.setItem(STORAGE_TOTAL_KEY, String(seconds));
      }

      // Request notification permission non-intrusively
      requestNotificationPermission().catch(() => {});

      // Dispatch background notification to Service Worker and server scheduler
      scheduleRestNotification(
        stateObj,
        undefined,
        undefined,
        sessionTokenRef.current
      ).catch(() => {});

      // Local UI update interval
      intervalRef.current = window.setInterval(tick, 250);
    },
    [tick]
  );

  const addTime = useCallback(
    (extraSeconds: number) => {
      if (!endTimeRef.current || !isActive) return;
      const newTargetMs = endTimeRef.current + extraSeconds * 1000;
      endTimeRef.current = newTargetMs;
      setTotalDuration((prev) => prev + extraSeconds);
      const rem = calculateRemainingSeconds(newTargetMs);
      setRemaining(rem);

      const currentId = timerIdRef.current || `rest_${newTargetMs}`;

      if (typeof window !== "undefined") {
        const existingStr = localStorage.getItem(STORAGE_REST_TIMER_STATE);
        let updatedState: RestTimerState;
        if (existingStr) {
          try {
            const parsed = JSON.parse(existingStr);
            updatedState = {
              ...parsed,
              restEndsAt: newTargetMs,
              totalDuration: (parsed.totalDuration || 90) + extraSeconds,
            };
          } catch {
            updatedState = {
              id: currentId,
              restStartedAt: startedTimeRef.current || Date.now(),
              restEndsAt: newTargetMs,
              totalDuration: totalDuration + extraSeconds,
              exerciseName,
              nextSetNumber,
              workoutUrl,
              status: "running",
            };
          }
        } else {
          updatedState = {
            id: currentId,
            restStartedAt: startedTimeRef.current || Date.now(),
            restEndsAt: newTargetMs,
            totalDuration: totalDuration + extraSeconds,
            exerciseName,
            nextSetNumber,
            workoutUrl,
            status: "running",
          };
        }

        localStorage.setItem(STORAGE_REST_TIMER_STATE, JSON.stringify(updatedState));
        localStorage.setItem(STORAGE_END_KEY, String(newTargetMs));

        // Re-schedule notification with updated target timestamp using same ID
        scheduleRestNotification(
          updatedState,
          undefined,
          undefined,
          sessionTokenRef.current
        ).catch(() => {});
      }
    },
    [isActive, exerciseName, nextSetNumber, workoutUrl, totalDuration]
  );

  // Restore active timer from localStorage on mount (survives tab closing / refresh)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedStateStr = localStorage.getItem(STORAGE_REST_TIMER_STATE);
    const savedEnd = localStorage.getItem(STORAGE_END_KEY);
    const savedTotal = localStorage.getItem(STORAGE_TOTAL_KEY);

    let restoredState: RestTimerState | null = null;

    if (savedStateStr) {
      try {
        restoredState = JSON.parse(savedStateStr);
      } catch {
        restoredState = null;
      }
    }

    if (!restoredState && savedEnd) {
      const endMs = parseInt(savedEnd, 10);
      if (!isNaN(endMs)) {
        const total = savedTotal ? parseInt(savedTotal, 10) : 90;
        restoredState = {
          id: `rest_${endMs}`,
          restStartedAt: endMs - total * 1000,
          restEndsAt: endMs,
          totalDuration: total,
          status: "running",
        };
      }
    }

    if (restoredState) {
      const now = Date.now();
      if (!isRestExpired(restoredState.restEndsAt, now)) {
        // Rest is still in progress: rehydrate UI
        endTimeRef.current = restoredState.restEndsAt;
        startedTimeRef.current = restoredState.restStartedAt;
        timerIdRef.current = restoredState.id;
        scheduledTimerIdRef.current = restoredState.id;

        setTotalDuration(restoredState.totalDuration || 90);
        setExerciseName(restoredState.exerciseName);
        setNextSetNumber(restoredState.nextSetNumber);
        setWorkoutUrl(restoredState.workoutUrl);
        setTimerId(restoredState.id);
        setIsActive(true);

        const rem = calculateRemainingSeconds(restoredState.restEndsAt, now);
        setRemaining(rem);

        intervalRef.current = window.setInterval(tick, 250);
      } else {
        // Rest expired while the app was closed / suspended!
        // Immediately detect completion and notify
        setIsCompleted(true);
        setIsActive(false);
        setRemaining(0);
        setExerciseName(restoredState.exerciseName);
        setNextSetNumber(restoredState.nextSetNumber);
        playRestCompleteChime();

        localStorage.removeItem(STORAGE_REST_TIMER_STATE);
        localStorage.removeItem(STORAGE_END_KEY);
        localStorage.removeItem(STORAGE_TOTAL_KEY);
      }
    }

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
      }
    };
  }, [tick]);

  // Recalculate immediately when tab or app regains focus/visibility after suspension
  useEffect(() => {
    const handleReSync = () => {
      if (endTimeRef.current && isActive) {
        const now = Date.now();
        if (isRestExpired(endTimeRef.current, now)) {
          // Detected expiration during background suspension
          stop();
          setIsCompleted(true);
          playRestCompleteChime();
        } else {
          setRemaining(calculateRemainingSeconds(endTimeRef.current, now));
        }
      }
    };

    document.addEventListener("visibilitychange", handleReSync);
    window.addEventListener("focus", handleReSync);
    window.addEventListener("pageshow", handleReSync);

    return () => {
      document.removeEventListener("visibilitychange", handleReSync);
      window.removeEventListener("focus", handleReSync);
      window.removeEventListener("pageshow", handleReSync);
    };
  }, [isActive, stop]);

  return (
    <TimerContext.Provider
      value={{
        remaining,
        totalDuration,
        isActive,
        isCompleted,
        exerciseName,
        nextSetNumber,
        timerId,
        restStartedAt: startedTimeRef.current,
        restEndsAt: endTimeRef.current,
        workoutUrl,
        start,
        stop,
        skip,
        addTime,
        resetCompleted,
      }}
    >
      {children}
    </TimerContext.Provider>
  );
};

export const useTimer = () => {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error("useTimer must be used within TimerProvider");
  return ctx;
};

export default TimerContext;
