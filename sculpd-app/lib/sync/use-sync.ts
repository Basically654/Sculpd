// lib/sync/use-sync.ts
"use client";

import { useState, useEffect, useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { performFullSync, SyncState } from "./sync-client";

export function useSync(userId: string | null, sessionToken: string | null) {
  const [syncState, setSyncState] = useState<SyncState>("synced");
  const [lastError, setLastError] = useState<string | null>(null);

  // Live count of pending/failed items for this user in IndexedDB
  const pendingItems = useLiveQuery(
    async () => {
      if (!userId) return [];
      return db.syncQueue.where("userId").equals(userId).toArray();
    },
    [userId],
    []
  );

  const pendingCount = pendingItems.length;

  const triggerSync = useCallback(async () => {
    if (!userId || !sessionToken) return;

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setSyncState("offline");
      return;
    }

    setSyncState("syncing");
    setLastError(null);

    const result = await performFullSync(userId, sessionToken);

    if (result.success) {
      setSyncState(pendingCount > 0 ? "pending" : "synced");
    } else {
      setLastError(result.error || "Sync error");
      setSyncState(
        typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "pending"
      );
    }
  }, [userId, sessionToken, pendingCount]);

  // Network online/offline event listeners and visibility change
  useEffect(() => {
    if (!userId || !sessionToken) return;

    const handleOnline = () => {
      triggerSync();
    };

    const handleOffline = () => {
      setSyncState("offline");
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        triggerSync();
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibility);

    // Initial sync trigger
    triggerSync();

    // Periodic sync check every 45s
    const interval = window.setInterval(() => {
      if (navigator.onLine) {
        triggerSync();
      }
    }, 45000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.clearInterval(interval);
    };
  }, [userId, sessionToken, triggerSync]);

  // Update status when pending count changes
  useEffect(() => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setSyncState("offline");
    } else if (syncState !== "syncing") {
      setSyncState(pendingCount > 0 ? "pending" : "synced");
    }
  }, [pendingCount, syncState]);

  return {
    syncState,
    pendingCount,
    lastError,
    triggerSync,
  };
}
