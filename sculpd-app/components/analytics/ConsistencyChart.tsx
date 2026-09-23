// components/analytics/ConsistencyChart.tsx
"use client";

import React, { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  WeeklyFrequencyPoint,
  WeeklyVolumePoint,
} from "@/lib/analytics/analytics-service";

interface ConsistencyChartProps {
  frequencyData: WeeklyFrequencyPoint[];
  volumeData: WeeklyVolumePoint[];
  mode: "frequency" | "volume";
}

export default function ConsistencyChart({
  frequencyData,
  volumeData,
  mode,
}: ConsistencyChartProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return (
      <div className="h-44 w-full bg-white/40 border border-stone-200/60 rounded-2xl flex items-center justify-center">
        <span className="text-xs font-mono uppercase tracking-wider text-stone-400">
          Loading cadence...
        </span>
      </div>
    );
  }

  const data =
    mode === "frequency"
      ? frequencyData.map((f) => ({
          label: f.weekLabel,
          value: f.count,
        }))
      : volumeData.map((v) => ({
          label: v.weekLabel,
          value: v.volume,
          count: v.workoutCount,
        }));

  if (!data || data.length === 0) {
    return (
      <div className="h-44 w-full bg-white/40 border border-dashed border-stone-200 rounded-2xl flex items-center justify-center p-4">
        <span className="text-xs text-stone-400 font-mono">
          No workout frequency logged yet
        </span>
      </div>
    );
  }

  const yLabel = mode === "frequency" ? "Workouts / Week" : "Volume (lb) / Week";

  return (
    <div className="h-48 w-full bg-white border border-stone-200/80 rounded-2xl p-3 shadow-2xs">
      <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-stone-400 mb-1 px-1">
        {yLabel}
      </div>
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f1ee" vertical={false} />
            <XAxis
              dataKey="label"
              stroke="#a8a29e"
              fontSize={10}
              tickLine={false}
              axisLine={{ stroke: "#e7e5e4" }}
            />
            <YAxis
              stroke="#a8a29e"
              fontSize={10}
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) =>
                mode === "volume" && v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`
              }
            />
            <Tooltip
              cursor={{ fill: "#f5f5f4" }}
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const d = payload[0].payload;
                return (
                  <div className="rounded-xl bg-zinc-900 text-white p-2 shadow-lg border border-zinc-800 text-xs font-mono">
                    <div className="text-stone-400 text-[10px]">Week of {d.label}</div>
                    <div className="font-bold text-sm text-emerald-400 mt-0.5">
                      {mode === "frequency"
                        ? `${d.value} ${d.value === 1 ? "workout" : "workouts"}`
                        : `${d.value.toLocaleString()} lb`}
                    </div>
                    {mode === "volume" && (
                      <div className="text-stone-300 text-[10px] mt-0.5">
                        {d.count} {d.count === 1 ? "session" : "sessions"}
                      </div>
                    )}
                  </div>
                );
              }}
            />
            <Bar
              dataKey="value"
              fill="#18181b"
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
