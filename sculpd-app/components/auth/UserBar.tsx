// components/auth/UserBar.tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useUser } from "./UserContext";
import { useDev } from "@/components/dev/DevContext";
import { useSync } from "@/lib/sync/use-sync";
import { AvatarColor } from "@/types/models";
import {
  isPushSupported,
  getCurrentPushSubscription,
  subscribeUserToPush,
  unsubscribeUserFromPush,
  ensurePushSubscription,
  isStandalonePWA,
} from "@/lib/notifications/rest-notifier";
import BackupModal from "./BackupModal";

const BADGE_COLOR_MAP: Record<AvatarColor, { border: string; bg: string; text: string }> = {
  emerald: { border: "border-emerald-200", bg: "bg-emerald-50", text: "text-emerald-800" },
  amber: { border: "border-amber-200", bg: "bg-amber-50", text: "text-amber-800" },
  violet: { border: "border-violet-200", bg: "bg-violet-50", text: "text-violet-800" },
  cyan: { border: "border-cyan-200", bg: "bg-cyan-50", text: "text-cyan-800" },
  rose: { border: "border-rose-200", bg: "bg-rose-50", text: "text-rose-800" },
  blue: { border: "border-blue-200", bg: "bg-blue-50", text: "text-blue-800" },
  fuchsia: { border: "border-fuchsia-200", bg: "bg-fuchsia-50", text: "text-fuchsia-800" },
};

