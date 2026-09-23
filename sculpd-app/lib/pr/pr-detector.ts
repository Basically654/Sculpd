// lib/pr/pr-detector.ts
import { WorkoutSet } from "@/types/models";
import { getEffectiveLoad, formatSetLoad } from "@/lib/load/load-utils";

export interface PRResult {
  isPR: boolean;
  exerciseName?: string;
  current?: {
    weight: number;
    reps: number;
    displayText?: string;
    bodyweight?: number | null;
    addedWeight?: number | null;
  };
  previous?: {
    weight: number;
    reps: number;
    displayText?: string;
    bodyweight?: number | null;
    addedWeight?: number | null;
  };
  badgeText?: string;
  prType?: "weight" | "reps" | "1rm";
}

/**
 * Calculates Estimated 1-Rep Max (E1RM) using the Epley formula.
 */
export function calculateE1RM(weight: number, reps: number): number {
  if (reps <= 1) return weight;
  return weight * (1 + reps / 30);
}

/**
 * Strictly evaluates whether a newly logged set is a legitimate Personal Record.
 *
 * Requirements:
 * 1. Ordinary sets, warmups, and submaximal sets are NOT PRs.
 * 2. First time ever logging an exercise is establishing a baseline, NOT a PR.
 * 3. A legitimate PR requires:
 *    - All-Time Weight PR: Heavier effective load than EVER lifted before for this exercise.
 *    - Rep PR at Weight: More reps than ever achieved at this specific effective load.
 *    - Estimated 1RM PR: Higher calculated 1RM than prior best (within working weight ≥ 90% of max weight).
 */
export function detectPersonalRecord(
  currentSet: {
    weight: number;
    reps: number;
    bodyweight?: number | null;
    addedWeight?: number | null;
  },
  exerciseName: string,
  priorSets: WorkoutSet[],
  isBodyweight?: boolean
): PRResult {
  // 1. Must have prior sets to beat; baseline sets are not PR celebrations
  if (!priorSets || priorSets.length === 0) {
    return { isPR: false };
  }

  const isBW =
    isBodyweight ||
    (typeof currentSet.bodyweight === "number" && currentSet.bodyweight > 0) ||
    priorSets.some(
      (s) => typeof s.bodyweight === "number" && s.bodyweight > 0
    );

  const validPriorSets = priorSets.filter((s) => {
    if (s.reps <= 0) return false;
    if (isBW) return true;
    return s.weight > 0;
  });

  if (validPriorSets.length === 0) {
    return { isPR: false };
  }

  const currentWeight = currentSet.weight;
  const currentReps = currentSet.reps;
  const currentEffective = getEffectiveLoad(currentSet);

  if (currentReps <= 0) {
    return { isPR: false };
  }

  if (!isBW && currentWeight <= 0) {
    return { isPR: false };
  }

  const currentE1RM = calculateE1RM(currentEffective, currentReps);

  // Find all-time prior max effective weight and the set where it occurred
  const sortedByEffective = [...validPriorSets].sort(
    (a, b) => getEffectiveLoad(b) - getEffectiveLoad(a)
  );
  const maxPriorSet = sortedByEffective[0];
  const maxPriorEffective = getEffectiveLoad(maxPriorSet);

  // Find all-time prior best E1RM
  let bestPriorE1RMSet = validPriorSets[0];
  let bestPriorE1RM = calculateE1RM(
    getEffectiveLoad(bestPriorE1RMSet),
    bestPriorE1RMSet.reps
  );

  for (const set of validPriorSets) {
    const e1rm = calculateE1RM(getEffectiveLoad(set), set.reps);
    if (e1rm > bestPriorE1RM) {
      bestPriorE1RM = e1rm;
      bestPriorE1RMSet = set;
    }
  }

  // 1. All-Time Weight PR: Current effective weight strictly exceeds all-time highest weight ever logged
  if (currentEffective > maxPriorEffective) {
    const diff = Math.round(currentEffective - maxPriorEffective);
    return {
      isPR: true,
      exerciseName,
      prType: "weight",
      current: {
        weight: currentWeight,
        reps: currentReps,
        displayText: formatSetLoad(currentSet, isBW),
        bodyweight: currentSet.bodyweight,
        addedWeight: currentSet.addedWeight,
      },
      previous: {
        weight: maxPriorSet.weight,
        reps: maxPriorSet.reps,
        displayText: formatSetLoad(maxPriorSet, isBW),
        bodyweight: maxPriorSet.bodyweight,
        addedWeight: maxPriorSet.addedWeight,
      },
      badgeText: `+${diff} lbs`,
    };
  }

  // 2. Rep PR at Same Weight: More reps at this exact effective weight than prior best at this weight
  const priorSetsAtSameWeight = validPriorSets.filter(
    (s) => Math.abs(getEffectiveLoad(s) - currentEffective) < 0.01
  );
  if (priorSetsAtSameWeight.length > 0) {
    const maxRepsAtThisWeight = Math.max(
      ...priorSetsAtSameWeight.map((s) => s.reps)
    );
    if (currentReps > maxRepsAtThisWeight) {
      return {
        isPR: true,
        exerciseName,
        prType: "reps",
        current: {
          weight: currentWeight,
          reps: currentReps,
          displayText: formatSetLoad(currentSet, isBW),
          bodyweight: currentSet.bodyweight,
          addedWeight: currentSet.addedWeight,
        },
        previous: {
          weight: currentWeight,
          reps: maxRepsAtThisWeight,
          displayText: formatSetLoad(
            { ...currentSet, reps: maxRepsAtThisWeight },
            isBW
          ),
          bodyweight: currentSet.bodyweight,
          addedWeight: currentSet.addedWeight,
        },
        badgeText: `+${currentReps - maxRepsAtThisWeight} reps`,
      };
    }
  }

  // 3. Estimated 1RM PR: Higher calculated 1RM than any prior set
  // Guard: Current weight must be a legitimate working weight (≥ 90% of maxPriorEffective)
  if (
    currentE1RM > bestPriorE1RM + 1.0 &&
    currentEffective >= maxPriorEffective * 0.9
  ) {
    return {
      isPR: true,
      exerciseName,
      prType: "1rm",
      current: {
        weight: currentWeight,
        reps: currentReps,
        displayText: formatSetLoad(currentSet, isBW),
        bodyweight: currentSet.bodyweight,
        addedWeight: currentSet.addedWeight,
      },
      previous: {
        weight: bestPriorE1RMSet.weight,
        reps: bestPriorE1RMSet.reps,
        displayText: formatSetLoad(bestPriorE1RMSet, isBW),
        bodyweight: bestPriorE1RMSet.bodyweight,
        addedWeight: bestPriorE1RMSet.addedWeight,
      },
      badgeText: `PR E1RM`,
    };
  }

  return { isPR: false };
}
