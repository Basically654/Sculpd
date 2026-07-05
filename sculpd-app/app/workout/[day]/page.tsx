import { supabase } from "@/lib/supabase";
import ExerciseCard from "@/components/workout/ExerciseCard";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface WorkoutPageProps {
  params: { day: string };
}

export default async function WorkoutPage({ params }: WorkoutPageProps) {
  const { day } = await params;
  const lowercaseDay = day.toLowerCase().trim();

  // 1. Core Lookup matching the lowercase URL string perfectly
  const { data: routineDay, error: dayError } = await supabase
    .from("routine_days")
    .select("id, day_name, focus_target")
    .eq("day_name", lowercaseDay)
    .maybeSingle();

  if (dayError || !routineDay) {
    return (
      <main className="min-h-screen bg-black text-zinc-400 p-6 font-mono text-xs flex items-center justify-center">
        <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-900 text-center space-y-2">
          <p className="text-red-400 font-bold">🚨 ROUTINE DAY DATA MISSING</p>
          <p className="text-zinc-600">Target Segment: "{lowercaseDay}"</p>
        </div>
      </main>
    );
  }

  // 2. Fetch corresponding exercises for this day
  const { data: exercises, error: exerciseError } = await supabase
    .from("exercises")
    .select("id, name, target_sets, target_reps, coaching_cue, display_order")
    .eq("routine_day_id", routineDay.id);

  if (exerciseError || !exercises || exercises.length === 0) {
    return (
      <main className="min-h-screen bg-black text-zinc-400 p-6 font-mono text-xs flex items-center justify-center">
        <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-900 text-center space-y-2">
          <p className="text-amber-400 font-bold">🚨 NO EXERCISES SEEDED</p>
          <p className="text-zinc-600">Day: {routineDay.day_name}</p>
        </div>
      </main>
    );
  }

  const sortedExercises = [...exercises].sort((a, b) => a.display_order - b.display_order);
  const exerciseIds = sortedExercises.map((ex) => ex.id);

  // 3. Fetch past progressive overload telemetry references
  const { data: historicalLogs } = await supabase
    .from("set_logs")
    .select("exercise_id, weight, reps, created_at")
    .in("exercise_id", exerciseIds)
    .order("created_at", { ascending: false });

  const historyMap = (historicalLogs || []).reduce((acc: any, log: any) => {
    if (!acc[log.exercise_id]) {
      acc[log.exercise_id] = { weight: Number(log.weight), reps: log.reps };
    }
    return acc;
  }, {});

  return (
    <main className="min-h-screen bg-black text-white p-4 pb-32 overflow-y-auto">
      
      {/* 📱 GYM WORKSPACE HEADER CONTEXT WITH BACK BUTTON NAVIGATION */}
      <header className="mb-6 pt-2 flex items-center gap-3">
        <Link 
          href="/" 
          className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 active:scale-95 transition-transform"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </Link>
        <div>
          <h1 className="text-xl font-black tracking-tight text-zinc-100 uppercase leading-none">
            {routineDay.day_name}
          </h1>
          <p className="text-[11px] font-bold text-emerald-400 mt-1 uppercase tracking-wider leading-none">
            {routineDay.focus_target}
          </p>
        </div>
      </header>

      {/* Live Workspace Grid Component */}
      <div className="space-y-4">
        {sortedExercises.map((exercise) => (
          <ExerciseCard
            key={exercise.id}
            exercise={{
              id: exercise.id,
              name: exercise.name,
              target_sets: exercise.target_sets,
              target_reps: exercise.target_reps,
              coaching_cue: exercise.coaching_cue
            }}
            previousData={historyMap[exercise.id]}
          />
        ))}
      </div>
    </main>
  );
}