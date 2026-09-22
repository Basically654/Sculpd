// components/auth/UserBar.tsx
"use client";

import React from "react";
import { useUser } from "./UserContext";
import { useSync } from "@/lib/sync/use-sync";
import { AvatarColor } from "@/types/models";

const BADGE_COLOR_MAP: Record<AvatarColor, { border: string; bg: string; text: string }> = {
  emerald: { border: "border-emerald-500/50", bg: "bg-emerald-500/10", text: "text-emerald-400" },
  amber: { border: "border-amber-500/50", bg: "bg-amber-500/10", text: "text-amber-400" },
  violet: { border: "border-violet-500/50", bg: "bg-violet-500/10", text: "text-violet-400" },
  cyan: { border: "border-cyan-500/50", bg: "bg-cyan-500/10", text: "text-cyan-400" },
  rose: { border: "border-rose-500/50", bg: "bg-rose-500/10", text: "text-rose-400" },
  blue: { border: "border-blue-500/50", bg: "bg-blue-500/10", text: "text-blue-400" },
  fuchsia: { border: "border-fuchsia-500/50", bg: "bg-fuchsia-500/10", text: "text-fuchsia-400" },
};

export default function UserBar() {
  const { activeUserId, activeUser, sessionToken, switchUser } = useUser();
  const { syncState, pendingCount, triggerSync } = useSync(activeUserId, sessionToken);

  if (!activeUser) return null;

  const theme = BADGE_COLOR_MAP[activeUser.avatarColor] || BADGE_COLOR_MAP.emerald;

  return (
    <div className="w-full flex items-center justify-between pb-3 mb-2 border-b border-zinc-800/80">
      <div className="flex items-center gap-2.5">
        <div
          className={`w-7 h-7 rounded-full ${theme.bg} border ${theme.border} ${theme.text} flex items-center justify-center text-xs font-black`}
        >
          {activeUser.displayName.charAt(0).toUpperCase()}
        </div>
        <div>
          <span className="text-xs font-black uppercase text-zinc-200 tracking-tight block">
            {activeUser.displayName}
          </span>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[9px] font-mono text-emerald-400 uppercase tracking-wider">
              Active Athlete
            </span>
            <span className="text-zinc-600 text-[9px]">•</span>
            {/* Subtle sync status indicator */}
            <button
              type="button"
              onClick={triggerSync}
              title="Click to trigger sync"
              className="flex items-center gap-1 hover:opacity-80 transition-opacity"
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  syncState === "synced"
                    ? "bg-emerald-400"
                    : syncState === "syncing"
                    ? "bg-amber-400 animate-pulse"
                    : syncState === "offline"
                    ? "bg-zinc-500"
                    : "bg-amber-400"
                }`}
              />
              <span className="text-[9px] font-mono uppercase text-zinc-400">
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
        </div>
      </div>

      <button
        type="button"
        onClick={switchUser}
        className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 hover:text-zinc-200 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1 transition-colors"
      >
        Switch Profile
      </button>
    </div>
  );
}
