// components/analytics/AnalyticsClient.tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { useUser } from "@/components/auth/UserContext";
import WhoIsTrainingView from "@/components/auth/WhoIsTrainingView";
import UserBar from "@/components/auth/UserBar";
import {
  getAnalyticsExercises,
  getExerciseProgression,
  getWorkoutConsistency,
  getVolumeTrends,
  getAllPRHistory,
  AnalyticsExerciseOption,
  ExerciseProgressionData,
  WorkoutConsistencyData,
  VolumeTrendData,
  OverallPRHistoryEntry,
} from "@/lib/analytics/analytics-service";
import ProgressionChart from "./ProgressionChart";
import ConsistencyChart from "./ConsistencyChart";

type AnalyticsTab = "exercises" | "consistency" | "prs";
type ChartMetric = "e1rm" | "weight" | "volume";

export default function AnalyticsClient() {
  const { activeUserId, isLoading: isAuthLoading } = useUser();
  const searchParams = useSearchParams();
  const initialExerciseId = searchParams.get("exerciseId");

  const [activeTab, setActiveTab] = useState<AnalyticsTab>("exercises");
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(
    initialExerciseId
  );
  const [chartMetric, setChartMetric] = useState<ChartMetric>("e1rm");
  const [prFilterId, setPrFilterId] = useState<string>("all");
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);

  // 1. Live Query: Available exercises
  const exercises = useLiveQuery(
    async () => {
      if (!activeUserId) return [];
      return getAnalyticsExercises(activeUserId);
    },
    [activeUserId],
    []
  );

  // Default selected exercise if not set
  useEffect(() => {
    if (exercises && exercises.length > 0 && !selectedExerciseId) {
      setSelectedExerciseId(exercises[0].id);
    }
  }, [exercises, selectedExerciseId]);

  // Update selected exercise if query param changes
  useEffect(() => {
    if (initialExerciseId) {
      setSelectedExerciseId(initialExerciseId);
      setActiveTab("exercises");
    }
  }, [initialExerciseId]);

  // 2. Live Query: Progression for selected exercise
  const progression = useLiveQuery(
    async () => {
      if (!activeUserId || !selectedExerciseId) return null;
      return getExerciseProgression(activeUserId, selectedExerciseId);
    },
    [activeUserId, selectedExerciseId],
    null
  );

  // 3. Live Query: Workout consistency
  const consistency = useLiveQuery(
    async () => {
      if (!activeUserId) return null;
      return getWorkoutConsistency(activeUserId);
    },
    [activeUserId],
    null
  );

  // 4. Live Query: Volume trends
  const volumeTrends = useLiveQuery(
    async () => {
      if (!activeUserId) return null;
      return getVolumeTrends(activeUserId);
    },
    [activeUserId],
    null
  );

  // 5. Live Query: PR history
  const prHistory = useLiveQuery(
    async () => {
      if (!activeUserId) return [];
      const filter = prFilterId === "all" ? undefined : prFilterId;
      return getAllPRHistory(activeUserId, filter);
    },
    [activeUserId, prFilterId],
    []
  );

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-[#fafaf8] text-zinc-900 flex flex-col items-center justify-center p-4">
        <div className="w-8 h-8 rounded-full border-2 border-zinc-800 border-t-transparent animate-spin mb-4" />
        <p className="text-xs font-mono uppercase tracking-widest text-stone-500">
          Loading Telemetry...
        </p>
      </div>
    );
  }

  if (!activeUserId) {
    return <WhoIsTrainingView />;
  }

  const hasHistory = exercises && exercises.length > 0;

  return (
    <main className="min-h-screen bg-[#fafaf8] text-zinc-900 p-4 font-sans flex flex-col justify-between pb-12 max-w-md mx-auto w-full">
      <div>
        <UserBar />

        {/* Navigation & Header */}
        <header className="pt-2 pb-4">
          <div className="flex items-center justify-between text-xs font-mono mb-2">
            <Link
              href="/"
              className="text-stone-400 hover:text-zinc-900 uppercase font-bold flex items-center gap-1 transition-colors p-1 -m-1"
              title="Return to Dashboard"
            >
              <span>←</span>
              <span>Dashboard</span>
            </Link>
            <Link
              href="/history"
              className="text-stone-400 hover:text-zinc-900 uppercase font-bold flex items-center gap-1 transition-colors p-1 -m-1"
              title="View Completed Workouts"
            >
              <span>History</span>
              <span>→</span>
            </Link>
          </div>

          <div className="flex items-baseline justify-between">
            <h1 className="text-2xl font-black tracking-tight text-zinc-900 uppercase">
              TRAINING ANALYTICS
            </h1>
            <span className="text-[10px] font-mono uppercase tracking-widest text-stone-400">
              Telemetry
            </span>
          </div>
          <p className="text-xs text-stone-500 font-medium tracking-wide mt-0.5">
            Objective Historical Progression
          </p>
        </header>

        {/* Segmented Tab Navigation */}
        <nav className="flex p-1 rounded-xl bg-stone-200/70 border border-stone-200 mb-5 text-xs font-mono font-bold">
          <button
            type="button"
            onClick={() => setActiveTab("exercises")}
            className={`flex-1 py-2 rounded-lg text-center transition-all cursor-pointer ${
              activeTab === "exercises"
                ? "bg-white text-zinc-900 shadow-2xs"
                : "text-stone-500 hover:text-zinc-800"
            }`}
          >
            Exercises
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("consistency")}
            className={`flex-1 py-2 rounded-lg text-center transition-all cursor-pointer ${
              activeTab === "consistency"
                ? "bg-white text-zinc-900 shadow-2xs"
                : "text-stone-500 hover:text-zinc-800"
            }`}
          >
            Consistency
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("prs")}
            className={`flex-1 py-2 rounded-lg text-center transition-all cursor-pointer ${
              activeTab === "prs"
                ? "bg-white text-zinc-900 shadow-2xs"
                : "text-stone-500 hover:text-zinc-800"
            }`}
          >
            PR History
          </button>
        </nav>

        {/* Empty State when no workouts have been completed */}
        {!hasHistory ? (
          <div className="py-12 p-8 rounded-2xl border border-dashed border-stone-300 bg-white/60 text-center flex flex-col items-center justify-center space-y-3 shadow-2xs my-6">
            <div className="w-12 h-12 rounded-2xl bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-400 text-lg">
              📊
            </div>
            <h2 className="text-base font-bold text-zinc-900">
              No Training Telemetry Yet
            </h2>
            <p className="text-xs text-stone-500 leading-relaxed max-w-xs mx-auto">
              Complete your first workout on the gym floor. Sculp’d will
              automatically aggregate your exercise progression, volume trends, and PR records.
            </p>
            <Link
              href="/"
              className="mt-2 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-zinc-900 text-white text-xs font-mono font-bold uppercase tracking-wider hover:bg-zinc-800 active:scale-95 transition-all cursor-pointer"
            >
              Start Workout →
            </Link>
          </div>
        ) : (
          <>
            {/* TAB 1: EXERCISES (Progression View) */}
            {activeTab === "exercises" && (
              <section className="space-y-4">
                {/* Exercise Selector */}
                <div className="bg-white border border-stone-200/80 rounded-2xl p-3.5 shadow-2xs">
                  <label
                    htmlFor="exercise-select"
                    className="block text-[10px] font-mono font-bold uppercase tracking-wider text-stone-400 mb-1.5"
                  >
                    Select Exercise
                  </label>
                  <select
                    id="exercise-select"
                    value={selectedExerciseId || ""}
                    onChange={(e) => setSelectedExerciseId(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-300 text-zinc-900 font-bold text-sm rounded-xl px-3 py-2.5 focus:outline-hidden focus:ring-2 focus:ring-zinc-900 cursor-pointer"
                  >
                    {exercises.map((ex) => (
                      <option key={ex.id} value={ex.id}>
                        {ex.name} ({ex.totalSessions} {ex.totalSessions === 1 ? "workout" : "workouts"})
                      </option>
                    ))}
                  </select>

                  {/* Exercise Tags */}
                  {progression && (
                    <div className="flex items-center gap-2 mt-2.5 text-[11px] font-mono text-stone-500">
                      {progression.category && (
                        <span className="px-2 py-0.5 rounded-md bg-stone-100 border border-stone-200">
                          {progression.category}
                        </span>
                      )}
                      {progression.equipment && (
                        <span className="px-2 py-0.5 rounded-md bg-stone-100 border border-stone-200">
                          {progression.equipment}
                        </span>
                      )}
                      {progression.isBodyweight && (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                          Bodyweight + Load
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {progression && (
                  <>
                    {/* Key Metrics Grid */}
                    <div className="grid grid-cols-2 gap-2.5">
                      {/* Best Weight */}
                      <div className="bg-white border border-stone-200/80 rounded-2xl p-3 shadow-2xs flex flex-col justify-between">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-stone-400">
                          Best Weight
                        </span>
                        <div className="my-1">
                          <span className="text-xl font-black font-mono text-zinc-900">
                            {progression.allTimeBestWeight?.displayText || "—"}
                          </span>
                          {progression.isBodyweight &&
                            progression.allTimeBestWeight && (
                              <span className="block text-[10px] font-mono text-stone-400">
                                {progression.allTimeBestWeight.effectiveWeight} lb total
                              </span>
                            )}
                        </div>
                        <span className="text-[10px] font-mono text-stone-400 truncate">
                          {progression.allTimeBestWeight?.date || "No sets"}
                        </span>
                      </div>

                      {/* Estimated 1RM */}
                      <div className="bg-white border border-stone-200/80 rounded-2xl p-3 shadow-2xs flex flex-col justify-between">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-stone-400">
                          Estimated 1RM
                        </span>
                        <div className="my-1">
                          <span className="text-xl font-black font-mono text-zinc-900">
                            {progression.allTimeBestE1RM?.formatted || "—"}
                          </span>
                          {progression.recentE1RM && (
                            <span className="block text-[10px] font-mono text-stone-400">
                              Recent: {progression.recentE1RM.formatted}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-stone-400 truncate">
                          {progression.allTimeBestE1RM?.date || "No sets"}
                        </span>
                      </div>

                      {/* Best Rep Performance */}
                      <div className="bg-white border border-stone-200/80 rounded-2xl p-3 shadow-2xs flex flex-col justify-between">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-stone-400">
                          Best Rep Set
                        </span>
                        <div className="my-1">
                          <span className="text-sm font-bold font-mono text-zinc-900 truncate block">
                            {progression.allTimeBestReps?.displayText || "—"}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-stone-400 truncate">
                          {progression.allTimeBestReps?.date || "No sets"}
                        </span>
                      </div>

                      {/* Total Volume */}
                      <div className="bg-white border border-stone-200/80 rounded-2xl p-3 shadow-2xs flex flex-col justify-between">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-stone-400">
                          Total Volume
                        </span>
                        <div className="my-1">
                          <span className="text-base font-black font-mono text-zinc-900">
                            {progression.formattedTotalVolume}
                          </span>
                          <span className="block text-[10px] font-mono text-stone-400">
                            Recent: {progression.formattedRecentVolume}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-stone-400">
                          Across {progression.totalWorkouts}{" "}
                          {progression.totalWorkouts === 1 ? "workout" : "workouts"}
                        </span>
                      </div>
                    </div>

                    {/* Progression Chart with Metric Selector */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5 px-1">
                        <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-stone-500">
                          Trajectory Curve
                        </span>
                        <div className="inline-flex rounded-lg bg-stone-200/70 p-0.5 text-[10px] font-mono font-bold">
                          <button
                            type="button"
                            onClick={() => setChartMetric("e1rm")}
                            className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                              chartMetric === "e1rm"
                                ? "bg-white text-zinc-900 shadow-2xs"
                                : "text-stone-500"
                            }`}
                          >
                            1RM
                          </button>
                          <button
                            type="button"
                            onClick={() => setChartMetric("weight")}
                            className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                              chartMetric === "weight"
                                ? "bg-white text-zinc-900 shadow-2xs"
                                : "text-stone-500"
                            }`}
                          >
                            Load
                          </button>
                          <button
                            type="button"
                            onClick={() => setChartMetric("volume")}
                            className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                              chartMetric === "volume"
                                ? "bg-white text-zinc-900 shadow-2xs"
                                : "text-stone-500"
                            }`}
                          >
                            Volume
                          </button>
                        </div>
                      </div>
                      <ProgressionChart
                        history={progression.history}
                        metric={chartMetric}
                        isBodyweight={progression.isBodyweight}
                      />
                    </div>

                    {/* Recent Performance Log */}
                    <div className="bg-white border border-stone-200/80 rounded-2xl p-4 shadow-2xs">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-zinc-900">
                            {progression.exerciseName}
                          </h2>
                          <span className="text-[10px] font-mono uppercase text-stone-400 tracking-wider">
                            Recent Workouts
                          </span>
                        </div>
                        <span className="text-xs font-mono text-stone-400">
                          {progression.totalWorkouts}{" "}
                          {progression.totalWorkouts === 1 ? "session" : "sessions"}
                        </span>
                      </div>

                      <div className="divide-y divide-stone-100 font-mono text-xs">
                        {progression.recentHistory.map((hp) => {
                          const isExpanded = expandedSessionId === hp.sessionId;
                          return (
                            <div key={hp.sessionId} className="py-2.5">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedSessionId(
                                    isExpanded ? null : hp.sessionId
                                  )
                                }
                                className="w-full flex items-center justify-between hover:bg-stone-50/80 p-1 -m-1 rounded-lg transition-colors text-left cursor-pointer"
                              >
                                <span className="text-stone-500 font-medium">
                                  {hp.date}
                                </span>
                                <div className="flex items-center gap-3">
                                  <span className="font-bold text-zinc-900 text-sm">
                                    {hp.topSetSummary}
                                  </span>
                                  <span className="text-[10px] text-stone-400">
                                    {isExpanded ? "▲" : "▼"}
                                  </span>
                                </div>
                              </button>

                              {/* Expanded sets breakdown */}
                              {isExpanded && (
                                <div className="mt-2.5 pt-2 border-t border-dashed border-stone-200 pl-2 space-y-1 bg-stone-50/70 p-2 rounded-xl">
                                  <div className="text-[10px] text-stone-400 uppercase tracking-wider mb-1 flex items-center justify-between">
                                    <span>{hp.routineName}</span>
                                    <span>
                                      Vol: {hp.volume.toLocaleString()} lb • Est 1RM: {hp.estimated1RM} lb
                                    </span>
                                  </div>
                                  {hp.sets.map((s) => (
                                    <div
                                      key={s.id}
                                      className="flex items-center justify-between text-[11px] text-stone-700"
                                    >
                                      <span className="text-stone-400">
                                        Set {s.setNumber}:
                                      </span>
                                      <span className="font-bold">
                                        {progression.isBodyweight
                                          ? typeof s.addedWeight === "number" && s.addedWeight > 0
                                            ? `BW + ${s.addedWeight} lb × ${s.reps}`
                                            : `BW × ${s.reps}`
                                          : `${s.weight} lb × ${s.reps}`}
                                      </span>
                                    </div>
                                  ))}
                                  <div className="pt-1 text-right">
                                    <Link
                                      href={`/history/${hp.sessionId}`}
                                      className="text-[10px] font-bold text-zinc-900 hover:underline inline-flex items-center gap-0.5"
                                    >
                                      View Full Workout →
                                    </Link>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* PRs achieved for this exercise */}
                    {progression.prs.length > 0 && (
                      <div className="bg-white border border-stone-200/80 rounded-2xl p-4 shadow-2xs">
                        <h2 className="text-[10px] font-mono font-bold uppercase tracking-wider text-stone-400 mb-2.5">
                          Milestones & PR History
                        </h2>
                        <div className="space-y-2">
                          {progression.prs.map((pr) => (
                            <div
                              key={pr.id}
                              className="flex items-center justify-between p-2.5 rounded-xl bg-stone-50 border border-stone-200/60 font-mono text-xs"
                            >
                              <div>
                                <span className="text-[10px] text-stone-400 block">
                                  {pr.date}
                                </span>
                                <span className="font-bold text-zinc-900 text-sm">
                                  {pr.setSummary}
                                </span>
                                {pr.previousSummary && (
                                  <span className="text-[10px] text-stone-500 block">
                                    Prev: {pr.previousSummary}
                                  </span>
                                )}
                              </div>
                              <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-900 font-bold text-[10px]">
                                {pr.badgeText}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </section>
            )}

            {/* TAB 2: CONSISTENCY (Workout Frequency & Volume Trends) */}
            {activeTab === "consistency" && consistency && volumeTrends && (
              <section className="space-y-4">
                {/* Cadence Metrics Grid */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="bg-white border border-stone-200/80 rounded-2xl p-3.5 shadow-2xs">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-stone-400 block mb-1">
                      This Week
                    </span>
                    <span className="text-2xl font-black font-mono text-zinc-900">
                      {consistency.workoutsThisWeek}
                    </span>
                    <span className="text-[11px] font-mono text-stone-500 block mt-0.5">
                      {consistency.workoutsThisWeek === 1 ? "workout" : "workouts"} completed
                    </span>
                  </div>

                  <div className="bg-white border border-stone-200/80 rounded-2xl p-3.5 shadow-2xs">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-stone-400 block mb-1">
                      This Month
                    </span>
                    <span className="text-2xl font-black font-mono text-zinc-900">
                      {consistency.workoutsThisMonth}
                    </span>
                    <span className="text-[11px] font-mono text-stone-500 block mt-0.5">
                      {consistency.workoutsLast30Days} in last 30 days
                    </span>
                  </div>

                  <div className="bg-white border border-stone-200/80 rounded-2xl p-3.5 shadow-2xs">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-stone-400 block mb-1">
                      Weekly Average
                    </span>
                    <span className="text-2xl font-black font-mono text-zinc-900">
                      {consistency.averageWorkoutsPerWeek}
                    </span>
                    <span className="text-[11px] font-mono text-stone-500 block mt-0.5">
                      workouts / week
                    </span>
                  </div>

                  <div className="bg-white border border-stone-200/80 rounded-2xl p-3.5 shadow-2xs">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-stone-400 block mb-1">
                      Last Session
                    </span>
                    <span className="text-lg font-black font-mono text-zinc-900 truncate block">
                      {consistency.daysSinceLastWorkout === 0
                        ? "Today"
                        : consistency.daysSinceLastWorkout === 1
                        ? "Yesterday"
                        : consistency.daysSinceLastWorkout !== null
                        ? `${consistency.daysSinceLastWorkout}d ago`
                        : "—"}
                    </span>
                    <span className="text-[10px] font-mono text-stone-400 block truncate mt-0.5">
                      {consistency.formattedLastWorkoutDate || "None"}
                    </span>
                  </div>
                </div>

                {/* Weekly Workout Frequency Chart */}
                <ConsistencyChart
                  frequencyData={consistency.weeklyFrequency}
                  volumeData={volumeTrends.weeklyVolumePoints}
                  mode="frequency"
                />

                {/* Overall Volume Telemetry */}
                <div className="bg-white border border-stone-200/80 rounded-2xl p-4 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-stone-400 block">
                        Training Volume
                      </span>
                      <h2 className="text-xl font-black font-mono text-zinc-900">
                        {volumeTrends.formattedTotalVolume}
                      </h2>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-mono uppercase text-stone-400 block">
                        Average / Session
                      </span>
                      <span className="text-sm font-bold font-mono text-zinc-800">
                        {volumeTrends.formattedAvgVolume}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-stone-100">
                    <ConsistencyChart
                      frequencyData={consistency.weeklyFrequency}
                      volumeData={volumeTrends.weeklyVolumePoints}
                      mode="volume"
                    />
                  </div>
                </div>

                {/* Factual Disclaimer */}
                <div className="text-[11px] font-mono text-stone-400 text-center px-4 leading-relaxed">
                  Sculp’d measures exact load and session timestamps directly from local storage.
                  No artificial streak penalties or coach assumptions.
                </div>
              </section>
            )}

            {/* TAB 3: PR HISTORY */}
            {activeTab === "prs" && (
              <section className="space-y-4">
                {/* Filter Selector */}
                <div className="bg-white border border-stone-200/80 rounded-2xl p-3 shadow-2xs flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-stone-400">
                    Filter by Exercise
                  </span>
                  <select
                    value={prFilterId}
                    onChange={(e) => setPrFilterId(e.target.value)}
                    className="bg-stone-50 border border-stone-300 text-xs font-mono font-bold rounded-lg px-2.5 py-1.5 focus:outline-hidden cursor-pointer"
                  >
                    <option value="all">All Movements ({prHistory.length})</option>
                    {exercises.map((ex) => (
                      <option key={ex.id} value={ex.id}>
                        {ex.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* PR Chronological Feed */}
                {prHistory.length === 0 ? (
                  <div className="p-8 rounded-2xl border border-dashed border-stone-300 bg-white/60 text-center font-mono text-xs text-stone-500">
                    No personal records logged yet for this selection.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-stone-400 px-1">
                      PR HISTORY ({prHistory.length})
                    </div>
                    {prHistory.map((pr) => (
                      <div
                        key={pr.id}
                        className="bg-white border border-stone-200/80 rounded-2xl p-4 shadow-2xs font-mono flex items-start justify-between"
                      >
                        <div className="space-y-1">
                          <span className="text-xs text-stone-400 font-medium block">
                            {pr.date}
                          </span>
                          <h3 className="text-base font-black text-zinc-900 tracking-tight">
                            {pr.exerciseName}
                          </h3>
                          <div className="text-sm font-bold text-zinc-800">
                            {pr.setSummary}
                          </div>
                          {pr.isBodyweight && (
                            <span className="text-[10px] text-stone-400 block">
                              {pr.effectiveLoad} lb effective load
                            </span>
                          )}
                          {pr.previousSummary && (
                            <span className="text-[11px] text-stone-500 block">
                              Prior: {pr.previousSummary}
                            </span>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="inline-block px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 font-black text-xs shadow-2xs">
                            {pr.badgeText}
                          </span>
                          <div className="mt-3">
                            <Link
                              href={`/history/${pr.sessionId}`}
                              className="text-[10px] font-bold text-stone-400 hover:text-zinc-900 transition-colors"
                            >
                              Workout →
                            </Link>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>

      {/* Footer Branding */}
      <footer className="mt-8 text-center">
        <p className="text-[10px] font-mono uppercase tracking-widest text-stone-400">
          Sculp’d • Objective Telemetry Architecture
        </p>
      </footer>
    </main>
  );
}
