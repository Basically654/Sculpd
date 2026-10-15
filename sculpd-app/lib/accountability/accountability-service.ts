// lib/accountability/accountability-service.ts
import { db } from "@/lib/db";
import {
  WorkoutSkip,
  FitnessAlternative,
  FitnessAlternativeType,
  SkipType,
  Routine,
} from "@/types/models";
import { generateUUID } from "@/lib/crypto/uuid";
import { getLocalDateKey } from "@/lib/calendar/calendar-service";
import { ensureDbOpen } from "@/lib/db/transaction";
import { getUserRoutines } from "@/lib/db/routine-repository";

export const FREE_SKIPS_PER_MONTH = 3;
export const MIN_ALTERNATIVE_MINUTES = 20;

/**
 * Ensures strict user isolation by verifying userId is non-empty.
 */
function assertUserId(userId: string) {
  if (!userId || typeof userId !== "string" || userId.trim() === "") {
    throw new Error("Strict User Isolation Error: userId is required.");
  }
}

/**
 * Returns the current local month key (e.g. "2026-10") based on local time.
 */
export function getLocalMonthKey(dateInput: string | Date | number = new Date()): string {
  const dateKey = getLocalDateKey(dateInput);
  return dateKey.slice(0, 7); // "YYYY-MM"
}

export interface MonthlyAccountabilitySummary {
  monthKey: string; // e.g. "2026-10"
  formattedMonth: string; // e.g. "October 2026"
  freeSkipsTotal: number; // 3
  freeSkipsUsed: number;
  freeSkipsRemaining: number;
  earnedSkipsTotal: number;
  earnedSkipsUsed: number;
  earnedSkipsAvailable: number;
  totalSkipsAvailable: number; // freeSkipsRemaining + earnedSkipsAvailable
  skipsThisMonth: WorkoutSkip[];
  alternativesThisMonth: FitnessAlternative[];
}

/**
 * Computes the accountability allowance and summary for a given user and month.
 *
 * Rules:
 * 1. Each user begins each calendar month with 3 free skips.
 * 2. Unused free skips expire at month-end and do NOT roll over.
 * 3. Earned skips (from completed fitness alternatives >= 20 mins) carry forward until used.
 * 4. Free skips are consumed first; earned skips are consumed only when free skips are 0.
 */
export async function getMonthlyAccountabilitySummary(
  userId: string,
  targetDate: string | Date = new Date()
): Promise<MonthlyAccountabilitySummary> {
  assertUserId(userId);
  await ensureDbOpen();

  const monthKey = getLocalMonthKey(targetDate);
  const [yearStr, monthStr] = monthKey.split("-");
  const monthDate = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 1);
  const formattedMonth = monthDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  // Query all user skips
  const allUserSkips = await db.skips
    .where("userId")
    .equals(userId)
    .toArray();

  const activeSkips = allUserSkips.filter((s) => !s.isDeleted && !s.supersededBySessionId);

  // Free skips used in the target calendar month
  const freeSkipsUsedThisMonth = activeSkips.filter(
    (s) => s.monthKey === monthKey && s.skipType === "free"
  ).length;

  const freeSkipsRemaining = Math.max(0, FREE_SKIPS_PER_MONTH - freeSkipsUsedThisMonth);

  // Earned skips across all time: Each eligible alternative (duration >= 20m) yields 1 earned skip
  const allUserAlternatives = await db.fitnessAlternatives
    .where("userId")
    .equals(userId)
    .toArray();

  const eligibleAlternatives = allUserAlternatives.filter(
    (a) => !a.isDeleted && a.skipEarned
  );

  const totalEarnedSkips = eligibleAlternatives.length;

  // Earned skips used across all time
  const totalEarnedSkipsUsed = activeSkips.filter((s) => s.skipType === "earned").length;

  const earnedSkipsAvailable = Math.max(0, totalEarnedSkips - totalEarnedSkipsUsed);

  // Filter lists for the target month
  const skipsThisMonth = activeSkips
    .filter((s) => s.monthKey === monthKey)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const alternativesThisMonth = allUserAlternatives
    .filter((a) => !a.isDeleted && a.dateKey.startsWith(monthKey))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    monthKey,
    formattedMonth,
    freeSkipsTotal: FREE_SKIPS_PER_MONTH,
    freeSkipsUsed: freeSkipsUsedThisMonth,
    freeSkipsRemaining,
    earnedSkipsTotal: totalEarnedSkips,
    earnedSkipsUsed: totalEarnedSkipsUsed,
    earnedSkipsAvailable,
    totalSkipsAvailable: freeSkipsRemaining + earnedSkipsAvailable,
    skipsThisMonth,
    alternativesThisMonth,
  };
}

