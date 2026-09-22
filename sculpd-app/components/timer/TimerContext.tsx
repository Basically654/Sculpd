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
} from "@/lib/notifications/rest-notifier";

const STORAGE_END_KEY = "sculpd_rest_timer_end";
const STORAGE_TOTAL_KEY = "sculpd_rest_timer_total";

export type TimerContextValue = {
  remaining: number;
  totalDuration: number;
  isActive: boolean;
  isCompleted: boolean;
  exerciseName?: string;
  nextSetNumber?: number;
  start: (seconds?: number, exerciseName?: string, nextSetNumber?: number) => void;
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

  const endTimeRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);

  // Initialize service worker on client startup
  useEffect(() => {
    initServiceWorker().catch(() => {});
  }, []);

  const calculateRemaining = useCallback((targetTimeMs: number): number => {
    const diffMs = targetTimeMs - Date.now();
    return Math.max(0, Math.ceil(diffMs / 1000));
  }, []);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    endTimeRef.current = null;
    setIsActive(false);
    setRemaining(0);
    cancelRestNotification().catch(() => {});

    if (typeof window !== "undefined") {
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
    const rem = calculateRemaining(endTimeRef.current);
    setRemaining(rem);
    if (rem <= 0) {
      // Rest period complete!
      stop();
      setIsCompleted(true);
      playRestCompleteChime();
    }
  }, [calculateRemaining, stop]);

  const start = useCallback(
    (seconds = 90, exName?: string, nextSet?: number) => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
      }

      setIsCompleted(false);
      setExerciseName(exName);
      setNextSetNumber(nextSet);

      const targetMs = Date.now() + seconds * 1000;
      endTimeRef.current = targetMs;
      setTotalDuration(seconds);
      setRemaining(seconds);
      setIsActive(true);

      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_END_KEY, String(targetMs));
        localStorage.setItem(STORAGE_TOTAL_KEY, String(seconds));
      }

      // Request notification permission non-intrusively
      requestNotificationPermission().catch(() => {});

      // Dispatch background notification to Service Worker
      scheduleRestNotification(targetMs, exName, nextSet).catch(() => {});

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
      const rem = calculateRemaining(newTargetMs);
      setRemaining(rem);

      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_END_KEY, String(newTargetMs));
      }

      // Re-schedule notification
      scheduleRestNotification(newTargetMs, exerciseName, nextSetNumber).catch(() => {});
    },
    [isActive, calculateRemaining, exerciseName, nextSetNumber]
  );

  // Restore active timer from localStorage on mount (survives tab closing / refresh)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedEnd = localStorage.getItem(STORAGE_END_KEY);
    const savedTotal = localStorage.getItem(STORAGE_TOTAL_KEY);

    if (savedEnd) {
      const endMs = parseInt(savedEnd, 10);
      if (!isNaN(endMs) && endMs > Date.now()) {
        const total = savedTotal ? parseInt(savedTotal, 10) : 90;
        setTotalDuration(total);
        endTimeRef.current = endMs;
        setIsActive(true);
        const rem = calculateRemaining(endMs);
        setRemaining(rem);

        intervalRef.current = window.setInterval(tick, 250);
      } else {
        localStorage.removeItem(STORAGE_END_KEY);
        localStorage.removeItem(STORAGE_TOTAL_KEY);
      }
    }

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
      }
    };
  }, [calculateRemaining, tick]);

  // Recalculate immediately when tab or app regains focus/visibility
  useEffect(() => {
    const handleReSync = () => {
      if (endTimeRef.current && isActive) {
        tick();
      }
    };

    document.addEventListener("visibilitychange", handleReSync);
    window.addEventListener("focus", handleReSync);

    return () => {
      document.removeEventListener("visibilitychange", handleReSync);
      window.removeEventListener("focus", handleReSync);
    };
  }, [isActive, tick]);

  return (
    <TimerContext.Provider
      value={{
        remaining,
        totalDuration,
        isActive,
        isCompleted,
        exerciseName,
        nextSetNumber,
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
