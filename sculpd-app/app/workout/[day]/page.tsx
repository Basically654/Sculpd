// app/workout/[day]/page.tsx
import { supabase } from "@/lib/supabase";
import ExerciseCard from "@/components/workout/ExerciseCard";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function WorkoutPage({
  params,
}: {
  params: Promise<{ day: string }>;
}) {
  const { day } = await params;
  const lowercaseDay = day.toLowerCase().trim();

  // 1. Get the Day Container Metadata
  const { data: routineDay, error: dayError } = await supabase
    .from("routine_days")
    .select("id, day_name, focus_target")
    .eq("day_name", lowercaseDay)
    .maybeSingle();

  if (dayError || !routineDay) {
    return <div className="p-4 text-red-400">Day not found.</div>;
  }

  // 2. Fetch Exercises
  const { data: exercises, error: exerciseError } = await supabase
    .from("exercises")
    .select("id, name, target_sets, target_reps, coaching_cue, display_order")
    .eq("routine_day_id", routineDay.id);

  if (exerciseError || !exercises)
    return <div className="p-4">No exercises found.</div>;

  const sortedExercises = [...exercises].sort(
    (a, b) => a.display_order - b.display_order,
  );
  const exerciseIds = sortedExercises.map((ex) => ex.id);

  // 3. Fetch History for Charts
  const { data: historicalLogs } = await supabase
    .from("set_logs")
    .select("exercise_id, weight, reps, created_at")
    .in("exercise_id", exerciseIds)
    .order("created_at", { ascending: true }); // Chronological order

  // Map history to { id: [{ date, weight, reps }, ...] }
  const historyMap: Record<
    string,
    Array<{
      date: string;
      weight: number;
      reps: number;
      sets: Array<{ w: number; r: number }>;
    }>
  > = {};

  (historicalLogs || []).forEach((log: any) => {
    if (!historyMap[log.exercise_id]) historyMap[log.exercise_id] = [];

    const date = new Date(log.created_at).toLocaleDateString("en-US", {
      month: "numeric",
      day: "numeric",
    });
    const existing = historyMap[log.exercise_id].find((e) => e.date === date);

    if (existing) {
      existing.reps = Math.max(existing.reps, Number(log.reps));
      existing.weight = Math.max(existing.weight, Number(log.weight));
      existing.sets.push({ w: Number(log.weight), r: Number(log.reps) });
    } else {
      historyMap[log.exercise_id].push({
        date,
        weight: Number(log.weight),
        reps: Number(log.reps),
        sets: [{ w: Number(log.weight), r: Number(log.reps) }],
      });
    }
  });

  return (
    <main className="min-h-screen bg-black text-white p-4 pb-32 overflow-y-auto">
      <header className="mb-6 pt-2 flex items-center gap-3">
        <Link
          href="/"
          className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
            stroke="currentColor"
            className="w-4 h-4"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 19.5L8.25 12l7.5-7.5"
            />
          </svg>
        </Link>
        <div>
          <h1 className="text-xl font-black uppercase leading-none">
            {routineDay.day_name}
          </h1>
          <p className="text-[11px] font-bold text-emerald-400 mt-1 uppercase">
            {routineDay.focus_target}
          </p>
        </div>
      </header>

      <div className="space-y-4">
        {sortedExercises.map((exercise) => (
          <ExerciseCard
            key={exercise.id}
            exercise={exercise}
            history={historyMap[exercise.id] || []}
          />
        ))}
      </div>
    </main>
  );
}