/**
 * Checks whether a specific date corresponds to a planned workout routine for the user.
 * Matches on routine dayName (e.g. "Monday", "Tuesday") or weekday name.
 */
export async function isPlannedWorkoutDay(
  userId: string,
  dateKey: string
): Promise<{ isPlanned: boolean; routine?: Routine; routineName?: string }> {
  assertUserId(userId);
  await ensureDbOpen();

  const [y, m, d] = dateKey.split("-").map(Number);
  const targetDate = new Date(y, m - 1, d);
  const weekdayName = targetDate.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
  const shortWeekday = targetDate.toLocaleDateString("en-US", { weekday: "short" }).toLowerCase();

  const routines = await getUserRoutines(userId);
  if (routines.length === 0) {
    return { isPlanned: false };
  }

  // Find routine configured for this day of the week
  const matchedRoutine = routines.find((r: any) => {
    if (Array.isArray(r.daysOfWeek) && r.daysOfWeek.length > 0) {
      if (
        r.daysOfWeek.some((day: string) => {
          const dLower = String(day).toLowerCase();
          return dLower.includes(weekdayName) || dLower.includes(shortWeekday);
        })
      ) {
        return true;
      }
    }
    if (r.dayName && (r.dayName.toLowerCase().includes(weekdayName) || r.dayName.toLowerCase().includes(shortWeekday))) return true;
    if (r.slug && (r.slug.toLowerCase().includes(weekdayName) || r.slug.toLowerCase().includes(shortWeekday))) return true;
    if (r.name && (r.name.toLowerCase().includes(weekdayName) || r.name.toLowerCase().includes(shortWeekday))) return true;
    return false;
  });

  if (matchedRoutine) {
    return {
      isPlanned: true,
      routine: matchedRoutine,
      routineName: matchedRoutine.name || matchedRoutine.dayName,
    };
  }

  // Check if routines in general have day schedules defined
  const hasAnyDaySchedule = routines.some((r: any) => {
    if (Array.isArray(r.daysOfWeek) && r.daysOfWeek.length > 0) return true;
    if (r.dayName) return true;
    const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    if (r.slug && weekdays.some((w) => r.slug.toLowerCase().includes(w))) return true;
    if (r.name && weekdays.some((w) => r.name.toLowerCase().includes(w))) return true;
    return false;
  });

  if (hasAnyDaySchedule) {
    return { isPlanned: false };
  }

  // If user has routines but none specifically scheduled with weekdays, any day can default to planned
  return {
    isPlanned: true,
    routine: routines[0],
    routineName: routines[0].name || routines[0].dayName || "Workout",
  };
}

/**
 * Explicitly records a skip on a planned workout day.
 *
 * Requirements:
 * - Must be an explicit user action (never automatic).
 * - Cannot skip the same day more than once.
 * - Deducts from monthly free allowance (3/month) first, then from carried-over earned skips.
 * - Throws a clear, informative error if no skips are available.
 */
