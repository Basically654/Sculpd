// lib/pr/pr-detector.ts
import { WorkoutSet } from "@/types/models";

export interface PRResult {
  isPR: boolean;
  exerciseName?: string;
  current?: { weight: number; reps: number };
  previous?: { weight: number; reps: number };
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
 *    - All-Time Weight PR: Heavier weight than EVER lifted before for this exercise.
 *    - Rep PR at Weight: More reps than ever achieved at this specific weight.
 *    - Estimated 1RM PR: Higher calculated 1RM than prior best (within working weight ≥ 90% of max weight).
 */
export function detectPersonalRecord(
  currentSet: { weight: number; reps: number },
  exerciseName: string,
  priorSets: WorkoutSet[]
): PRResult {
  // 1. Must have prior sets to beat; baseline sets are not PR celebrations
  if (!priorSets || priorSets.length === 0) {
    return { isPR: false };
  }

  const validPriorSets = priorSets.filter(
    (s) => s.weight > 0 && s.reps > 0
  );

  if (validPriorSets.length === 0) {
    return { isPR: false };
  }

  const currentWeight = currentSet.weight;
  const currentReps = currentSet.reps;

  if (currentWeight <= 0 || currentReps <= 0) {
    return { isPR: false };
  }

  const currentE1RM = calculateE1RM(currentWeight, currentReps);

  // Find all-time prior max weight and the set where it occurred
  const sortedByWeight = [...validPriorSets].sort((a, b) => b.weight - a.weight);
  const maxPriorWeightSet = sortedByWeight[0];
  const maxPriorWeight = maxPriorWeightSet.weight;

  // Find all-time prior best E1RM
  let bestPriorE1RMSet = validPriorSets[0];
  let bestPriorE1RM = calculateE1RM(bestPriorE1RMSet.weight, bestPriorE1RMSet.reps);

  for (const set of validPriorSets) {
    const e1rm = calculateE1RM(set.weight, set.reps);
    if (e1rm > bestPriorE1RM) {
      bestPriorE1RM = e1rm;
      bestPriorE1RMSet = set;
    }
  }

  // 1. All-Time Weight PR: Current weight strictly exceeds all-time highest weight ever logged
  if (currentWeight > maxPriorWeight) {
    return {
      isPR: true,
      exerciseName,
      prType: "weight",
      current: { weight: currentWeight, reps: currentReps },
      previous: { weight: maxPriorWeightSet.weight, reps: maxPriorWeightSet.reps },
      badgeText: `+${currentWeight - maxPriorWeight} lbs`,
    };
  }

  // 2. Rep PR at Same Weight: More reps at this exact weight than prior best at this weight
  const priorSetsAtSameWeight = validPriorSets.filter(
    (s) => s.weight === currentWeight
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
        current: { weight: currentWeight, reps: currentReps },
        previous: { weight: currentWeight, reps: maxRepsAtThisWeight },
        badgeText: `+${currentReps - maxRepsAtThisWeight} reps`,
      };
    }
  }

  // 3. Estimated 1RM PR: Higher calculated 1RM than any prior set
  // Guard: Current weight must be a legitimate working weight (≥ 90% of maxPriorWeight)
  if (
    currentE1RM > bestPriorE1RM + 1.0 &&
    currentWeight >= maxPriorWeight * 0.9
  ) {
    return {
      isPR: true,
      exerciseName,
      prType: "1rm",
      current: { weight: currentWeight, reps: currentReps },
      previous: { weight: bestPriorE1RMSet.weight, reps: bestPriorE1RMSet.reps },
      badgeText: `PR E1RM`,
    };
  }

  return { isPR: false };
}
