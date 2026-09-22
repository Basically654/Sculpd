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

const STORAGE_END_KEY = "sculpd_rest_timer_end";
const STORAGE_TOTAL_KEY = "sculpd_rest_timer_total";

export type TimerContextValue = {
  remaining: number;
  totalDuration: number;
  isActive: boolean;
  start: (seconds?: number) => void;
  stop: () => void;
  skip: () => void;
  addTime: (seconds: number) => void;
};

const TimerContext = createContext<TimerContextValue | null>(null);

export const TimerProvider = ({ children }: { children: React.ReactNode }) => {
  const [remaining, setRemaining] = useState(0);
  const [totalDuration, setTotalDuration] = useState(90);
  const [isActive, setIsActive] = useState(false);
  const endTimeRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);

  /**
   * Derives remaining seconds from absolute end timestamp.
   * Does NOT depend on interval count or step accuracy.
   */
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

    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_END_KEY);
      localStorage.removeItem(STORAGE_TOTAL_KEY);
    }
  }, []);

  const skip = useCallback(() => {
    stop();
  }, [stop]);

  const tick = useCallback(() => {
    if (!endTimeRef.current) {
      stop();
      return;
    }
    const rem = calculateRemaining(endTimeRef.current);
    setRemaining(rem);
    if (rem <= 0) {
      stop();
    }
  }, [calculateRemaining, stop]);

  const start = useCallback(
    (seconds = 90) => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
      }

      const targetMs = Date.now() + seconds * 1000;
      endTimeRef.current = targetMs;
      setTotalDuration(seconds);
      setRemaining(seconds);
      setIsActive(true);

      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_END_KEY, String(targetMs));
        localStorage.setItem(STORAGE_TOTAL_KEY, String(seconds));
      }

      // UI polling interval - purely for visual refresh
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
    },
    [isActive, calculateRemaining]
  );

  // Restore active timer from localStorage on mount (survives app reload / restart)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedEnd = localStorage.getItem(STORAGE_END_KEY);
    const savedTotal = localStorage.getItem(STORAGE_TOTAL_KEY);

    if (savedEnd) {
      const endMs = parseInt(savedEnd, 10);
      if (!isNaN(endMs) && endMs > Date.now()) {
        const total = savedTotal ? parseInt(savedTotal, 10) : 90;
        endTimeRef.current = endMs;
        setTotalDuration(total);
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
  // Completely prevents throttling or background pauses from corrupting elapsed time
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
        start,
        stop,
        skip,
        addTime,
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