export async function recordWorkoutSkip(
  userId: string,
  options: {
    dateKey: string;
    routineId?: string;
    routineName?: string;
    reason?: string;
  }
): Promise<WorkoutSkip> {
  assertUserId(userId);
  await ensureDbOpen();

  const { dateKey, routineId, routineName, reason } = options;

  // 1. Check if this date already has an active skip
  const existingSkips = await db.skips
    .where("[userId+dateKey]")
    .equals([userId, dateKey])
    .toArray();

  const activeExisting = existingSkips.find((s) => !s.isDeleted && !s.supersededBySessionId);
  if (activeExisting) {
    throw new Error(`Date ${dateKey} is already marked as skipped.`);
  }

  // 2. Check skip allowance
  const summary = await getMonthlyAccountabilitySummary(userId, dateKey);
  let skipType: SkipType;

  if (summary.freeSkipsRemaining > 0) {
    skipType = "free";
  } else if (summary.earnedSkipsAvailable > 0) {
    skipType = "earned";
  } else {
    throw new Error(
      "No skips available for this month. Complete a fitness alternative (e.g. 20+ min walk) to earn an extra skip."
    );
  }

  const nowIso = new Date().toISOString();
  const monthKey = dateKey.slice(0, 7);

  const skipRecord: WorkoutSkip = {
    id: generateUUID(),
    userId,
    dateKey,
    monthKey,
    routineId,
    routineName: routineName || "Planned Workout",
    skipType,
    reason: reason?.trim() || undefined,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  await db.skips.put(skipRecord);

  // Queue mutation for cloud sync
  await db.syncQueue.put({
    id: generateUUID(),
    userId,
    operation: "insert",
    collection: "skips",
    entityId: skipRecord.id,
    payload: skipRecord,
    timestamp: Date.now(),
    status: "pending",
    attempts: 0,
  });

  return skipRecord;
}

/**
 * Cancels or un-skips a previously recorded skip, restoring the skip to the allowance pool.
 */
export async function cancelWorkoutSkip(
  userId: string,
  skipId: string
): Promise<boolean> {
  assertUserId(userId);
  await ensureDbOpen();

  const skip = await db.skips.get(skipId);
  if (!skip || skip.userId !== userId) {
    return false;
  }

  const nowIso = new Date().toISOString();
  const updated: WorkoutSkip = {
    ...skip,
    isDeleted: true,
    updatedAt: nowIso,
  };

  await db.skips.put(updated);

  await db.syncQueue.put({
    id: generateUUID(),
    userId,
    operation: "delete",
    collection: "skips",
    entityId: skip.id,
    payload: { id: skip.id, isDeleted: true },
    timestamp: Date.now(),
    status: "pending",
    attempts: 0,
  });

  return true;
}

/**
 * Logs a genuine fitness alternative (e.g. Walking, Light Cardio, Mobility, Recovery).
 *
 * Rules:
 * - If duration >= 20 mins, earns 1 extra skip (`skipEarned: true`).
 * - Kept strictly honest: Never converted to a gym workout session, never creates sets or training volume.
 */
export async function recordFitnessAlternative(
  userId: string,
  options: {
    dateKey?: string;
    activityType: FitnessAlternativeType;
    title: string;
    durationMinutes: number;
    notes?: string;
  }
): Promise<FitnessAlternative> {
  assertUserId(userId);
  await ensureDbOpen();

  const {
    dateKey = getLocalDateKey(new Date()),
    activityType,
    title,
    durationMinutes,
    notes,
  } = options;

  if (isNaN(durationMinutes) || durationMinutes <= 0) {
    throw new Error("Duration must be a positive number of minutes.");
  }

  const isEligibleForSkip = durationMinutes >= MIN_ALTERNATIVE_MINUTES;
  const nowIso = new Date().toISOString();

  const record: FitnessAlternative = {
    id: generateUUID(),
    userId,
    dateKey,
    activityType,
    type: activityType,
    title: title.trim() || getDefaultAlternativeTitle(activityType),
    durationMinutes,
    notes: notes?.trim() || undefined,
    skipEarned: isEligibleForSkip,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  await db.fitnessAlternatives.put(record);

  await db.syncQueue.put({
    id: generateUUID(),
    userId,
    operation: "insert",
    collection: "fitness_alternatives",
    entityId: record.id,
    payload: record,
    timestamp: Date.now(),
    status: "pending",
    attempts: 0,
  });

  return record;
}

/**
 * Returns human-friendly default title for activity type.
 */
export function getDefaultAlternativeTitle(type: FitnessAlternativeType): string {
  switch (type) {
    case "walking":
      return "Outdoor Walk";
    case "light_cardio":
      return "Light Cardio / Zone 2";
    case "mobility":
      return "Mobility & Stretching";
    case "recovery":
      return "Active Recovery Session";
    default:
      return "Fitness Alternative";
  }
}

/**
 * Reconciles skips when a user completes a workout session on a previously skipped date.
 * Marks the skip as superseded so the day shows as a completed workout and the user's skip is not lost.
 */
export async function handleWorkoutCompletedOnDate(
  userId: string,
  dateKey: string,
  sessionId: string = "superseded"
): Promise<void> {
  assertUserId(userId);
  await ensureDbOpen();

  const skipsOnDate = await db.skips
    .where("[userId+dateKey]")
    .equals([userId, dateKey])
    .toArray();

  const activeSkips = skipsOnDate.filter((s) => !s.isDeleted && !s.supersededBySessionId);

  for (const skip of activeSkips) {
    const updated: WorkoutSkip = {
      ...skip,
      supersededBySessionId: sessionId || "superseded",
      updatedAt: new Date().toISOString(),
    };
    await db.skips.put(updated);
  }
}
