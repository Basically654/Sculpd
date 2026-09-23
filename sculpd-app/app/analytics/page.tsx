// app/analytics/page.tsx
import { Suspense } from "react";
import type { Metadata } from "next";
import AnalyticsClient from "@/components/analytics/AnalyticsClient";

export const metadata: Metadata = {
  title: "Training Analytics | Sculp’d",
  description: "Objective workout telemetry, exercise progression curves, and PR records.",
};

export default function AnalyticsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#fafaf8] text-zinc-900 flex flex-col items-center justify-center p-4">
          <div className="w-8 h-8 rounded-full border-2 border-zinc-800 border-t-transparent animate-spin mb-4" />
          <p className="text-xs font-mono uppercase tracking-widest text-stone-500">
            Loading Analytics...
          </p>
        </div>
      }
    >
      <AnalyticsClient />
    </Suspense>
  );
}
