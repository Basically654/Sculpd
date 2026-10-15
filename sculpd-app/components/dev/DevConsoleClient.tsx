// components/dev/DevConsoleClient.tsx
"use client";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { useDev } from "./DevContext";
import { useTimer } from "@/components/timer/TimerContext";
import { useUser } from "@/components/auth/UserContext";
import {
  getRecentTelemetry,
  clearTelemetryBuffer,
  exportTelemetryJson,
  DiagnosticTelemetryEvent,
  TelemetryCategory,
  logNotificationTelemetry,
} from "@/lib/telemetry/telemetry-service";
import {
  countSyntheticRecords,
  cleanupSyntheticData,
  generateScenario,
  AVAILABLE_SCENARIOS,
  SyntheticCounts,
  SyntheticScenarioKey,
} from "@/lib/dev/synthetic-data-service";
import {
  getInitialTestGroups,
  runTestCase,
  runTestGroup,
  calculateSuiteSummary,
  TestGroup,
  TestCase,
} from "@/lib/dev/feature-test-runner";

type DevTab = "telemetry" | "notifications" | "tests" | "synthetic";

export default function DevConsoleClient() {
  const {
    isDevModeActive,
    devToken,
    devUser,
    loginDev,
    logoutDev,
    stats,
    refreshStats,
  } = useDev();

  const {
    isActive: isTimerRunning,
    remaining: remainingSeconds,
    exerciseName: timerExerciseName,
    start: startTimer,
    stop: cancelTimer,
    accelerateTimer,
    completeTimerNow,
  } = useTimer();

  const { activeUser } = useUser();

  // Navigation tab state
  const [activeTab, setActiveTab] = useState<DevTab>("telemetry");

  // Dev Login form state
  const [username, setUsername] = useState("dev");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Telemetry state
  const [telemetryEvents, setTelemetryEvents] = useState<DiagnosticTelemetryEvent[]>([]);
  const [telemetryFilter, setTelemetryFilter] = useState<TelemetryCategory | "all">("all");
  const [telemetrySearch, setTelemetrySearch] = useState("");
  const [telemetryScrollMode, setTelemetryScrollMode] = useState<"box" | "expanded">("box");

  // Test Runner state
  const [testGroups, setTestGroups] = useState<TestGroup[]>(getInitialTestGroups());
  const [isRunningAllTests, setIsRunningAllTests] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<number, boolean>>({
    1: true,
    2: true,
  });

  // Synthetic Data state
  const [syntheticCounts, setSyntheticCounts] = useState<SyntheticCounts | null>(null);
  const [syntheticMessage, setSyntheticMessage] = useState<string | null>(null);
  const [isGeneratingScenario, setIsGeneratingScenario] = useState(false);
  const [isCleaningSynthetic, setIsCleaningSynthetic] = useState(false);

  // Push Pipeline Test state
  const [pushPipelineResult, setPushPipelineResult] = useState<any>(null);
  const [isTestingPush, setIsTestingPush] = useState(false);

  // Local notification simulation state
  const [localNotificationMessage, setLocalNotificationMessage] = useState<string | null>(null);

  // Derived system stats
  const recordCounts = stats?.recordCounts || {
    users: 0,
    routines: 0,
    exercises: 0,
    routineExercises: 0,
    workoutSessions: 0,
    sets: 0,
    syncQueue: 0,
    syncMeta: 0,
  };

  const syncStatus = {
    isSyncing: false,
    queueCount: stats?.syncQueue?.total || 0,
    pending: stats?.syncQueue?.pending || 0,
    failed: stats?.syncQueue?.failed || 0,
    lastError: (stats?.syncQueue?.failed || 0) > 0 ? `${stats?.syncQueue?.failed} failed mutations` : null,
  };

  const notificationStatus = {
    permission: stats?.notifications?.permission || "unsupported",
    hasSubscription: stats?.notifications?.hasActiveSubscription || false,
  };

  const serviceWorkerStatus = {
    registered: stats?.notifications?.swRegistered || false,
    scope: stats?.notifications?.swRegistered ? "/" : "None",
  };

  const refreshDevDiagnostics = () => {
    refreshStats();
  };

  const triggerPushPipelineTest = async () => {
    setIsTestingPush(true);
    setPushPipelineResult(null);
    try {
      const res = await fetch("/api/dev/test-push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${devToken}`,
        },
      });
      const data = await res.json();
      setPushPipelineResult(data);
    } catch (err: any) {
      setPushPipelineResult({
        overallSuccess: false,
        error: err?.message || "Failed to trigger push test",
        stages: [
          {
            stage: 1,
            name: "Client Request",
            status: "failed",
            error: err?.message,
          },
        ],
      });
    } finally {
      setIsTestingPush(false);
    }
  };

  // Load telemetry & synthetic counts on interval/mount
  useEffect(() => {
    if (!isDevModeActive) return;

    const loadData = async () => {
      setTelemetryEvents(getRecentTelemetry());
      const counts = await countSyntheticRecords();
      setSyntheticCounts(counts);
    };

    loadData();
    const interval = setInterval(loadData, 2000);
    return () => clearInterval(interval);
  }, [isDevModeActive]);

  // Handle Dev Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError(null);

    const res = await loginDev(username, password);
    setIsLoggingIn(false);

    if (!res.success) {
      setLoginError(res.error || "Invalid developer credentials or Developer Mode is disabled on this server.");
    }
  };

  // Handle Local SW Notification Simulation
  const handleSimulateNotification = async () => {
    setLocalNotificationMessage(null);
    try {
      if (!("Notification" in window)) {
        setLocalNotificationMessage("Notifications are not supported in this browser.");
        return;
      }

      if (Notification.permission !== "granted") {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          setLocalNotificationMessage(`Notification permission denied (${perm}).`);
          return;
        }
      }

      if (!("serviceWorker" in navigator)) {
        setLocalNotificationMessage("Service Workers not supported.");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification("🛠️ Sculp'd Dev Mode Rest Alert", {
        body: "Rest period complete! Next exercise: Barbell Bench Press (Simulated Local Notification)",
        icon: "/icons/icon-192x192.png",
        badge: "/icons/badge-72x72.png",
        vibrate: [200, 100, 200],
        tag: "dev-simulated-rest-notification",
      } as any);

      logNotificationTelemetry("simulated", {
        action: "dev_local_simulation",
        granted: true,
        swReady: true,
      });

      setLocalNotificationMessage("Local Service Worker notification dispatched successfully!");
    } catch (err: any) {
      setLocalNotificationMessage(`Simulation failed: ${err?.message || err}`);
      logNotificationTelemetry("simulated", {
        action: "dev_local_simulation_error",
        error: err?.message,
      });
    }
  };

  // Run a single test case
  const handleRunTestCase = async (testId: string, groupId: number) => {
    setTestGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? {
              ...g,
              tests: g.tests.map((t) => (t.id === testId ? { ...t, status: "running" } : t)),
            }
          : g
      )
    );

    const result = await runTestCase(testId);

    setTestGroups((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g;
        const newTests = g.tests.map((t) => (t.id === testId ? result : t));
        const allPassed = newTests.every((t) => t.status === "passed" || t.status === "not_implemented");
        const anyFailed = newTests.some((t) => t.status === "failed");
        return {
          ...g,
          status: anyFailed ? "failed" : allPassed ? "passed" : "partial",
          tests: newTests,
        };
      })
    );
  };

  // Run a whole test group
  const handleRunTestGroup = async (group: TestGroup) => {
    setTestGroups((prev) =>
      prev.map((g) =>
        g.id === group.id
          ? {
              ...g,
              status: "running",
              tests: g.tests.map((t) =>
                t.status === "not_implemented" ? t : { ...t, status: "running" }
              ),
            }
          : g
      )
    );

    const updatedGroup = await runTestGroup(group);

    setTestGroups((prev) =>
      prev.map((g) => (g.id === group.id ? updatedGroup : g))
    );
  };

  // Run all 14 test groups
  const handleRunAllTests = async () => {
    setIsRunningAllTests(true);

    for (const group of testGroups) {
      if (group.status === "not_implemented") continue;
      await handleRunTestGroup(group);
    }

    setIsRunningAllTests(false);
  };

  // Reset test suite
  const handleResetTests = () => {
    setTestGroups(getInitialTestGroups());
  };

  // Toggle group expansion
  const toggleGroupExpand = (groupId: number) => {
    setExpandedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  // Synthetic scenario generation
  const handleGenerateScenario = async (scenarioKey: SyntheticScenarioKey) => {
    setIsGeneratingScenario(true);
    setSyntheticMessage(null);
    try {
      const res = await generateScenario(scenarioKey);
      setSyntheticCounts(res.counts);
      setSyntheticMessage(`✅ Success: ${res.summary}`);
      refreshDevDiagnostics();
    } catch (err: any) {
      setSyntheticMessage(`❌ Error: ${err?.message || err}`);
    } finally {
      setIsGeneratingScenario(false);
    }
  };

  // Synthetic cleanup
  const handleCleanupSynthetic = async () => {
    setIsCleaningSynthetic(true);
    setSyntheticMessage(null);
    try {
      const res = await cleanupSyntheticData();
      setSyntheticCounts(await countSyntheticRecords());
      setSyntheticMessage(
        `🧹 Cleaned up ${res.deleted.total} synthetic records across Dexie stores. Real athlete data is strictly intact.`
      );
      refreshDevDiagnostics();
    } catch (err: any) {
      setSyntheticMessage(`❌ Error during cleanup: ${err?.message || err}`);
    } finally {
      setIsCleaningSynthetic(false);
    }
  };

  // Filtered telemetry events
  const filteredTelemetry = telemetryEvents
    .filter((e) => telemetryFilter === "all" || e.category === telemetryFilter)
    .filter((e) => {
      if (!telemetrySearch.trim()) return true;
      const q = telemetrySearch.toLowerCase();
      return (
        e.eventType.toLowerCase().includes(q) ||
        e.correlationId?.toLowerCase().includes(q) ||
        JSON.stringify(e.data || "").toLowerCase().includes(q)
      );
    });

  const suiteSummary = calculateSuiteSummary(testGroups);

  // ==========================================
  // VIEW: LOGIN SCREEN IF NOT AUTHENTICATED
  // ==========================================
  if (!isDevModeActive) {
    return (
      <main className="h-full w-full overflow-y-auto bg-stone-900 text-stone-100 flex flex-col justify-center items-center px-4 py-12">
        <div className="w-full max-w-md bg-stone-800/90 border border-amber-500/30 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-sm">
          <div className="flex items-center space-x-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-xl font-bold border border-amber-500/40">
              🛠️
            </div>
            <div>
              <h1 className="text-xl font-bold text-stone-100">Sculp&apos;d Developer Mode</h1>
              <p className="text-xs text-stone-400">Telemetry, Test Console &amp; Diagnostics</p>
            </div>
          </div>

          <div className="bg-stone-900/60 border border-stone-700/60 rounded-xl p-3.5 mb-6 text-xs text-stone-300">
            <p className="font-semibold text-amber-300 mb-1">🔒 Access Control &amp; Authorization</p>
            <p className="text-stone-400 leading-relaxed">
              Developer Mode requires explicit environment enablement (<code>ENABLE_DEV_MODE=&quot;true&quot;</code> or local dev). Authenticate using your developer credentials.
            </p>
          </div>

          {loginError && (
            <div className="mb-4 p-3 bg-rose-950/60 border border-rose-800 text-rose-200 text-xs rounded-xl">
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-stone-300 uppercase tracking-wider mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3.5 py-2.5 text-sm text-stone-100 focus:outline-none focus:border-amber-500 transition-colors"
                placeholder="dev"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-300 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3.5 py-2.5 text-sm text-stone-100 focus:outline-none focus:border-amber-500 transition-colors"
                placeholder="••••••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold py-2.5 px-4 rounded-xl text-sm transition-colors shadow-lg shadow-amber-500/20 disabled:opacity-50"
            >
              {isLoggingIn ? "Authenticating..." : "Enter Developer Mode"}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-stone-700/60 text-center">
            <Link
              href="/"
              className="text-xs text-stone-400 hover:text-stone-200 transition-colors inline-flex items-center space-x-1"
            >
              <span>← Return to Workout App</span>
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // ==========================================
  // VIEW: AUTHENTICATED DEV CONSOLE
  // ==========================================
  return (
    <main className="h-full w-full overflow-y-auto bg-stone-950 text-stone-100 flex flex-col overscroll-y-contain">
      {/* Top Header */}
      <header className="border-b border-stone-800 bg-stone-900/90 backdrop-blur-md sticky top-0 z-50 px-4 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center text-base font-bold border border-amber-500/40">
              🛠️
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-stone-100 text-sm sm:text-base">
                  Sculp&apos;d Developer Mode
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  DEV ACTIVE
                </span>
              </div>
              <p className="text-[11px] text-stone-400">
                Logged in as <span className="text-amber-300 font-mono">dev</span> • Token verified server-side
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-3">
            <Link
              href="/"
              className="px-3 py-1.5 rounded-lg text-xs bg-stone-800 hover:bg-stone-700 text-stone-200 transition-colors border border-stone-700"
            >
              ← App
            </Link>
            <button
              onClick={refreshDevDiagnostics}
              className="px-3 py-1.5 rounded-lg text-xs bg-stone-800 hover:bg-stone-700 text-stone-300 transition-colors border border-stone-700"
              title="Refresh local diagnostics"
            >
              🔄 Refresh
            </button>
            <button
              onClick={logoutDev}
              className="px-3 py-1.5 rounded-lg text-xs bg-rose-950/50 hover:bg-rose-900/60 text-rose-200 border border-rose-800 transition-colors font-medium"
            >
              Exit Dev Mode
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="max-w-7xl mx-auto mt-3 flex space-x-1 sm:space-x-2 border-b border-stone-800/80 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab("telemetry")}
            className={`px-3 py-2 text-xs font-semibold rounded-t-lg transition-colors border-b-2 whitespace-nowrap ${
              activeTab === "telemetry"
                ? "border-amber-400 text-amber-400 bg-stone-850"
                : "border-transparent text-stone-400 hover:text-stone-200"
            }`}
          >
            📊 System &amp; Telemetry
          </button>
          <button
            onClick={() => setActiveTab("notifications")}
            className={`px-3 py-2 text-xs font-semibold rounded-t-lg transition-colors border-b-2 whitespace-nowrap ${
              activeTab === "notifications"
                ? "border-amber-400 text-amber-400 bg-stone-850"
                : "border-transparent text-stone-400 hover:text-stone-200"
            }`}
          >
            ⏱️ Timer &amp; Notifications
          </button>
          <button
            onClick={() => setActiveTab("tests")}
            className={`px-3 py-2 text-xs font-semibold rounded-t-lg transition-colors border-b-2 whitespace-nowrap ${
              activeTab === "tests"
                ? "border-amber-400 text-amber-400 bg-stone-850"
                : "border-transparent text-stone-400 hover:text-stone-200"
            }`}
          >
            🧪 Feature Test Console ({suiteSummary.passed}/{suiteSummary.total - suiteSummary.notImplemented})
          </button>
          <button
            onClick={() => setActiveTab("synthetic")}
            className={`px-3 py-2 text-xs font-semibold rounded-t-lg transition-colors border-b-2 whitespace-nowrap ${
              activeTab === "synthetic"
                ? "border-amber-400 text-amber-400 bg-stone-850"
                : "border-transparent text-stone-400 hover:text-stone-200"
            }`}
          >
            🧬 Synthetic Data ({syntheticCounts?.total || 0})
          </button>
        </div>
      </header>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto w-full p-4 sm:p-6 flex-1 pb-16">
        {/* ==================================================== */}
        {/* TAB 1: SYSTEM OVERVIEW & TELEMETRY */}
        {/* ==================================================== */}
        {activeTab === "telemetry" && (
          <div className="space-y-6">
            {/* System Status Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              <div className="bg-stone-900 border border-stone-800 rounded-xl p-3.5">
                <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">
                  IndexedDB Store
                </span>
                <p className="text-base font-bold text-emerald-400 mt-1">sculpd_v3_db v1</p>
                <p className="text-[11px] text-stone-400 mt-0.5">8 Local Tables Healthy</p>
              </div>

              <div className="bg-stone-900 border border-stone-800 rounded-xl p-3.5">
                <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">
                  Sync Outbox Queue
                </span>
                <p
                  className={`text-base font-bold mt-1 ${
                    recordCounts.syncQueue > 0 ? "text-amber-400" : "text-stone-200"
                  }`}
                >
                  {recordCounts.syncQueue} Queued
                </p>
                <p className="text-[11px] text-stone-400 mt-0.5">
                  {syncStatus.isSyncing ? "Syncing now..." : syncStatus.lastError ? "Sync error" : "Idle"}
                </p>
              </div>

              <div className="bg-stone-900 border border-stone-800 rounded-xl p-3.5">
                <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">
                  Service Worker
                </span>
                <p
                  className={`text-base font-bold mt-1 ${
                    serviceWorkerStatus.registered ? "text-emerald-400" : "text-amber-400"
                  }`}
                >
                  {serviceWorkerStatus.registered ? "Active" : "Unregistered"}
                </p>
                <p className="text-[11px] text-stone-400 mt-0.5 truncate">
                  {serviceWorkerStatus.scope || "No active scope"}
                </p>
              </div>

              <div className="bg-stone-900 border border-stone-800 rounded-xl p-3.5">
                <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">
                  Web Push Permission
                </span>
                <p
                  className={`text-base font-bold mt-1 ${
                    notificationStatus.permission === "granted"
                      ? "text-emerald-400"
                      : notificationStatus.permission === "denied"
                      ? "text-rose-400"
                      : "text-stone-300"
                  }`}
                >
                  {notificationStatus.permission.toUpperCase()}
                </p>
                <p className="text-[11px] text-stone-400 mt-0.5">
                  {notificationStatus.hasSubscription ? "Device Subscribed" : "No active subscription"}
                </p>
              </div>
            </div>

            {/* Live Database Record Counts */}
            <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 sm:p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-stone-200 flex items-center space-x-2">
                  <span>📦 Live Dexie Store Records</span>
                </h2>
                <span className="text-xs text-stone-400">
                  Active Athlete: {activeUser?.displayName || "None selected"}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2.5">
                {[
                  { label: "Users", count: recordCounts.users, icon: "👤" },
                  { label: "Routines", count: recordCounts.routines, icon: "📋" },
                  { label: "Exercises", count: recordCounts.exercises, icon: "🏋️" },
                  { label: "Routine Ex.", count: recordCounts.routineExercises, icon: "🔗" },
                  { label: "Sessions", count: recordCounts.workoutSessions, icon: "⏱️" },
                  { label: "Logged Sets", count: recordCounts.sets, icon: "📊" },
                  { label: "Sync Queue", count: recordCounts.syncQueue, icon: "📤" },
                  { label: "Sync Meta", count: recordCounts.syncMeta, icon: "🏷️" },
                ].map((item, idx) => (
                  <div
                    key={idx}
                    className="bg-stone-950 border border-stone-800/80 rounded-xl p-3 text-center"
                  >
                    <span className="text-base">{item.icon}</span>
                    <p className="text-lg font-bold text-stone-100 mt-1">{item.count}</p>
                    <p className="text-[10px] text-stone-400 uppercase font-semibold">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Diagnostic Telemetry Stream */}
            <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-sm font-bold text-stone-200">
                    📡 Diagnostic Telemetry Stream ({filteredTelemetry.length} Events)
                  </h2>
                  <p className="text-xs text-stone-400">
                    Circular buffer (max 200 items). Sanitized with safe correlation IDs; no athlete secrets or credentials.
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() =>
                      setTelemetryScrollMode((prev) => (prev === "box" ? "expanded" : "box"))
                    }
                    className="px-3 py-1.5 rounded-lg text-xs bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-700 transition-colors"
                    title="Toggle between inner scroll box and full-page scrolling"
                  >
                    {telemetryScrollMode === "box" ? "↕ Full Scroll" : "↕ Scroll Box"}
                  </button>
                  <button
                    onClick={() => exportTelemetryJson()}
                    className="px-3 py-1.5 rounded-lg text-xs bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 transition-colors"
                  >
                    💾 Export JSON
                  </button>
                  <button
                    onClick={() => {
                      clearTelemetryBuffer();
                      setTelemetryEvents([]);
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-stone-200 border border-stone-700 transition-colors"
                  >
                    Clear Buffer
                  </button>
                </div>
              </div>

              {/* Filters & Search */}
              <div className="flex flex-wrap items-center gap-2 mb-4 pb-3 border-b border-stone-800">
                <input
                  type="text"
                  placeholder="Filter events, correlations, details..."
                  value={telemetrySearch}
                  onChange={(e) => setTelemetrySearch(e.target.value)}
                  className="bg-stone-950 border border-stone-800 rounded-lg px-3 py-1.5 text-xs text-stone-200 placeholder-stone-500 focus:outline-none focus:border-amber-500 w-full sm:w-64"
                />

                <div className="flex flex-wrap gap-1">
                  {(["all", "workout", "timer", "notification", "sync", "backup", "test", "error"] as const).map(
                    (cat) => (
                      <button
                        key={cat}
                        onClick={() => setTelemetryFilter(cat)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium uppercase tracking-wider transition-colors ${
                          telemetryFilter === cat
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                            : "bg-stone-950 text-stone-400 hover:text-stone-200 border border-stone-800"
                        }`}
                      >
                        {cat}
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Events Table / List */}
              <div
                className={`space-y-2 pr-1 ${
                  telemetryScrollMode === "box"
                    ? "max-h-[500px] overflow-y-auto"
                    : "max-h-none overflow-visible"
                }`}
              >
                {filteredTelemetry.length === 0 ? (
                  <div className="text-center py-8 text-stone-500 text-xs">
                    No telemetry events recorded for this filter.
                  </div>
                ) : (
                  filteredTelemetry.map((ev) => (
                    <div
                      key={ev.id}
                      className="bg-stone-950 border border-stone-800/80 rounded-xl p-3 text-xs flex flex-col space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center space-x-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              ev.category === "error"
                                ? "bg-rose-950 text-rose-300 border border-rose-800"
                                : ev.category === "workout"
                                ? "bg-blue-950 text-blue-300 border border-blue-800"
                                : ev.category === "timer"
                                ? "bg-amber-950 text-amber-300 border border-amber-800"
                                : ev.category === "notification"
                                ? "bg-purple-950 text-purple-300 border border-purple-800"
                                : ev.category === "sync"
                                ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                                : "bg-stone-800 text-stone-300 border border-stone-700"
                            }`}
                          >
                            {ev.category}
                          </span>
                          <span className="font-semibold text-stone-200">{ev.eventType}</span>
                        </div>
                        <span className="text-[10px] font-mono text-stone-500">
                          {new Date(ev.timestamp).toLocaleTimeString()}
                        </span>
                      </div>

                      {ev.data && (
                        <pre className="text-[11px] font-mono bg-stone-900/60 text-stone-300 p-2 rounded-lg overflow-x-auto whitespace-pre-wrap">
                          {JSON.stringify(ev.data, null, 2)}
                        </pre>
                      )}

                      {ev.correlationId && (
                        <div className="text-[10px] text-stone-500 font-mono">
                          Correlation ID: <span className="text-stone-400">{ev.correlationId}</span>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 2: REST TIMER & PUSH NOTIFICATIONS */}
        {/* ==================================================== */}
        {activeTab === "notifications" && (
          <div className="space-y-6">
            {/* Rest Timer Speed Controls */}
            <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-bold text-stone-200">
                    ⏱️ Rest Timer Acceleration &amp; Speed Controls
                  </h2>
                  <p className="text-xs text-stone-400">
                    Accelerate rest timers without completing entire sets or corrupting session history.
                  </p>
                </div>
                <div
                  className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    isTimerRunning
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                      : "bg-stone-800 text-stone-400"
                  }`}
                >
                  {isTimerRunning ? `Active: ${remainingSeconds}s remaining` : "Timer Idle"}
                </div>
              </div>

              {isTimerRunning ? (
                <div className="bg-stone-950 border border-stone-800 rounded-xl p-4 mb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-stone-400">Resting for</p>
                      <p className="text-sm font-bold text-stone-200">{timerExerciseName || "Workout Exercise"}</p>
                    </div>
                    <div className="text-2xl font-bold font-mono text-amber-400">
                      {remainingSeconds}s
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      onClick={() => accelerateTimer(5)}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-stone-950 transition-colors shadow-md"
                    >
                      ⚡ 5s Left
                    </button>
                    <button
                      onClick={() => accelerateTimer(10)}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white transition-colors"
                    >
                      ⚡ 10s Left
                    </button>
                    <button
                      onClick={completeTimerNow}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                    >
                      ✓ Complete Now
                    </button>
                    <button
                      onClick={cancelTimer}
                      className="px-3.5 py-1.5 rounded-lg text-xs bg-stone-800 hover:bg-stone-700 text-stone-300 transition-colors"
                    >
                      Cancel Timer
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-stone-950 border border-stone-800/80 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-stone-300">No active rest timer running</p>
                    <p className="text-[11px] text-stone-500">
                      Start a test timer to test acceleration and sound/vibration alerts.
                    </p>
                  </div>
                  <button
                    onClick={() => startTimer(90, "Developer Mode Test Exercise", 1)}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-stone-950 transition-colors shadow-md shadow-amber-500/20"
                  >
                    ▶ Start 90s Test Timer
                  </button>
                </div>
              )}
            </div>

            {/* Notification Verification Center */}
            <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5">
              <div className="mb-4">
                <h2 className="text-sm font-bold text-stone-200">
                  🔔 Push Notification Verification Center
                </h2>
                <p className="text-xs text-stone-400">
                  Strictly distinguishes between local device simulation and full server-side VAPID push gateway delivery.
                </p>
              </div>

              {/* Two Verification Methods Comparison Banner */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {/* Method 1: Local Simulation */}
                <div className="bg-stone-950 border border-stone-800 rounded-xl p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center space-x-2 mb-2">
                      <span className="text-base">📱</span>
                      <h3 className="text-xs font-bold text-stone-200 uppercase tracking-wider">
                        Action 1: Local SW Simulation
                      </h3>
                    </div>
                    <p className="text-xs text-stone-400 leading-relaxed mb-4">
                      Directly invokes <code>ServiceWorkerRegistration.showNotification()</code> on this device. Tests local sound, vibration, banner rendering, and permissions without communicating with external push servers.
                    </p>
                  </div>

                  <div>
                    {localNotificationMessage && (
                      <p className="text-[11px] font-mono text-amber-300 mb-2">
                        {localNotificationMessage}
                      </p>
                    )}
                    <button
                      onClick={handleSimulateNotification}
                      className="w-full px-3.5 py-2 rounded-xl text-xs font-semibold bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 transition-colors"
                    >
                      🔔 Simulate Notification (Local SW)
                    </button>
                  </div>
                </div>

                {/* Method 2: Real Cloud Push Pipeline */}
                <div className="bg-stone-950 border border-stone-800 rounded-xl p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center space-x-2 mb-2">
                      <span className="text-base">🌐</span>
                      <h3 className="text-xs font-bold text-stone-200 uppercase tracking-wider">
                        Action 2: Real Push Pipeline Test
                      </h3>
                    </div>
                    <p className="text-xs text-stone-400 leading-relaxed mb-4">
                      Dispatches a real push request through <code>POST /api/dev/test-push</code>. Verifies all 5 pipeline stages: Client Request $\rightarrow$ Server Authorization $\rightarrow$ MongoDB Subscription Lookup $\rightarrow$ VAPID Push Dispatch $\rightarrow$ APNs/FCM Gateway Delivery.
                    </p>
                  </div>

                  <div>
                    <button
                      onClick={triggerPushPipelineTest}
                      className="w-full px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-stone-950 transition-colors shadow-md shadow-amber-500/20"
                    >
                      🚀 Test Real Push Pipeline (5 Stages)
                    </button>
                  </div>
                </div>
              </div>

              {/* 5-Stage Diagnostic Report */}
              {pushPipelineResult && (
                <div className="bg-stone-950 border border-stone-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-stone-800">
                    <h3 className="text-xs font-bold text-stone-200">
                      5-Stage Push Pipeline Diagnostic Report
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        pushPipelineResult.overallSuccess
                          ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                          : "bg-rose-950 text-rose-300 border border-rose-800"
                      }`}
                    >
                      {pushPipelineResult.overallSuccess ? "Pipeline Verified" : "Pipeline Issues"}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {pushPipelineResult.stages.map((stage: any) => (
                      <div
                        key={stage.stage}
                        className="flex items-start justify-between p-2.5 rounded-lg bg-stone-900/60 border border-stone-800/80 text-xs"
                      >
                        <div className="flex items-start space-x-2.5">
                          <span className="font-bold text-stone-400">{stage.stage}.</span>
                          <div>
                            <p className="font-semibold text-stone-200">{stage.name}</p>
                            {stage.details && (
                              <pre className="text-[10px] font-mono text-stone-400 mt-0.5 whitespace-pre-wrap">
                                {typeof stage.details === "string"
                                  ? stage.details
                                  : JSON.stringify(stage.details, null, 2)}
                              </pre>
                            )}
                            {stage.error && (
                              <p className="text-[11px] text-rose-400 font-mono mt-1">
                                Error: {stage.error}
                              </p>
                            )}
                          </div>
                        </div>

                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shrink-0 ml-2 ${
                            stage.status === "success"
                              ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                              : stage.status === "warning"
                              ? "bg-amber-950 text-amber-300 border border-amber-800"
                              : "bg-rose-950 text-rose-400 border border-rose-800"
                          }`}
                        >
                          {stage.status}
                        </span>
                      </div>
                    ))}
                  </div>

                  {pushPipelineResult.remediation && (
                    <div className="mt-3 p-2.5 rounded-lg bg-amber-950/40 border border-amber-800 text-[11px] text-amber-300">
                      <strong>Remediation Tip:</strong> {pushPipelineResult.remediation}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 3: FEATURE TEST CONSOLE */}
        {/* ==================================================== */}
        {activeTab === "tests" && (
          <div className="space-y-6">
            {/* Top Test Suite Summary Bar */}
            <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-sm font-bold text-stone-200">
                    🧪 Feature Test Console (14 Architectural Groups)
                  </h2>
                  <p className="text-xs text-stone-400">
                    In-app verification test suite. Roadmap items are honestly reported as Not Implemented.
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleRunAllTests}
                    disabled={isRunningAllTests}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-stone-950 transition-colors shadow-md shadow-amber-500/20 disabled:opacity-50"
                  >
                    {isRunningAllTests ? "Running All Tests..." : "▶ Run All Tests"}
                  </button>
                  <button
                    onClick={handleResetTests}
                    className="px-3 py-2 rounded-xl text-xs bg-stone-800 hover:bg-stone-700 text-stone-300 transition-colors border border-stone-700"
                  >
                    Reset
                  </button>
                </div>
              </div>

              {/* Status Counters */}
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-center text-xs">
                <div className="bg-stone-950 border border-stone-800 rounded-xl p-2.5">
                  <p className="text-base font-bold text-stone-100">{suiteSummary.total}</p>
                  <p className="text-[10px] text-stone-400 uppercase font-semibold">Total Tests</p>
                </div>
                <div className="bg-stone-950 border border-stone-800 rounded-xl p-2.5">
                  <p className="text-base font-bold text-emerald-400">{suiteSummary.passed}</p>
                  <p className="text-[10px] text-stone-400 uppercase font-semibold">Passed</p>
                </div>
                <div className="bg-stone-950 border border-stone-800 rounded-xl p-2.5">
                  <p className="text-base font-bold text-rose-400">{suiteSummary.failed}</p>
                  <p className="text-[10px] text-stone-400 uppercase font-semibold">Failed</p>
                </div>
                <div className="bg-stone-950 border border-stone-800 rounded-xl p-2.5">
                  <p className="text-base font-bold text-amber-400">{suiteSummary.notImplemented}</p>
                  <p className="text-[10px] text-stone-400 uppercase font-semibold">Not Implemented</p>
                </div>
                <div className="bg-stone-950 border border-stone-800 rounded-xl p-2.5">
                  <p className="text-base font-bold text-stone-400">{suiteSummary.pending}</p>
                  <p className="text-[10px] text-stone-400 uppercase font-semibold">Pending</p>
                </div>
                <div className="bg-stone-950 border border-stone-800 rounded-xl p-2.5">
                  <p className="text-base font-bold font-mono text-stone-300">
                    {suiteSummary.durationMs}ms
                  </p>
                  <p className="text-[10px] text-stone-400 uppercase font-semibold">Duration</p>
                </div>
              </div>
            </div>

            {/* Test Groups List */}
            <div className="space-y-3">
              {testGroups.map((group) => {
                const isExpanded = !!expandedGroups[group.id];
                const isGroupNotImplemented = group.status === "not_implemented";

                return (
                  <div
                    key={group.id}
                    className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden transition-all"
                  >
                    {/* Group Header */}
                    <div className="p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3 bg-stone-900/90 hover:bg-stone-850">
                      <div
                        onClick={() => toggleGroupExpand(group.id)}
                        className="flex items-center space-x-3 cursor-pointer select-none flex-1"
                      >
                        <span className="text-xs font-mono text-stone-500">
                          {isExpanded ? "▼" : "▶"}
                        </span>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-bold text-amber-400">
                              Group {group.id}.
                            </span>
                            <span className="text-xs sm:text-sm font-bold text-stone-200">
                              {group.name}
                            </span>
                          </div>
                          <p className="text-[11px] text-stone-400 mt-0.5 line-clamp-1">
                            {group.description}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            group.status === "passed"
                              ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                              : group.status === "failed"
                              ? "bg-rose-950 text-rose-400 border border-rose-800"
                              : group.status === "not_implemented"
                              ? "bg-amber-950/60 text-amber-300 border border-amber-800/80"
                              : group.status === "running"
                              ? "bg-blue-950 text-blue-300 border border-blue-800 animate-pulse"
                              : "bg-stone-800 text-stone-400"
                          }`}
                        >
                          {group.status.replace("_", " ")}
                        </span>

                        {!isGroupNotImplemented && (
                          <button
                            onClick={() => handleRunTestGroup(group)}
                            className="px-2.5 py-1 rounded-lg text-xs bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 transition-colors"
                          >
                            Run Group
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Group Test Cases */}
                    {isExpanded && (
                      <div className="p-3.5 sm:p-4 bg-stone-950/80 border-t border-stone-800 space-y-2.5">
                        {group.tests.map((test) => (
                          <div
                            key={test.id}
                            className="bg-stone-900/60 border border-stone-800/80 rounded-xl p-3 text-xs"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex-1">
                                <div className="flex items-center space-x-2">
                                  <span className="font-semibold text-stone-200">
                                    {test.name}
                                  </span>
                                  {test.durationMs !== undefined && test.durationMs > 0 && (
                                    <span className="text-[10px] font-mono text-stone-500">
                                      {test.durationMs}ms
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-stone-400 mt-0.5">
                                  {test.description}
                                </p>
                              </div>

                              <div className="flex items-center space-x-2 shrink-0">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                    test.status === "passed"
                                      ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                                      : test.status === "failed"
                                      ? "bg-rose-950 text-rose-400 border border-rose-800"
                                      : test.status === "not_implemented"
                                      ? "bg-amber-950/60 text-amber-300 border border-amber-800/80"
                                      : test.status === "running"
                                      ? "bg-blue-950 text-blue-300 border border-blue-800 animate-pulse"
                                      : "bg-stone-800 text-stone-400"
                                  }`}
                                >
                                  {test.status.replace("_", " ")}
                                </span>

                                {test.status !== "not_implemented" && (
                                  <button
                                    onClick={() => handleRunTestCase(test.id, group.id)}
                                    className="px-2 py-1 rounded-md text-[11px] bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-700"
                                  >
                                    Run
                                  </button>
                                )}
                              </div>
                            </div>

                            {test.summary && (
                              <p className="text-[11px] text-stone-300 mt-2 font-mono bg-stone-950 p-2 rounded-lg border border-stone-850">
                                {test.summary}
                              </p>
                            )}

                            {test.error && (
                              <p className="text-[11px] text-rose-400 mt-2 font-mono bg-rose-950/40 p-2 rounded-lg border border-rose-800">
                                ❌ {test.error}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 4: SYNTHETIC DATA GENERATOR */}
        {/* ==================================================== */}
        {activeTab === "synthetic" && (
          <div className="space-y-6">
            {/* Safety Guarantee Banner */}
            <div className="bg-stone-900 border border-amber-500/30 rounded-2xl p-5">
              <div className="flex items-start space-x-3">
                <span className="text-xl">🛡️</span>
                <div>
                  <h2 className="text-sm font-bold text-stone-200">
                    Synthetic Data Isolation &amp; Real Data Safety Guarantee
                  </h2>
                  <p className="text-xs text-stone-400 leading-relaxed mt-1">
                    All synthetic athletes and workouts generated here strictly use IDs prefixed with{" "}
                    <code className="text-amber-300 font-mono">dev_synthetic_*</code>. They are completely isolated from your real workout data. Purging synthetic data will <strong>never</strong> modify or delete real athlete records (<code>usr_*</code>).
                  </p>
                </div>
              </div>
            </div>

            {/* Current Synthetic Counts & Purge */}
            <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-sm font-bold text-stone-200">
                    Current Synthetic Records ({syntheticCounts?.total || 0} Total)
                  </h3>
                  <p className="text-xs text-stone-400">
                    Synthetic records currently stored in local IndexedDB.
                  </p>
                </div>

                <button
                  onClick={handleCleanupSynthetic}
                  disabled={isCleaningSynthetic || (syntheticCounts?.total || 0) === 0}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-950 hover:bg-rose-900 text-rose-200 border border-rose-800 transition-colors shadow-lg disabled:opacity-40"
                >
                  {isCleaningSynthetic ? "Purging..." : "🧹 Purge All Synthetic Data"}
                </button>
              </div>

              {syntheticMessage && (
                <div className="p-3 mb-4 rounded-xl bg-stone-950 border border-stone-800 text-xs text-stone-200 font-mono">
                  {syntheticMessage}
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2.5">
                {[
                  { label: "Users", count: syntheticCounts?.users || 0 },
                  { label: "Routines", count: syntheticCounts?.routines || 0 },
                  { label: "Routine Ex.", count: syntheticCounts?.routineExercises || 0 },
                  { label: "Sessions", count: syntheticCounts?.workoutSessions || 0 },
                  { label: "Sets", count: syntheticCounts?.sets || 0 },
                  { label: "Sync Queue", count: syntheticCounts?.syncQueue || 0 },
                  { label: "Sync Meta", count: syntheticCounts?.syncMeta || 0 },
                ].map((item, idx) => (
                  <div
                    key={idx}
                    className="bg-stone-950 border border-stone-800/80 rounded-xl p-3 text-center"
                  >
                    <p className="text-base font-bold text-amber-400">{item.count}</p>
                    <p className="text-[10px] text-stone-400 uppercase font-semibold">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Scenario Generator Cards */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400">
                Available Synthetic Test Scenarios
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {AVAILABLE_SCENARIOS.map((scenario) => (
                  <div
                    key={scenario.key}
                    className="bg-stone-900 border border-stone-800 rounded-xl p-4 flex flex-col justify-between"
                  >
                    <div>
                      <h4 className="text-sm font-bold text-stone-200">{scenario.name}</h4>
                      <p className="text-xs text-stone-400 mt-1 leading-relaxed">
                        {scenario.description}
                      </p>
                      <p className="text-[11px] font-mono text-amber-400/80 mt-2">
                        Generates: {scenario.estimatedRecords}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-stone-800 flex justify-end">
                      <button
                        onClick={() => handleGenerateScenario(scenario.key)}
                        disabled={isGeneratingScenario}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-stone-950 transition-colors shadow-md shadow-amber-500/20 disabled:opacity-50"
                      >
                        {isGeneratingScenario ? "Generating..." : "Generate Scenario"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