export default function UserBar() {
  const { activeUserId, activeUser, sessionToken, switchUser, updateBodyweight } = useUser();
  const { syncState, pendingCount, triggerSync } = useSync(activeUserId, sessionToken);
  const { isDevModeActive, logoutDev } = useDev();

  const [hasPushSupport, setHasPushSupport] = useState<boolean>(false);
  const [isPushActive, setIsPushActive] = useState<boolean>(false);
  const [isPushLoading, setIsPushLoading] = useState<boolean>(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState<boolean>(false);

  useEffect(() => {
    const supported = isPushSupported();
    setHasPushSupport(supported);
    if (!supported) {
      setIsPushActive(false);
      return;
    }

    if (typeof Notification !== "undefined" && Notification.permission !== "granted") {
      setIsPushActive(false);
      return;
    }

    getCurrentPushSubscription()
      .then(async (sub) => {
        if (!sub) {
          setIsPushActive(false);
          return;
        }
        if (sessionToken) {
          const res = await ensurePushSubscription(sessionToken);
          setIsPushActive(res.success);
        } else {
          setIsPushActive(true);
        }
      })
      .catch(() => {
        setIsPushActive(false);
      });
  }, [activeUserId, sessionToken]);

  const handleTogglePush = async () => {
    if (!sessionToken || isPushLoading) return;
    setIsPushLoading(true);

    try {
      const isIOS =
        typeof navigator !== "undefined" &&
        (/iphone|ipad|ipod/i.test(navigator.userAgent) ||
          (/macintosh/i.test(navigator.userAgent) && (navigator.maxTouchPoints || 0) > 1));

      if (isPushActive) {
        await unsubscribeUserFromPush(sessionToken);
        setIsPushActive(false);
      } else {
        if (isIOS && !isStandalonePWA()) {
          alert(
            "On iOS, background rest alerts require adding Sculp'd to your Home Screen.\n\n1. Tap the Share button (square with arrow) at the bottom of Safari.\n2. Tap 'Add to Home Screen'.\n3. Launch Sculp'd from your Home Screen to turn on Alerts."
          );
          return;
        }

        if (typeof Notification !== "undefined" && Notification.permission === "denied") {
          alert(
            "Notification permission is blocked. Go to iPhone Settings → Notifications → Sculp'd and enable 'Allow Notifications'."
          );
          return;
        }

        const res = await subscribeUserToPush(sessionToken);
        if (res.success) {
          setIsPushActive(true);
        } else if (res.error) {
          alert(res.error);
        }
      }
    } finally {
      setIsPushLoading(false);
    }
  };

  if (!activeUser) return null;

  const theme = BADGE_COLOR_MAP[activeUser.avatarColor] || BADGE_COLOR_MAP.emerald;

  return (
    <div className="w-full flex items-center justify-between pb-3.5 mb-2 border-b border-stone-200/80">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={switchUser}
          className="flex items-center gap-2 group text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 rounded-lg -m-1 p-1 hover:bg-stone-100/80 active:scale-95 transition-all"
          title="Switch athlete profile"
          aria-label={`Switch athlete profile (currently signed in as ${activeUser.displayName})`}
        >
          <div
            className={`w-7 h-7 rounded-full ${theme.bg} border ${theme.border} ${theme.text} flex items-center justify-center text-xs font-bold shadow-xs group-hover:scale-105 transition-transform`}
          >
            {activeUser.displayName.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-1">
              <span className="text-xs font-bold text-zinc-900 tracking-tight block group-hover:text-black">
                {activeUser.displayName}
              </span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2.5}
                stroke="currentColor"
                className="w-3 h-3 text-stone-400 group-hover:text-zinc-600 transition-colors"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </div>
            <span
              onClick={(e) => {
                e.stopPropagation();
                const newBw = prompt(
                  "Enter athlete bodyweight in lbs:",
                  typeof activeUser.bodyweight === "number" ? String(activeUser.bodyweight) : ""
                );
                if (newBw !== null) {
                  const val = parseFloat(newBw);
                  if (!isNaN(val) && val > 0) {
                    updateBodyweight(val);
                  }
                }
              }}
              title="Click to update athlete bodyweight"
              className="text-[10px] font-medium text-stone-500 hover:text-zinc-900 block cursor-pointer transition-colors"
            >
              {typeof activeUser.bodyweight === "number"
                ? `${activeUser.bodyweight} lbs BW`
                : "Personal Session • Set BW"}
            </span>
          </div>
        </button>

        <span className="text-stone-300 text-[10px] self-center">•</span>

        {/* Subtle sync status indicator */}
        <button
          type="button"
          onClick={triggerSync}
          title="Click to trigger sync"
          className="flex items-center gap-1.5 hover:opacity-80 transition-opacity cursor-pointer self-center"
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              syncState === "synced"
                ? "bg-emerald-600"
                : syncState === "syncing"
                ? "bg-amber-500 animate-pulse"
                : syncState === "offline"
                ? "bg-stone-400"
                : "bg-amber-500"
            }`}
          />
          <span className="text-[10px] font-mono text-stone-500">
            {syncState === "syncing"
              ? "Syncing..."
              : syncState === "offline"
              ? pendingCount > 0
                ? `Offline (${pendingCount} local)`
                : "Offline"
              : pendingCount > 0
              ? `Saved locally (${pendingCount})`
              : "Synced"}
          </span>
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        {hasPushSupport && (
          <button
            type="button"
            onClick={handleTogglePush}
            disabled={isPushLoading}
            title={
              isPushActive
                ? "Rest Push Alerts Active (tap to disable)"
                : "Enable Lock Screen Rest Alerts"
            }
            className={`flex items-center gap-1 text-[10px] font-mono font-medium px-2 py-1 rounded-lg border transition-colors cursor-pointer ${
              isPushActive
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-stone-50 text-stone-600 hover:text-zinc-900 border-stone-200"
            }`}
          >
            <span>{isPushActive ? "🔔 Alerts on" : "🔕 Alerts off"}</span>
          </button>
        )}

        {isDevModeActive ? (
          <div className="flex items-center gap-1">
            <Link
              href="/dev"
              className="text-xs font-mono font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-lg px-2 py-1 shadow-xs transition-colors cursor-pointer flex items-center gap-1"
              title="Open Developer Console"
            >
              <span>🛠️</span>
              <span>DEV</span>
            </Link>
            <button
              type="button"
              onClick={logoutDev}
              className="text-[10px] font-mono text-stone-500 hover:text-stone-800 bg-stone-100 hover:bg-stone-200 border border-stone-200 rounded-lg px-1.5 py-1 transition-colors cursor-pointer"
              title="Exit Developer Mode"
            >
              Exit
            </button>
          </div>
        ) : (
          <Link
            href="/dev"
            className="text-[11px] font-mono font-medium text-stone-500 hover:text-amber-800 hover:bg-amber-50 border border-stone-200 hover:border-amber-200 rounded-lg px-2 py-1 shadow-xs transition-colors cursor-pointer flex items-center gap-1"
            title="Open Developer Mode"
          >
            <span>🛠️</span>
            <span>Dev</span>
          </Link>
        )}

        <button
          type="button"
          onClick={() => setIsBackupModalOpen(true)}
          className="text-xs font-medium text-zinc-600 hover:text-zinc-900 bg-white hover:bg-stone-50 border border-stone-200 rounded-lg px-2.5 py-1 shadow-xs transition-colors cursor-pointer"
          title="Backup & Restore local database"
        >
          Backup
        </button>

        <button
          type="button"
          onClick={switchUser}
          className="text-xs font-medium text-zinc-600 hover:text-zinc-900 bg-white hover:bg-stone-50 border border-stone-200 rounded-lg px-2.5 py-1 shadow-xs transition-colors cursor-pointer"
        >
          Switch
        </button>
      </div>

      <BackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
      />
    </div>
  );
}
