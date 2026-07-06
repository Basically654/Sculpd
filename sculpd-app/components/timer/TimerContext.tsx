"use client";

import React, {
  createContext,
  useContext,
  useRef,
  useState,
  useEffect,
} from "react";

type TimerContextValue = {
  remaining: number;
  isActive: boolean;
  start: (seconds?: number) => void;
  stop: () => void;
  skip: () => void;
};

const TimerContext = createContext<TimerContextValue | null>(null);

export const TimerProvider = ({ children }: { children: React.ReactNode }) => {
  const [remaining, setRemaining] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, []);

  const start = (seconds = 90) => {
    // clear any existing
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    setRemaining(seconds);
    setIsActive(true);

    intervalRef.current = window.setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          // finish
          if (intervalRef.current) window.clearInterval(intervalRef.current);
          intervalRef.current = null;
          setIsActive(false);
          return 0;
        }
        return r - 1;
      });
    }, 1000) as unknown as number;
  };

  const stop = () => {
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    intervalRef.current = null;
    setIsActive(false);
    setRemaining(0);
  };

  const skip = () => stop();

  return (
    <TimerContext.Provider value={{ remaining, isActive, start, stop, skip }}>
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
