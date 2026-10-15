// lib/calendar/calendar-service.ts
import { db } from "@/lib/db";
import {
  WorkoutSession,
  WorkoutSet,
  WorkoutSessionStatus,
  WorkoutSkip,
  FitnessAlternative,
} from "@/types/models";
import {
  calculateWorkoutDuration,
  formatWorkoutDuration,
  calculateWorkoutVolume,
  formatWorkoutVolume,
  getSessionPRs,
} from "@/lib/history/history-service";
import { getUserSetsForSession } from "@/lib/db/workout-repository";

/**
 * Returns a "YYYY-MM-DD" date key strictly based on the user's LOCAL time zone.
 * Avoids UTC date shifts for evening workouts or international users.
 */
export function getLocalDateKey(dateInput: string | Date | number): string {
  const d = typeof dateInput === "object" ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date input for getLocalDateKey: ${dateInput}`);
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Parses a "YYYY-MM-DD" string into local year, month (1-12), and day (1-31).
 */
export function parseLocalDateKey(key: string): { year: number; month: number; day: number } {
  const parts = key.split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Invalid local date key format (expected YYYY-MM-DD): ${key}`);
  }
  return { year: parts[0], month: parts[1], day: parts[2] };
}

/**
 * Formats a "YYYY-MM-DD" local date key into human-readable strings.
 */
export function formatCalendarDate(
  dateKey: string,
  format: "short" | "medium" | "full" | "monthYear" = "full"
): string {
  const { year, month, day } = parseLocalDateKey(dateKey);
  const d = new Date(year, month - 1, day);

  switch (format) {
    case "short":
      return d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
    case "medium":
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    case "monthYear":
      return d.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      });
    case "full":
    default:
      return d.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
  }
}

export interface CalendarDay {
  dateKey: string; // "YYYY-MM-DD"
  dayNumber: number; // 1..31
  year: number;
  month: number; // 0..11
  isCurrentMonth: boolean;
  isToday: boolean;
  isFuture: boolean;
  isPast: boolean;
}

/**
 * Generates the full 7-column calendar day matrix for a given month and year.
 * Correctly accounts for leap years, variable month lengths, and padding days.
 *
 * @param year e.g. 2026
 * @param month 0-indexed month (0 = Jan, 11 = Dec)
 */
export function getCalendarMonthDays(year: number, month: number): CalendarDay[] {
  const todayKey = getLocalDateKey(new Date());

  // First day of target month
  const firstDay = new Date(year, month, 1);
  const startingDayOfWeek = firstDay.getDay(); // 0 = Sunday, 1 = Monday, etc.

  // Total days in target month
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Total days in previous month
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const days: CalendarDay[] = [];

  // 1. Previous month trailing padding days
  for (let i = startingDayOfWeek - 1; i >= 0; i--) {
    const dayNumber = daysInPrevMonth - i;
    const prevMonthDate = new Date(year, month - 1, dayNumber);
    const dateKey = getLocalDateKey(prevMonthDate);
    days.push({
      dateKey,
      dayNumber,
      year: prevMonthDate.getFullYear(),
      month: prevMonthDate.getMonth(),
      isCurrentMonth: false,
      isToday: dateKey === todayKey,
      isFuture: dateKey > todayKey,
      isPast: dateKey < todayKey,
    });
  }

  // 2. Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const currentMonthDate = new Date(year, month, d);
    const dateKey = getLocalDateKey(currentMonthDate);
    days.push({
      dateKey,
      dayNumber: d,
      year,
      month,
      isCurrentMonth: true,
      isToday: dateKey === todayKey,
      isFuture: dateKey > todayKey,
      isPast: dateKey < todayKey,
    });
  }

  // 3. Next month leading padding days to complete 7-day grid rows (35 or 42 cells)
  const totalGridCells = days.length <= 35 ? 35 : 42;
  const remainingCells = totalGridCells - days.length;
  for (let d = 1; d <= remainingCells; d++) {
    const nextMonthDate = new Date(year, month + 1, d);
    const dateKey = getLocalDateKey(nextMonthDate);
    days.push({
      dateKey,
      dayNumber: d,
      year: nextMonthDate.getFullYear(),
      month: nextMonthDate.getMonth(),
      isCurrentMonth: false,
      isToday: dateKey === todayKey,
      isFuture: dateKey > todayKey,
      isPast: dateKey < todayKey,
    });
  }

  return days;
}

