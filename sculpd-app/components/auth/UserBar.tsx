// components/auth/UserBar.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useUser } from "./UserContext";
import { useSync } from "@/lib/sync/use-sync";
import { AvatarColor } from "@/types/models";
import {
  isPushSupported,
  getCurrentPushSubscription,
  subscribeUserToPush,
  unsubscribeUserFromPush,
  isStandalonePWA,
} from "@/lib/notifications/rest-notifier";

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
  const { activeUserId, activeUser, sessionToken, switchUser } = useUser();
  const { syncState, pendingCount, triggerSync } = useSync(activeUserId, sessionToken);

  const [hasPushSupport, setHasPushSupport] = useState<boolean>(false);
  const [isPushActive, setIsPushActive] = useState<boolean>(false);
  const [isPushLoading, setIsPushLoading] = useState<boolean>(false);

  useEffect(() => {
    const supported = isPushSupported();
    setHasPushSupport(supported);
    if (supported) {
      getCurrentPushSubscription().then((sub) => {
        setIsPushActive(Boolean(sub));
      });
    }
  }, [activeUserId]);

  const handleTogglePush = async () => {
    if (!sessionToken || isPushLoading) return;
    setIsPushLoading(true);

    try {
      if (isPushActive) {
        await unsubscribeUserFromPush(sessionToken);
        setIsPushActive(false);
      } else {
        const res = await subscribeUserToPush(sessionToken);
        if (res.success) {
          setIsPushActive(true);
        } else if (res.error) {
          if (!isStandalonePWA() && /iphone|ipad|ipod/i.test(navigator.userAgent)) {
            alert(
              "On iOS, Web Push requires adding Sculp'd to your Home Screen first (Share → Add to Home Screen)."
            );
          } else {
            alert(res.error);
          }
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
            <span className="text-[10px] font-medium text-stone-500 block">
              Personal Session
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

        <button
          type="button"
          onClick={switchUser}
          className="text-xs font-medium text-zinc-600 hover:text-zinc-900 bg-white hover:bg-stone-50 border border-stone-200 rounded-lg px-2.5 py-1 shadow-xs transition-colors cursor-pointer"
        >
          Switch
        </button>
      </div>
    </div>
  );
}
