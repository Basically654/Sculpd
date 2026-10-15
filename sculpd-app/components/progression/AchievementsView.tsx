// components/progression/AchievementsView.tsx
"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import {
  getLifetimeProgressionSummary,
  LifetimeProgressionSummary,
  AchievementCategory,
  UserAchievement,
  RANKS,
} from "@/lib/progression/progression-service";
import {
  getMonthlyAccountabilitySummary,
  MonthlyAccountabilitySummary,
} from "@/lib/accountability/accountability-service";
import LogAlternativeModal from "@/components/calendar/LogAlternativeModal";
import { getLocalDateKey } from "@/lib/calendar/calendar-service";

interface AchievementsViewProps {
  userId: string;
}

export default function AchievementsView({ userId }: AchievementsViewProps) {
  const [selectedCategory, setSelectedCategory] = useState<AchievementCategory | "all">("all");
  const [showRanksGuide, setShowRanksGuide] = useState<boolean>(false);
  const [isLogAltModalOpen, setIsLogAltModalOpen] = useState<boolean>(false);

  // Live query for progression summary
  const progression = useLiveQuery<LifetimeProgressionSummary | null>(
    async () => {
      if (!userId) return null;
      return getLifetimeProgressionSummary(userId);
    },
    [userId]
  );

  // Live query for monthly accountability summary
  const accountability = useLiveQuery<MonthlyAccountabilitySummary | null>(
    async () => {
      if (!userId) return null;
      return getMonthlyAccountabilitySummary(userId);
    },
    [userId]
  );

  const todayKey = getLocalDateKey(new Date());

  if (!progression || !accountability) {
    return (
      <div className="py-16 text-center space-y-3">
        <div className="w-8 h-8 rounded-full border-2 border-zinc-800 border-t-transparent animate-spin mx-auto" />
        <p className="text-xs font-mono uppercase tracking-widest text-stone-500">
          Calculating progression metrics...
        </p>
      </div>
    );
  }

  const { rank } = progression;
  const filteredAchievements =
    selectedCategory === "all"
      ? progression.achievements
      : progression.achievements.filter((a) => a.category === selectedCategory);

  return (
    <div className="w-full max-w-full space-y-4 font-sans overflow-hidden">
      {/* 1. CURRENT RANK CARD */}
      <section className="p-4 rounded-3xl bg-white border border-stone-200 shadow-2xs space-y-4">
        <div className="flex items-start justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-amber-50 border border-amber-200/80 flex items-center justify-center text-2xl sm:text-3xl shadow-inner shrink-0">
              {rank.currentRank.badge}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 border border-stone-200 shrink-0">
                  Rank Level {rank.currentRank.level} of 6
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black tracking-tight text-zinc-950 mt-0.5 truncate">
                {rank.currentRank.title}
              </h2>
              <p className="text-xs text-stone-500 font-medium line-clamp-2">
                {rank.currentRank.description}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowRanksGuide(true)}
            className="text-[11px] font-mono font-bold text-stone-500 hover:text-zinc-900 bg-stone-50 hover:bg-stone-100 border border-stone-200 px-2 sm:px-2.5 py-1 rounded-xl transition-colors cursor-pointer shrink-0"
            title="View all rank tiers and progression requirements"
          >
            Tier Guide
          </button>
        </div>

        {/* Next Rank Progress Bar */}
        {rank.nextRank ? (
          <div className="space-y-2 pt-2 border-t border-stone-100">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono text-stone-500 font-medium">
                Progress to <strong className="text-zinc-900">{rank.nextRank.title}</strong>
              </span>
              <span className="font-mono font-bold text-zinc-900">
                {rank.progressPercent}%
              </span>
            </div>

            <div className="w-full h-2 rounded-full bg-stone-100 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-400 to-amber-600 rounded-full transition-all duration-500"
                style={{ width: `${rank.progressPercent}%` }}
              />
            </div>

            {/* Remaining Requirements Pills */}
            {rank.requirementsNeeded && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[10px] font-mono font-medium text-stone-400">
                  Needed:
                </span>
                {rank.requirementsNeeded.workoutsRemaining > 0 && (
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 border border-stone-200">
                    {rank.requirementsNeeded.workoutsRemaining} workout{rank.requirementsNeeded.workoutsRemaining === 1 ? "" : "s"}
                  </span>
                )}
                {rank.requirementsNeeded.prsRemaining > 0 && (
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 border border-stone-200">
                    {rank.requirementsNeeded.prsRemaining} verified PR{rank.requirementsNeeded.prsRemaining === 1 ? "" : "s"}
                  </span>
                )}
                {rank.requirementsNeeded.volumeRemaining > 0 && (
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 border border-stone-200">
                    {Math.round(rank.requirementsNeeded.volumeRemaining).toLocaleString()} lb volume
                  </span>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="pt-2 border-t border-stone-100 flex items-center gap-2 text-xs font-mono font-bold text-amber-700">
            <span>⚡</span>
            <span>Master tier attained. You have reached the pinnacle of iron training!</span>
          </div>
        )}
      </section>

      {/* 2. MONTHLY ACCOUNTABILITY & SKIPS */}
      <section className="p-4 rounded-3xl bg-white border border-stone-200 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">🛡️</span>
            <div>
              <h3 className="text-sm font-black uppercase tracking-tight text-zinc-950">
                Monthly Accountability
              </h3>
              <p className="text-[11px] font-mono text-stone-500">
                {accountability.formattedMonth} Allowance
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsLogAltModalOpen(true)}
            className="text-xs font-mono font-bold text-sky-800 hover:text-sky-950 bg-sky-50 hover:bg-sky-100 border border-sky-200 px-2.5 py-1 rounded-xl transition-colors cursor-pointer"
            title="Log walking, cardio, or mobility to earn an extra skip"
          >
            + Log Activity
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 pt-1">
          <div className="p-2.5 rounded-2xl bg-stone-50 border border-stone-200/80 text-center">
            <span className="block text-[10px] font-mono uppercase tracking-wider text-stone-400 font-bold">
              Free Skips
            </span>
            <span className="text-base font-mono font-black text-zinc-900">
              {accountability.freeSkipsRemaining}{" "}
              <span className="text-xs font-normal text-stone-400">/ 3</span>
            </span>
          </div>

          <div className="p-2.5 rounded-2xl bg-sky-50/60 border border-sky-200/80 text-center">
            <span className="block text-[10px] font-mono uppercase tracking-wider text-sky-800 font-bold">
              Earned Skips
            </span>
            <span className="text-base font-mono font-black text-sky-950">
              {accountability.earnedSkipsAvailable}
            </span>
          </div>

          <div className="p-2.5 rounded-2xl bg-stone-50 border border-stone-200/80 text-center">
            <span className="block text-[10px] font-mono uppercase tracking-wider text-stone-400 font-bold">
              Available
            </span>
            <span className="text-base font-mono font-black text-zinc-900">
              {accountability.totalSkipsAvailable}
            </span>
          </div>
        </div>

        <p className="text-[11px] text-stone-500 leading-relaxed pt-1">
          Skips protect consistency when life happens. 3 free skips reset every month. Earn
          permanent bonus skips with ≥20 min of walking, light cardio, mobility, or recovery.
        </p>
      </section>

      {/* 3. LIFETIME TRAINING METRICS */}
      <section className="grid grid-cols-2 gap-2">
        <div className="p-3.5 rounded-2xl bg-white border border-stone-200 shadow-2xs space-y-1">
          <span className="block text-[10px] font-mono uppercase tracking-wider text-stone-400 font-bold">
            Completed Workouts
          </span>
          <span className="text-xl font-mono font-black text-zinc-900 block">
            {progression.totalCompletedWorkouts}
          </span>
          <span className="text-[11px] text-stone-500 font-medium">
            {progression.distinctExercisesCount} distinct exercises
          </span>
        </div>

        <div className="p-3.5 rounded-2xl bg-white border border-stone-200 shadow-2xs space-y-1">
          <span className="block text-[10px] font-mono uppercase tracking-wider text-stone-400 font-bold">
            Verified PRs
          </span>
          <span className="text-xl font-mono font-black text-amber-600 block">
            {progression.verifiedPRCount}
          </span>
          <span className="text-[11px] text-stone-500 font-medium">
            Genuine records broken
          </span>
        </div>

        <div className="p-3.5 rounded-2xl bg-white border border-stone-200 shadow-2xs space-y-1">
          <span className="block text-[10px] font-mono uppercase tracking-wider text-stone-400 font-bold">
            Cumulative Volume
          </span>
          <span className="text-xl font-mono font-black text-zinc-900 block">
            {progression.formattedTotalVolume}
          </span>
          <span className="text-[11px] text-stone-500 font-medium">
            Total tonnage moved
          </span>
        </div>

        <div className="p-3.5 rounded-2xl bg-white border border-stone-200 shadow-2xs space-y-1">
          <span className="block text-[10px] font-mono uppercase tracking-wider text-stone-400 font-bold">
            Consistency Streak
          </span>
          <span className="text-xl font-mono font-black text-zinc-900 block">
            {progression.consecutiveWeeks}{" "}
            <span className="text-xs font-normal text-stone-400">
              wk{progression.consecutiveWeeks === 1 ? "" : "s"}
            </span>
          </span>
          <span className="text-[11px] text-stone-500 font-medium">
            Consecutive active weeks
          </span>
        </div>
      </section>

      {/* 4. ACHIEVEMENTS SECTION */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black uppercase tracking-tight text-zinc-950">
              Achievements
            </h3>
            <p className="text-[11px] font-mono text-stone-500">
              {progression.unlockedAchievementsCount} of {progression.totalAchievementsCount} unlocked
            </p>
          </div>
        </div>

        {/* Category Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar overscroll-x-contain touch-pan-x max-w-full">
          {(
            [
              { id: "all", label: "All" },
              { id: "consistency", label: "Consistency" },
              { id: "pr", label: "PRs" },
              { id: "milestone", label: "Milestones" },
              { id: "volume", label: "Volume" },
            ] as const
          ).map((cat) => {
            const count =
              cat.id === "all"
                ? progression.achievements.filter((a) => a.isUnlocked).length
                : progression.achievements.filter((a) => a.category === cat.id && a.isUnlocked).length;
            const total =
              cat.id === "all"
                ? progression.achievements.length
                : progression.achievements.filter((a) => a.category === cat.id).length;
            const isActive = selectedCategory === cat.id;

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold tracking-wider uppercase whitespace-nowrap transition-colors cursor-pointer border ${
                  isActive
                    ? "bg-zinc-900 text-white border-zinc-900 shadow-xs"
                    : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50"
                }`}
              >
                {cat.label} ({count}/{total})
              </button>
            );
          })}
        </div>

        {/* Achievements List */}
        <div className="grid grid-cols-1 gap-2.5">
          {filteredAchievements.map((achievement: UserAchievement) => (
            <div
              key={achievement.id}
              className={`p-3.5 rounded-2xl border transition-all ${
                achievement.isUnlocked
                  ? "bg-white border-stone-200 shadow-2xs"
                  : "bg-stone-50/70 border-stone-200/60 opacity-80"
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center text-2xl shrink-0 ${
                    achievement.isUnlocked
                      ? "bg-amber-50 border border-amber-200/80 text-amber-900"
                      : "bg-stone-100 border border-stone-200 text-stone-400 grayscale"
                  }`}
                >
                  {achievement.icon}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-bold text-zinc-900 truncate">
                      {achievement.title}
                    </h4>

                    {achievement.isUnlocked ? (
                      <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 shrink-0">
                        Unlocked
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-stone-500 shrink-0">
                        {achievement.progressPercent}%
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-stone-600 mt-0.5">
                    {achievement.description}
                  </p>

                  {/* Progress or Unlock Date */}
                  {achievement.isUnlocked ? (
                    achievement.unlockedAt && (
                      <p className="text-[10px] font-mono text-stone-400 mt-1.5">
                        Achieved on{" "}
                        {new Date(achievement.unlockedAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                    )
                  ) : (
                    <div className="space-y-1 mt-2">
                      <div className="w-full h-1.5 rounded-full bg-stone-200 overflow-hidden">
                        <div
                          className="h-full bg-zinc-700 rounded-full"
                          style={{ width: `${achievement.progressPercent}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] font-mono text-stone-400">
                        <span>
                          {achievement.unit === "lb"
                            ? `${Math.round(achievement.currentValue).toLocaleString()} lb`
                            : `${achievement.currentValue}`}
                        </span>
                        <span>
                          {achievement.unit === "lb"
                            ? `${Math.round(achievement.targetValue).toLocaleString()} lb`
                            : `${achievement.targetValue}`}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Ranks Guide Modal */}
      {showRanksGuide && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 space-y-4 border border-stone-200 shadow-xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black tracking-tight text-zinc-900 uppercase">
                Rank Progression Guide
              </h3>
              <button
                type="button"
                onClick={() => setShowRanksGuide(false)}
                className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-500 font-bold flex items-center justify-center cursor-pointer transition-colors"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-stone-500 leading-relaxed">
              Ranks represent sustained dedication and verified accomplishments in the gym.
              All thresholds must be met to advance to the next tier.
            </p>

            <div className="space-y-2.5">
              {RANKS.map((r) => {
                const isCurrent = rank.currentRank.level === r.level;
                const isAchieved = rank.currentRank.level >= r.level;

                return (
                  <div
                    key={r.level}
                    className={`p-3 rounded-2xl border transition-all ${
                      isCurrent
                        ? "bg-amber-50/70 border-amber-300 ring-1 ring-amber-300"
                        : isAchieved
                        ? "bg-stone-50 border-stone-200"
                        : "bg-stone-50/50 border-stone-200/60 opacity-60"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{r.badge}</span>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h4 className="text-xs font-bold text-zinc-900">
                              {r.title}
                            </h4>
                            {isCurrent && (
                              <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.2 rounded bg-amber-200 text-amber-900">
                                Current
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-stone-500">
                            {r.description}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2 mt-2 border-t border-stone-200/60 text-[10px] font-mono text-stone-600">
                      <span>{r.minWorkouts} workouts</span>
                      <span>•</span>
                      <span>{r.minPRs} PRs</span>
                      <span>•</span>
                      <span>{r.minVolume.toLocaleString()} lb</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setShowRanksGuide(false)}
              className="w-full py-2.5 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white font-mono font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Log Alternative Modal */}
      {isLogAltModalOpen && (
        <LogAlternativeModal
          isOpen={isLogAltModalOpen}
          userId={userId}
          initialDateKey={todayKey}
          onClose={() => setIsLogAltModalOpen(false)}
          onSuccess={() => setIsLogAltModalOpen(false)}
        />
      )}
    </div>
  );
}
