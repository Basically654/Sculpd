// lib/db/routine-repository.ts
import { db } from "./index";
import { Routine, Exercise } from "@/types/models";

/**
 * Standard default catalog data for Sculp'd routines and exercises.
 * Uses deterministic UUIDs so they are consistent across sessions and sync.
 */
export const DEFAULT_ROUTINES: Routine[] = [
  {
    id: "rtn_monday_glutes_calves",
    slug: "monday",
    dayName: "Monday",
    focusTarget: "Glute Focus (Upper & Side) + Calves",
    color: "from-emerald-500/20 to-zinc-900",
    displayOrder: 1,
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "rtn_tuesday_upper_abs",
    slug: "tuesday",
    dayName: "Tuesday",
    focusTarget: "Upper Body (Hourglass Balance) + Abs",
    color: "from-blue-500/10 to-zinc-900",
    displayOrder: 2,
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "rtn_wednesday_quad_calves",
    slug: "wednesday",
    dayName: "Wednesday",
    focusTarget: "Quad & Hip Focus + Calves",
    color: "from-amber-500/10 to-zinc-900",
    displayOrder: 3,
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "rtn_thursday_recovery_core",
    slug: "thursday",
    dayName: "Thursday",
    focusTarget: "Active Recovery, Core, & Lower Back",
    color: "from-purple-500/10 to-zinc-900",
    displayOrder: 4,
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "rtn_friday_lower_posterior",
    slug: "friday",
    dayName: "Friday",
    focusTarget: "Full Lower Body (Posterior Chain) + Calves",
    color: "from-rose-500/10 to-zinc-900",
    displayOrder: 5,
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

export const DEFAULT_EXERCISES: Exercise[] = [
  // Monday: Glute Focus + Calves
  {
    id: "ex_mon_01_hip_thrust",
    routineId: "rtn_monday_glutes_calves",
    name: "Barbell Hip Thrust",
    targetSets: 3,
    targetReps: "8-10",
    coachingCue: "Drive through heels, pause 1s at top lockout, chin tucked",
    displayOrder: 1,
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "ex_mon_02_rdl",
    routineId: "rtn_monday_glutes_calves",
    name: "Romanian Deadlift (Dumbbell)",
    targetSets: 3,
    targetReps: "10-12",
    coachingCue: "Hinge hips back, feel deep stretch in hamstrings and glutes",
    displayOrder: 2,
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "ex_mon_03_kickback",
    routineId: "rtn_monday_glutes_calves",
    name: "Cable Glute Kickback",
    targetSets: 3,
    targetReps: "12-15",
    coachingCue: "Squeeze upper glute at peak contraction, avoid arching lower back",
    displayOrder: 3,
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "ex_mon_04_calf_raise",
    routineId: "rtn_monday_glutes_calves",
    name: "Standing Calf Raise",
    targetSets: 4,
    targetReps: "12-15",
    coachingCue: "Full dorsiflexion stretch at bottom, 2s hold at peak extension",
    displayOrder: 4,
    updatedAt: "2026-01-01T00:00:00.000Z",
  },

  // Tuesday: Upper Body + Abs
  {
    id: "ex_tue_01_incline_press",
    routineId: "rtn_tuesday_upper_abs",
    name: "Incline Dumbbell Bench Press",
    targetSets: 3,
    targetReps: "8-10",
    coachingCue: "Retract scapulae, 30-degree incline, controlled lower",
    displayOrder: 1,
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "ex_tue_02_lat_pulldown",
    routineId: "rtn_tuesday_upper_abs",
    name: "Neutral Grip Lat Pulldown",
    targetSets: 3,
    targetReps: "10-12",
    coachingCue: "Drive elbows down to hips, squeeze lats, resist eccentric",
    displayOrder: 2,
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "ex_tue_03_lateral_raise",
    routineId: "rtn_tuesday_upper_abs",
    name: "Dumbbell Lateral Raise",
    targetSets: 4,
    targetReps: "12-15",
    coachingCue: "Slight forward torso lean, raise in scapular plane, lead with elbows",
    displayOrder: 3,
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "ex_tue_04_hanging_knee",
    routineId: "rtn_tuesday_upper_abs",
    name: "Hanging Knee Raise",
    targetSets: 3,
    targetReps: "12-15",
    coachingCue: "Roll pelvis up toward sternum, avoid swinging",
    displayOrder: 4,
    updatedAt: "2026-01-01T00:00:00.000Z",
  },

  // Wednesday: Quad & Hip Focus + Calves
  {
    id: "ex_wed_01_leg_press",
    routineId: "rtn_wednesday_quad_calves",
    name: "Leg Press",
    targetSets: 3,
    targetReps: "10-12",
    coachingCue: "Feet mid-platform, deep knee bend without pelvis tucking",
    displayOrder: 1,
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "ex_wed_02_bulgarian_squat",
    routineId: "rtn_wednesday_quad_calves",
    name: "Bulgarian Split Squat",
    targetSets: 3,
    targetReps: "8-10",
    coachingCue: "Control descent, torso braced, drive through front foot mid-stance",
    displayOrder: 2,
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "ex_wed_03_leg_extension",
    routineId: "rtn_wednesday_quad_calves",
    name: "Leg Extension",
    targetSets: 3,
    targetReps: "12-15",
    coachingCue: "Pause 1s at top contraction, 3-second negative",
    displayOrder: 3,
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "ex_wed_04_seated_calf",
    routineId: "rtn_wednesday_quad_calves",
    name: "Seated Calf Raise",
    targetSets: 4,
    targetReps: "15-20",
    coachingCue: "Isolate soleus, deep stretch, pause before driving up",
    displayOrder: 4,
    updatedAt: "2026-01-01T00:00:00.000Z",
  },

  // Thursday: Active Recovery, Core, & Lower Back
  {
    id: "ex_thu_01_hyperextension",
    routineId: "rtn_thursday_recovery_core",
    name: "Hyperextension (45° Back Extension)",
    targetSets: 3,
    targetReps: "12-15",
    coachingCue: "Hinge at hips, neutral lumbar, squeeze glutes at top",
    displayOrder: 1,
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "ex_thu_02_cable_woodchop",
    routineId: "rtn_thursday_recovery_core",
    name: "Cable Woodchopper",
    targetSets: 3,
    targetReps: "12-15",
    coachingCue: "Brace obliques, rotate through thoracic spine",
    displayOrder: 2,
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "ex_thu_03_plank_hold",
    routineId: "rtn_thursday_recovery_core",
    name: "Forearm Plank Hold",
    targetSets: 3,
    targetReps: "45-60s",
    coachingCue: "Posterior pelvic tilt, glutes clenched, active floor push",
    displayOrder: 3,
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "ex_thu_04_hanging_leg_raise",
    routineId: "rtn_thursday_recovery_core",
    name: "Hanging Leg Raise",
    targetSets: 3,
    targetReps: "10-12",
    coachingCue: "Strict tempo, lift legs to 90°, control lowering",
    displayOrder: 4,
    updatedAt: "2026-01-01T00:00:00.000Z",
  },

  // Friday: Full Lower Body (Posterior Chain) + Calves
  {
    id: "ex_fri_01_deadlift",
    routineId: "rtn_friday_lower_posterior",
    name: "Barbell / Trap Bar Deadlift",
    targetSets: 3,
    targetReps: "6-8",
    coachingCue: "Pack lats, wedge hips, push floor away through midfoot",
    displayOrder: 1,
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "ex_fri_02_seated_leg_curl",
    routineId: "rtn_friday_lower_posterior",
    name: "Seated Leg Curl",
    targetSets: 3,
    targetReps: "10-12",
    coachingCue: "Dorsiflex ankles, 2s squeeze at peak contraction",
    displayOrder: 2,
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "ex_fri_03_walking_lunge",
    routineId: "rtn_friday_lower_posterior",
    name: "Walking Dumbbell Lunge",
    targetSets: 3,
    targetReps: "10/leg",
    coachingCue: "Upright chest, long stride for posterior chain focus",
    displayOrder: 3,
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "ex_fri_04_donkey_calf",
    routineId: "rtn_friday_lower_posterior",
    name: "Leg Press Calf Extension",
    targetSets: 4,
    targetReps: "15",
    coachingCue: "Full stretch on balls of feet, explosive calf contraction",
    displayOrder: 4,
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

/**
 * Seeds default routines and exercises into IndexedDB if table is empty.
 * Idempotent and safe to call on app startup.
 */
export async function seedDefaultCatalog(): Promise<void> {
  const routineCount = await db.routines.count();
  if (routineCount === 0) {
    await db.transaction("rw", [db.routines, db.exercises], async () => {
      await db.routines.bulkPut(DEFAULT_ROUTINES);
      await db.exercises.bulkPut(DEFAULT_EXERCISES);
    });
  }
}

/**
 * Retrieves all routines from IndexedDB ordered by displayOrder.
 * Ensures catalog is seeded first.
 */
export async function getAllRoutines(): Promise<Routine[]> {
  await seedDefaultCatalog();
  return db.routines.orderBy("displayOrder").toArray();
}

/**
 * Retrieves a single routine by its slug (e.g. "monday", "tuesday").
 */
export async function getRoutineBySlug(
  slug: string
): Promise<Routine | undefined> {
  await seedDefaultCatalog();
  const normalized = slug.toLowerCase().trim();
  return db.routines.where("slug").equals(normalized).first();
}

/**
 * Retrieves a single routine by its UUID/id.
 */
export async function getRoutineById(
  id: string
): Promise<Routine | undefined> {
  await seedDefaultCatalog();
  return db.routines.get(id);
}

/**
 * Retrieves all exercises associated with a specific routine, ordered by displayOrder.
 */
export async function getExercisesForRoutine(
  routineId: string
): Promise<Exercise[]> {
  await seedDefaultCatalog();
  return db.exercises
    .where("routineId")
    .equals(routineId)
    .sortBy("displayOrder");
}

/**
 * Retrieves a single exercise by its id.
 */
export async function getExerciseById(
  exerciseId: string
): Promise<Exercise | undefined> {
  await seedDefaultCatalog();
  return db.exercises.get(exerciseId);
}
