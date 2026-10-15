// components/calendar/WorkoutCalendar.tsx
"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import {
  getCalendarMonthData,
  getLocalDateKey,
  formatCalendarDate,
  CalendarDay,
  DayWorkoutSummary,
} from "@/lib/calendar/calendar-service";
import EditSessionDateModal from "./EditSessionDateModal";
import BackfillWorkoutModal from "./BackfillWorkoutModal";
import SkipConfirmationModal from "./SkipConfirmationModal";
import LogAlternativeModal from "./LogAlternativeModal";
import { cancelWorkoutSkip, isPlannedWorkoutDay } from "@/lib/accountability/accountability-service";

interface WorkoutCalendarProps {
  userId: string;
}

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function WorkoutCalendar({ userId }: WorkoutCalendarProps) {
  const now = useMemo(() => new Date(), []);
  const [currentYear, setCurrentYear] = useState<number>(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(now.getMonth());
  const [selectedDateKey, setSelectedDateKey] = useState<string>(getLocalDateKey(now));

  // Modal states
  const [editingSession, setEditingSession] = useState<{
    id: string;
    routineName: string;
    startedAt: string;
    completedAt?: string | null;
  } | null>(null);
  const [isBackfillModalOpen, setIsBackfillModalOpen] = useState<boolean>(false);
  const [isSkipModalOpen, setIsSkipModalOpen] = useState<boolean>(false);
  const [isAlternativeModalOpen, setIsAlternativeModalOpen] = useState<boolean>(false);
  const [plannedInfo, setPlannedInfo] = useState<{ isPlanned: boolean; routineName?: string; routine?: any } | null>(null);

  React.useEffect(() => {
    if (userId && selectedDateKey) {
      isPlannedWorkoutDay(userId, selectedDateKey).then(setPlannedInfo).catch(() => setPlannedInfo(null));
    }
  }, [userId, selectedDateKey]);

  // Live query for month data
  const monthData = useLiveQuery(
    async () => {
      if (!userId) return null;
      return getCalendarMonthData(userId, currentYear, currentMonth);
    },
    [userId, currentYear, currentMonth]
  );

  const todayKey = getLocalDateKey(now);
  const isViewingCurrentMonth =
    currentYear === now.getFullYear() && currentMonth === now.getMonth();

  // Navigation handlers
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const handleJumpToToday = () => {
    setCurrentYear(now.getFullYear());
    setCurrentMonth(now.getMonth());
    setSelectedDateKey(todayKey);
  };

  const selectedDaySessions = monthData?.sessionsByDate.get(selectedDateKey) || [];
  const selectedDaySkip = monthData?.skipsByDate?.get(selectedDateKey);
  const selectedDayAlternatives = monthData?.alternativesByDate?.get(selectedDateKey) || [];
  const isSelectedDateFuture = selectedDateKey > todayKey;
  const hasCompletedToday = selectedDaySessions.some((s) => s.status === "completed");
  const canSkip = !isSelectedDateFuture && !hasCompletedToday && !selectedDaySkip;

  const handleUnskip = async () => {
    if (!selectedDaySkip) return;
    await cancelWorkoutSkip(userId, selectedDaySkip.id);
  };

  return (
    <div className="w-full max-w-full space-y-4 font-sans overflow-hidden">
      {/* Month Navigation & Today Button */}
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <h2 className="text-xl font-black uppercase tracking-tight text-zinc-950">
            {monthData?.formattedMonthYear || "Calendar"}
          </h2>
        </div>

        <div className="flex items-center gap-1.5">
          {!isViewingCurrentMonth && (
            <button
              type="button"
              onClick={handleJumpToToday}
              className="h-8 px-2.5 rounded-xl bg-white hover:bg-stone-50 border border-stone-200 text-stone-700 font-mono text-xs uppercase tracking-wider transition-colors cursor-pointer shadow-2xs active:scale-95"
            >
              Today
            </button>
          )}

          <div className="flex items-center rounded-xl bg-white border border-stone-200 shadow-2xs p-0.5">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="w-8 h-7 flex items-center justify-center rounded-lg text-stone-600 hover:text-zinc-900 hover:bg-stone-100 transition-colors cursor-pointer"
              title="Previous month"
              aria-label="Previous month"
            >
              ←
            </button>
            <button
              type="button"
              onClick={handleNextMonth}
              className="w-8 h-7 flex items-center justify-center rounded-lg text-stone-600 hover:text-zinc-900 hover:bg-stone-100 transition-colors cursor-pointer"
              title="Next month"
              aria-label="Next month"
            >
              →
            </button>
          </div>
        </div>
      </div>

      {/* Month Metrics Header Cards */}
      {monthData && (
        <div className="grid grid-cols-3 gap-2">
          <div className="p-2.5 rounded-2xl bg-white border border-stone-200 text-center shadow-2xs">
            <span className="block text-[10px] font-mono uppercase tracking-wider text-stone-400 font-bold">
              Workouts
            </span>
            <span className="text-base font-black text-zinc-900">
              {monthData.monthStats.totalCompletedWorkouts}
            </span>
          </div>

          <div className="p-2.5 rounded-2xl bg-white border border-stone-200 text-center shadow-2xs">
            <span className="block text-[10px] font-mono uppercase tracking-wider text-stone-400 font-bold">
              Rest Days
            </span>
            <span className="text-base font-black text-zinc-900">
              {monthData.monthStats.restDaysCount}
            </span>
          </div>

          <div className="p-2.5 rounded-2xl bg-white border border-stone-200 text-center shadow-2xs">
            <span className="block text-[10px] font-mono uppercase tracking-wider text-stone-400 font-bold">
              Volume
            </span>
            <span className="text-base font-black text-zinc-900 truncate">
              {monthData.monthStats.formattedTotalVolume}
            </span>
          </div>
        </div>
      )}

      {/* Monthly Calendar Grid */}
      <div className="w-full max-w-full rounded-3xl bg-white border border-stone-200 p-2.5 sm:p-4 shadow-xs space-y-2 overflow-hidden">
        {/* Weekday Labels */}
        <div className="grid grid-cols-7 gap-1 text-center font-mono text-[11px] font-bold text-stone-400 uppercase py-1">
          {WEEKDAY_NAMES.map((name) => (
            <div key={name}>{name}</div>
          ))}
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-7 gap-1">
          {monthData?.days.map((day: CalendarDay) => {
            const hasCompleted = monthData.daysWithCompletedWorkouts.has(day.dateKey);
            const hasInProgress = monthData.daysWithInProgressWorkouts.has(day.dateKey);
            const hasSkipped = monthData.daysWithSkippedWorkouts?.has(day.dateKey);
            const hasAlternative = monthData.daysWithAlternatives?.has(day.dateKey);
            const isSelected = selectedDateKey === day.dateKey;
            const daySessions = monthData.sessionsByDate.get(day.dateKey) || [];
            const completedCount = daySessions.filter((s) => s.status === "completed").length;

            return (
              <button
                key={day.dateKey}
                type="button"
                onClick={() => setSelectedDateKey(day.dateKey)}
                className={`min-h-[48px] rounded-2xl p-1 flex flex-col items-center justify-between transition-all cursor-pointer select-none active:scale-95 ${
                  isSelected
                    ? "bg-zinc-900 text-white shadow-sm ring-2 ring-zinc-900"
                    : day.isCurrentMonth
                    ? "hover:bg-stone-100 text-zinc-900"
                    : "text-stone-300 hover:text-stone-500 hover:bg-stone-50"
                } ${day.isFuture ? "opacity-60" : ""}`}
              >
                {/* Day number & Today dot */}
                <div className="flex items-center gap-0.5 pt-0.5">
                  <span className="text-xs font-mono font-bold leading-none">
                    {day.dayNumber}
                  </span>
                  {day.isToday && (
                    <span
                      className={`w-1 h-1 rounded-full ${
                        isSelected ? "bg-amber-300" : "bg-zinc-900"
                      }`}
                      title="Today"
                    />
                  )}
                </div>

                {/* Workout Indicators */}
                <div className="h-4 flex items-center justify-center gap-0.5 pb-0.5">
                  {hasCompleted && (
                    <span
                      className={`flex items-center justify-center font-mono font-bold ${
                        completedCount > 1
                          ? `text-[9px] px-1 rounded-full ${
                              isSelected
                                ? "bg-emerald-400 text-zinc-950"
                                : "bg-emerald-500 text-white"
                            }`
                          : `w-2 h-2 rounded-full ${
                              isSelected ? "bg-emerald-400" : "bg-emerald-500"
                            }`
                      }`}
                      title={`${completedCount} completed workout(s)`}
                    >
                      {completedCount > 1 ? completedCount : null}
                    </span>
                  )}

                  {hasInProgress && (
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isSelected ? "bg-amber-300" : "bg-amber-500"
                      } animate-pulse`}
                      title="Workout in progress"
                    />
                  )}

                  {!hasCompleted && !hasInProgress && hasSkipped && (
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isSelected ? "bg-amber-300" : "bg-amber-500"
                      }`}
                      title="Skipped planned workout"
                    />
                  )}

                  {hasAlternative && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isSelected ? "bg-sky-300" : "bg-sky-500"
                      }`}
                      title="Fitness alternative logged"
                    />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-[10px] font-mono text-stone-500 px-1 flex-wrap gap-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Completed</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span>In Progress</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span>Skipped</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
              <span>Alternative</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="text-stone-300">○</span>
              <span>Rest</span>
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsBackfillModalOpen(true)}
            className="text-[11px] font-bold text-zinc-900 hover:underline uppercase tracking-wider"
          >
            + Log Past
          </button>
        </div>
      </div>

      {/* Selected Date Details Panel */}
      <div className="w-full max-w-full rounded-3xl bg-white border border-stone-200 p-4 shadow-xs space-y-3 overflow-hidden">
        {/* Selected date header */}
        <div className="flex items-center justify-between border-b border-stone-100 pb-2">
          <div>
            <h3 className="text-sm font-bold text-zinc-900">
              {formatCalendarDate(selectedDateKey, "short")}
            </h3>
            <p className="text-[11px] font-mono text-stone-400">
              {selectedDateKey === todayKey ? "Today" : formatCalendarDate(selectedDateKey, "full")}
            </p>
          </div>

          {/* Action buttons for selected day */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {!isSelectedDateFuture && (
              <>
                <button
                  type="button"
                  onClick={() => setIsAlternativeModalOpen(true)}
                  className="text-xs font-mono font-bold text-sky-800 hover:text-sky-950 bg-sky-50 hover:bg-sky-100 border border-sky-200 px-2 py-1 rounded-xl transition-colors cursor-pointer"
                  title="Log walking, mobility, or recovery to earn an extra skip"
                >
                  + Alt
                </button>

                {canSkip && (
                  <button
                    type="button"
                    onClick={() => setIsSkipModalOpen(true)}
                    className="text-xs font-mono font-bold text-amber-800 hover:text-amber-950 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-1 rounded-xl transition-colors cursor-pointer"
                    title="Mark planned workout as skipped"
                  >
                    Skip Day
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setIsBackfillModalOpen(true)}
                  className="text-xs font-mono font-bold text-stone-600 hover:text-zinc-900 bg-stone-50 hover:bg-stone-100 border border-stone-200 px-2.5 py-1 rounded-xl transition-colors cursor-pointer"
                >
                  + Backfill
                </button>
              </>
            )}
          </div>
        </div>

        {/* Day Sessions List or Empty Rest Day Message */}
        {selectedDaySessions.length > 0 || selectedDaySkip || selectedDayAlternatives.length > 0 ? (
          <div className="space-y-2.5">
            {/* If there's an explicit skip */}
            {selectedDaySkip && (
              <div className="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200/90 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-amber-950">
                        {selectedDaySkip.routineName ? `${selectedDaySkip.routineName} (Skipped)` : "Planned Workout Skipped"}
                      </h4>
                      <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                        {selectedDaySkip.skipType === "earned" ? "Earned Skip Used" : "Monthly Free Skip"}
                      </span>
                    </div>
                    {selectedDaySkip.reason && (
                      <p className="text-xs text-amber-800 mt-1 italic">
                        &quot;{selectedDaySkip.reason}&quot;
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleUnskip}
                    className="text-xs font-mono font-bold text-amber-900 hover:text-amber-950 bg-amber-100/70 hover:bg-amber-200 border border-amber-300 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                    title="Undo this skip and restore your skip credit"
                  >
                    Un-skip
                  </button>
                </div>
              </div>
            )}

            {/* If there are fitness alternatives */}
            {selectedDayAlternatives.map((alt) => (
              <div
                key={alt.id}
                className="p-3 rounded-2xl bg-sky-50/70 border border-sky-200/80 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">
                      {(alt.activityType || alt.type) === "walking"
                        ? "🚶"
                        : (alt.activityType || alt.type) === "mobility"
                        ? "🧘"
                        : (alt.activityType || alt.type) === "recovery"
                        ? "🌊"
                        : "🚴"}
                    </span>
                    <div>
                      <h4 className="text-xs font-bold text-sky-950">
                        {alt.title}
                      </h4>
                      <p className="text-[11px] font-mono text-sky-700">
                        {alt.durationMinutes} min • {(alt.activityType || alt.type || "").replace("_", " ")}
                      </p>
                    </div>
                  </div>
                  {alt.skipEarned ? (
                    <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-300">
                      +1 Earned Skip
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono text-stone-500">
                      &lt;20 min
                    </span>
                  )}
                </div>
                {alt.notes && (
                  <p className="text-xs text-stone-600 pl-6 italic">
                    {alt.notes}
                  </p>
                )}
              </div>
            ))}

            {selectedDaySessions.map((session: DayWorkoutSummary) => (
              <div
                key={session.sessionId}
                className="p-3.5 rounded-2xl bg-stone-50/70 border border-stone-200/80 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-zinc-900">
                        {session.routineName}
                      </h4>
                      {session.status === "completed" ? (
                        <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                          Completed
                        </span>
                      ) : (
                        <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 animate-pulse">
                          In Progress
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-mono text-stone-500 mt-0.5">
                      {session.formattedTime} • {session.formattedDuration}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {session.prCount > 0 && (
                      <span className="text-[10px] font-mono font-bold bg-amber-50 text-amber-900 border border-amber-200 px-1.5 py-0.5 rounded">
                        {session.prCount} PR{session.prCount === 1 ? "" : "s"}
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        setEditingSession({
                          id: session.sessionId,
                          routineName: session.routineName,
                          startedAt: session.startedAt,
                          completedAt: session.completedAt,
                        })
                      }
                      className="text-xs font-mono text-stone-500 hover:text-zinc-900 p-1 rounded-lg hover:bg-stone-200 transition-colors cursor-pointer"
                      title="Correct or change session date"
                    >
                      ✏️ Edit Date
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs font-mono text-stone-600 pt-1 border-t border-stone-200/50">
                  <span>
                    {session.totalSets} set{session.totalSets === 1 ? "" : "s"} •{" "}
                    {session.formattedVolume}
                  </span>

                  {session.status === "completed" ? (
                    <Link
                      href={`/history/${session.sessionId}`}
                      className="text-xs font-bold text-zinc-900 hover:underline inline-flex items-center gap-1"
                    >
                      <span>View Record</span>
                      <span>→</span>
                    </Link>
                  ) : (
                    <Link
                      href={`/workout/${session.routineId}`}
                      className="text-xs font-bold text-amber-900 hover:underline inline-flex items-center gap-1"
                    >
                      <span>Resume</span>
                      <span>→</span>
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-6 text-center space-y-1">
            {isSelectedDateFuture ? (
              <>
                <p className="text-xs font-mono font-bold text-stone-500">
                  Future Date
                </p>
                <p className="text-xs text-stone-400">
                  No upcoming workouts scheduled for this day.
                </p>
              </>
            ) : (
              <>
                <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center mx-auto text-stone-400 mb-2">
                  ☕
                </div>
                <p className="text-xs font-mono font-bold text-stone-700">
                  Rest Day
                </p>
                <p className="text-xs text-stone-500">
                  No completed workouts logged for this day.
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Date Correction Modal */}
      {editingSession && (
        <EditSessionDateModal
          isOpen={Boolean(editingSession)}
          userId={userId}
          session={editingSession}
          onClose={() => setEditingSession(null)}
          onSuccess={(updated) => {
            setSelectedDateKey(getLocalDateKey(updated.startedAt));
          }}
        />
      )}

      {/* Backfill Past Workout Modal */}
      {isBackfillModalOpen && (
        <BackfillWorkoutModal
          isOpen={isBackfillModalOpen}
          userId={userId}
          initialDateKey={selectedDateKey <= todayKey ? selectedDateKey : todayKey}
          onClose={() => setIsBackfillModalOpen(false)}
          onSuccess={(session) => {
            setSelectedDateKey(getLocalDateKey(session.startedAt));
          }}
        />
      )}

      {/* Skip Confirmation Modal */}
      {isSkipModalOpen && (
        <SkipConfirmationModal
          isOpen={isSkipModalOpen}
          userId={userId}
          dateKey={selectedDateKey}
          routineName={plannedInfo?.routineName}
          routineId={plannedInfo?.routine?.id}
          onClose={() => setIsSkipModalOpen(false)}
          onSuccess={() => setIsSkipModalOpen(false)}
        />
      )}

      {/* Log Alternative Modal */}
      {isAlternativeModalOpen && (
        <LogAlternativeModal
          isOpen={isAlternativeModalOpen}
          userId={userId}
          initialDateKey={selectedDateKey <= todayKey ? selectedDateKey : todayKey}
          onClose={() => setIsAlternativeModalOpen(false)}
          onSuccess={() => setIsAlternativeModalOpen(false)}
        />
      )}
    </div>
  );
}
