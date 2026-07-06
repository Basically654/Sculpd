// app/workout/actions.ts
"use server";

import { supabase } from "@/lib/supabase";
import { revalidatePath } from "next/cache";

export async function logSetAction(exerciseId: string, weight: number, reps: number, rpe?: number | null) {
  try {
    // 1. Recover or generate an active global workout container log session row
    let { data: activeLog, error: logFetchError } = await supabase
      .from("workout_logs")
      .select("id")
      .is("completed_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (logFetchError) {
      console.error("❌ SUPABASE CONTAINER FETCH ERROR:", logFetchError.message);
    }

    if (!activeLog) {
      // Create a minimal fallback log context structure bypassing strict column filters
      const { data: newLog, error: logInsertError } = await supabase
        .from("workout_logs")
        .insert([{ started_at: new Date().toISOString() }])
        .select()
        .maybeSingle();
      
      if (logInsertError) {
        console.error("❌ SUPABASE CONTAINER CREATION CRASH:", logInsertError.message);
        throw new Error(`Failed to initialize session slot: ${logInsertError.message}`);
      }
      activeLog = newLog;
    }

    if (!activeLog) {
      throw new Error("Unable to map or claim an active session container.");
    }

    // 2. Insert performance metric directly into the set tracking index
    const insertPayload: any = {
      workout_log_id: activeLog.id,
      exercise_id: exerciseId,
      weight: weight,
      reps: reps,
    };

    if (typeof rpe === "number") insertPayload.rpe = rpe;

    const { error: setInsertError } = await supabase
      .from("set_logs")
      .insert([insertPayload]);

    if (setInsertError) {
      console.error("❌ SUPABASE SET INSERTION CRASH:", setInsertError.message);
      throw new Error(`PostgreSQL Insertion rejected: ${setInsertError.message}`);
    }

    // 3. Complete system cache purge to push fresh overload telemetry live
    revalidatePath("/workout/[day]", "page");
    
  } catch (globalCatchError: any) {
    console.error("🚨 GLOBAL ACTION CRITICAL BREAKPOINT:", globalCatchError?.message || globalCatchError);
    throw globalCatchError;
  }
}