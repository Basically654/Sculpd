// app/history/[id]/page.tsx
import WorkoutDetailClient from "@/components/history/WorkoutDetailClient";

interface WorkoutDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function WorkoutDetailPage({
  params,
}: WorkoutDetailPageProps) {
  const { id } = await params;
  return <WorkoutDetailClient sessionId={id} />;
}
