// app/workout/edit/[id]/page.tsx
"use client";

import React from "react";
import { useParams } from "next/navigation";
import WorkoutBuilder from "@/components/workout/builder/WorkoutBuilder";

export default function EditWorkoutPage() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : "";

  if (!id) {
    return null;
  }

  return <WorkoutBuilder routineId={id} />;
}