export interface DayWorkoutSummary {
  sessionId: string;
  routineId: string;
  routineName: string;
  status: WorkoutSessionStatus;
  startedAt: string;
  completedAt: string | null;
  formattedTime: string; // e.g. "9:15 AM"
  durationMinutes: number;
  formattedDuration: string; // e.g. "42 min"
  totalSets: number;
  totalVolume: number;
  formattedVolume: string; // e.g. "8,420 lb"
  prCount: number;
  notes?: string | null;
}

export interface CalendarMonthData {
  year: number;
  month: number;
  formattedMonthYear: string;
  days: CalendarDay[];
  daysWithCompletedWorkouts: Set<string>;
  daysWithInProgressWorkouts: Set<string>;
  daysWithSkippedWorkouts: Set<string>;
  daysWithAlternatives: Set<string>;
  sessionsByDate: Map<string, DayWorkoutSummary[]>;
  skipsByDate: Map<string, WorkoutSkip>;
  alternativesByDate: Map<string, FitnessAlternative[]>;
  monthStats: {
    totalCompletedWorkouts: number;
    activeDaysCount: number;
    restDaysCount: number;
    skipsCount: number;
    alternativesCount: number;
    totalVolume: number;
    formattedTotalVolume: string;
  };
}

/**
 * Ensures strict user isolation before executing queries.
 */
function assertUserId(userId: string) {
  if (!userId || typeof userId !== "string" || userId.trim() === "") {
    throw new Error("Strict User Isolation Error: userId is required.");
  }
}

/**
 * Retrieves all calendar information and workout summaries for a given month in a single batch.
 * Guarantees O(1) cell lookup performance regardless of history depth.
 */
