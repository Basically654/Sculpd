// app/workout/[day]/page.tsx
import WorkoutScreen from "@/components/workout/WorkoutScreen";

interface WorkoutPageProps {
  params: Promise<{ day: string }>;
}

export default async function WorkoutPage({ params }: WorkoutPageProps) {
  const { day } = await params;
  return <WorkoutScreen routineSlug={day} />;
}
