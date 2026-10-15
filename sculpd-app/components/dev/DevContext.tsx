// components/dev/DevContext.tsx
"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { db } from "@/lib/db";
import { isPushSupported, getCurrentPushSubscription } from "@/lib/notifications/rest-notifier";
import { telemetry, TelemetryEvent, logErrorTelemetry } from "@/lib/telemetry/telemetry-service";

export interface DevRecordCounts {
  users: number;
  routines: number;
  exercises: number;
  routineExercises: number;
  workoutSessions: number;
  sets: number;
  syncQueue: number;
  syncMeta: number;
}

export interface DevSystemStats {
  appVersion: string;
  environment: string;
  indexedDbAvailable: boolean;
  recordCounts: DevRecordCounts;
  syncQueue: {
    total: number;
    pending: number;
    failed: number;
  };
  notifications: {
    permission: NotificationPermission | "unsupported";
    pushSupported: boolean;
    swRegistered: boolean;
    hasActiveSubscription: boolean;
  };
  serverInfo?: {
    hasMongoUri: boolean;
    hasQStash: boolean;
    hasVapidKeys: boolean;
  };
}

interface DevContextValue {
  isDevModeActive: boolean;
  devToken: string | null;
  devUser: { id: string; username: string; role: string } | null;
  isLoading: boolean;
  stats: DevSystemStats | null;
  recentEvents: TelemetryEvent[];
  loginDev: (username: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  logoutDev: () => void;
  refreshStats: () => Promise<void>;
  clearTelemetry: () => void;
}

const DEV_TOKEN_KEY = "sculpd_dev_token";
const DEV_USER_KEY = "sculpd_dev_user";

const DevContext = createContext<DevContextValue | null>(null);

export function DevProvider({ children }: { children: React.ReactNode }) {
  const [devToken, setDevToken] = useState<string | null>(null);
  const [devUser, setDevUser] = useState<{ id: string; username: string; role: string } | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [stats, setStats] = useState<DevSystemStats | null>(null);
  const [recentEvents, setRecentEvents] = useState<TelemetryEvent[]>([]);

  // Initialize from storage on client mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const storedToken = localStorage.getItem(DEV_TOKEN_KEY);
      const storedUser = localStorage.getItem(DEV_USER_KEY);
      if (storedToken && storedUser) {
        setDevToken(storedToken);
        setDevUser(JSON.parse(storedUser));
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Subscribe to diagnostic telemetry events
  useEffect(() => {
    setRecentEvents(telemetry.getEvents());
    const unsubscribe = telemetry.subscribe(() => {
      setRecentEvents(telemetry.getEvents());
    });
    return unsubscribe;
  }, []);

  // Query actual local system diagnostics
  const refreshStats = useCallback(async () => {
    try {
      let idbOk = false;
      let counts: DevRecordCounts = {
        users: 0,
        routines: 0,
        exercises: 0,
        routineExercises: 0,
        workoutSessions: 0,
        sets: 0,
        syncQueue: 0,
        syncMeta: 0,
      };
      let queuePending = 0;
      let queueFailed = 0;

      try {
        if (typeof window !== "undefined" && window.indexedDB) {
          idbOk = true;
          const [
            uCount,
            rCount,
            eCount,
            reCount,
            wsCount,
            sCount,
            sqCount,
            smCount,
            qItems,
          ] = await Promise.all([
            db.users.count().catch(() => 0),
            db.routines.count().catch(() => 0),
            db.exercises.count().catch(() => 0),
            db.routineExercises.count().catch(() => 0),
            db.workoutSessions.count().catch(() => 0),
            db.sets.count().catch(() => 0),
            db.syncQueue.count().catch(() => 0),
            db.syncMeta.count().catch(() => 0),
            db.syncQueue.toArray().catch(() => []),
          ]);

          counts = {
            users: uCount,
            routines: rCount,
            exercises: eCount,
            routineExercises: reCount,
            workoutSessions: wsCount,
            sets: sCount,
            syncQueue: sqCount,
            syncMeta: smCount,
          };

          queuePending = qItems.filter((i) => i.status === "pending").length;
          queueFailed = qItems.filter((i) => i.status === "failed").length;
        }
      } catch (idbErr) {
        console.warn("IndexedDB stats error:", idbErr);
      }

      // Check notification & SW status
      let notifPerm: NotificationPermission | "unsupported" = "unsupported";
      if (typeof window !== "undefined" && "Notification" in window) {
        notifPerm = Notification.permission;
      }
      const pushOk = isPushSupported();

      let swRegistered = false;
      let hasSub = false;
      if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations().catch(() => []);
        swRegistered = regs.length > 0;
        const sub = await getCurrentPushSubscription().catch(() => null);
        hasSub = Boolean(sub);
      }

      // Server diagnostics if devToken is active
      let serverInfo: any = undefined;
      if (devToken) {
        try {
          const res = await fetch("/api/dev/session", {
            headers: { Authorization: `Bearer ${devToken}` },
          });
          if (res.ok) {
            const data = await res.json();
            serverInfo = data.system;
          }
        } catch {
          // offline
        }
      }

      setStats({
        appVersion: "2.0.0-dev",
        environment: process.env.NODE_ENV || "development",
        indexedDbAvailable: idbOk,
        recordCounts: counts,
        syncQueue: {
          total: counts.syncQueue,
          pending: queuePending,
          failed: queueFailed,
        },
        notifications: {
          permission: notifPerm,
          pushSupported: pushOk,
          swRegistered,
          hasActiveSubscription: hasSub,
        },
        serverInfo,
      });
    } catch (err: any) {
      logErrorTelemetry(err, "refreshDevStats");
    }
  }, [devToken]);

  // Refresh stats on load or token change
  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  const loginDev = useCallback(
    async (username: string, pass: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const res = await fetch("/api/dev/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password: pass }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          return { success: false, error: data.error || "Developer login failed." };
        }

        setDevToken(data.token);
        setDevUser(data.user);
        if (typeof window !== "undefined") {
          localStorage.setItem(DEV_TOKEN_KEY, data.token);
          localStorage.setItem(DEV_USER_KEY, JSON.stringify(data.user));
        }

        telemetry.recordEvent({
          category: "test",
          eventType: "dev.login.success",
          data: { username: data.user.username },
        });

        return { success: true };
      } catch (err: any) {
        return { success: false, error: err?.message || "Developer login network error." };
      }
    },
    []
  );

  const logoutDev = useCallback(() => {
    setDevToken(null);
    setDevUser(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem(DEV_TOKEN_KEY);
      localStorage.removeItem(DEV_USER_KEY);
    }
    telemetry.recordEvent({
      category: "test",
      eventType: "dev.logout",
    });
  }, []);

  const clearTelemetry = useCallback(() => {
    telemetry.clear();
    setRecentEvents([]);
  }, []);

  return (
    <DevContext.Provider
      value={{
        isDevModeActive: Boolean(devToken),
        devToken,
        devUser,
        isLoading,
        stats,
        recentEvents,
        loginDev,
        logoutDev,
        refreshStats,
        clearTelemetry,
      }}
    >
      {children}
    </DevContext.Provider>
  );
}

export function useDev(): DevContextValue {
  const context = useContext(DevContext);
  if (!context) {
    throw new Error("useDev must be used within a DevProvider");
  }
  return context;
}