export async function getCalendarMonthData(
  userId: string,
  year: number,
  month: number
): Promise<CalendarMonthData> {
  assertUserId(userId);

  const days = getCalendarMonthDays(year, month);
  const formattedMonthYear = new Date(year, month, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  // Single fast query for user sessions, skips, and fitness alternatives
  const [allUserSessions, allUserSkips, allUserAlternatives] = await Promise.all([
    db.workoutSessions.where("userId").equals(userId).toArray(),
    db.skips ? db.skips.where("userId").equals(userId).toArray() : Promise.resolve([]),
    db.fitnessAlternatives
      ? db.fitnessAlternatives.where("userId").equals(userId).toArray()
      : Promise.resolve([]),
  ]);

  const sessionsByDate = new Map<string, DayWorkoutSummary[]>();
  const daysWithCompletedWorkouts = new Set<string>();
  const daysWithInProgressWorkouts = new Set<string>();
  const daysWithSkippedWorkouts = new Set<string>();
  const daysWithAlternatives = new Set<string>();
  const skipsByDate = new Map<string, WorkoutSkip>();
  const alternativesByDate = new Map<string, FitnessAlternative[]>();

  let skipsInMonth = 0;
  for (const skip of allUserSkips) {
    if (skip.isDeleted || skip.supersededBySessionId) continue;
    skipsByDate.set(skip.dateKey, skip);
    daysWithSkippedWorkouts.add(skip.dateKey);
    const { year: skYear, month: skMonth } = parseLocalDateKey(skip.dateKey);
    if (skYear === year && skMonth === month + 1) {
      skipsInMonth++;
    }
  }

  let alternativesInMonth = 0;
  for (const alt of allUserAlternatives) {
    if (alt.isDeleted) continue;
    const list = alternativesByDate.get(alt.dateKey) || [];
    list.push(alt);
    alternativesByDate.set(alt.dateKey, list);
    daysWithAlternatives.add(alt.dateKey);
    const { year: aYear, month: aMonth } = parseLocalDateKey(alt.dateKey);
    if (aYear === year && aMonth === month + 1) {
      alternativesInMonth++;
    }
  }

  let totalCompletedWorkoutsInMonth = 0;
  let totalVolumeInMonth = 0;

  // Track dates within the active month that had completed workouts
  const activeMonthDaysWithWorkout = new Set<string>();

  for (const session of allUserSessions) {
    if (session.status === "cancelled") continue;

    const dateKey = getLocalDateKey(session.startedAt);
    const { year: sYear, month: sMonth } = parseLocalDateKey(dateKey);

    const isTargetMonth = sYear === year && sMonth === month + 1;

    // Load sets for volume, count, and PR evaluation
    const sets = await getUserSetsForSession(userId, session.id);
    const durationMinutes = calculateWorkoutDuration(
      session.startedAt,
      session.completedAt
    );
    const volume = calculateWorkoutVolume(sets);

    let prCount = 0;
    if (session.status === "completed") {
      const prs = await getSessionPRs(userId, session, sets);
      prCount = prs.length;
    }

    const startDate = new Date(session.startedAt);
    const formattedTime = startDate.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    const summary: DayWorkoutSummary = {
      sessionId: session.id,
      routineId: session.routineId,
      routineName: session.routineName || "Workout",
      status: session.status,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      formattedTime,
      durationMinutes,
      formattedDuration: formatWorkoutDuration(durationMinutes, false),
      totalSets: sets.length,
      totalVolume: volume,
      formattedVolume: formatWorkoutVolume(volume),
      prCount,
      notes: session.notes,
    };

    const existingList = sessionsByDate.get(dateKey) || [];
    existingList.push(summary);
    sessionsByDate.set(dateKey, existingList);

    if (session.status === "completed") {
      daysWithCompletedWorkouts.add(dateKey);
      if (isTargetMonth) {
        totalCompletedWorkoutsInMonth++;
        totalVolumeInMonth += volume;
        activeMonthDaysWithWorkout.add(dateKey);
      }
    } else if (session.status === "in_progress") {
      daysWithInProgressWorkouts.add(dateKey);
    }
  }

  // Calculate elapsed days in the target month up to today
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
  const isPastMonth = year < today.getFullYear() || (year === today.getFullYear() && month < today.getMonth());
  const isFutureMonth = year > today.getFullYear() || (year === today.getFullYear() && month > today.getMonth());

  let elapsedDaysInMonth = 0;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  if (isPastMonth) {
    elapsedDaysInMonth = daysInMonth;
  } else if (isCurrentMonth) {
    elapsedDaysInMonth = today.getDate();
  } else {
    elapsedDaysInMonth = 0;
  }

  const activeDaysCount = activeMonthDaysWithWorkout.size;
  const restDaysCount = isFutureMonth
    ? 0
    : Math.max(0, elapsedDaysInMonth - activeDaysCount);

  return {
    year,
    month,
    formattedMonthYear,
    days,
    daysWithCompletedWorkouts,
    daysWithInProgressWorkouts,
    daysWithSkippedWorkouts,
    daysWithAlternatives,
    sessionsByDate,
    skipsByDate,
    alternativesByDate,
    monthStats: {
      totalCompletedWorkouts: totalCompletedWorkoutsInMonth,
      activeDaysCount,
      restDaysCount,
      skipsCount: skipsInMonth,
      alternativesCount: alternativesInMonth,
      totalVolume: totalVolumeInMonth,
      formattedTotalVolume: formatWorkoutVolume(totalVolumeInMonth),
    },
  };
}
