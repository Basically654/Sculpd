// components/analytics/ProgressionChart.tsx
"use client";

import React, { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { ExerciseHistoryPoint } from "@/lib/analytics/analytics-service";

interface ProgressionChartProps {
  history: ExerciseHistoryPoint[];
  metric: "e1rm" | "weight" | "volume";
  isBodyweight: boolean;
}

export default function ProgressionChart({
  history,
  metric,
  isBodyweight,
}: ProgressionChartProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return (
      <div className="h-48 w-full bg-white/40 border border-stone-200/60 rounded-2xl flex items-center justify-center">
        <span className="text-xs font-mono uppercase tracking-wider text-stone-400">
          Loading telemetry...
        </span>
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <div className="h-48 w-full bg-white/40 border border-dashed border-stone-200 rounded-2xl flex items-center justify-center p-4">
        <span className="text-xs text-stone-400 font-mono">
          Insufficient data points for trend curve
        </span>
      </div>
    );
  }

  // Transform data for chart points
  const chartData = history.map((hp) => {
    let value = 0;
    if (metric === "e1rm") {
      value = hp.estimated1RM;
    } else if (metric === "weight") {
      value = isBodyweight ? hp.bestWeight : hp.effectiveWeight;
    } else if (metric === "volume") {
      value = hp.volume;
    }

    return {
      date: hp.date,
      fullDate: hp.fullDate,
      value,
      topSetSummary: hp.topSetSummary,
      estimated1RM: hp.estimated1RM,
      effectiveWeight: hp.effectiveWeight,
      setsCount: hp.sets.length,
      volume: hp.volume,
    };
  });

  const yLabel =
    metric === "e1rm"
      ? "E1RM (lb)"
      : metric === "weight"
      ? isBodyweight
        ? "Added (lb)"
        : "Weight (lb)"
      : "Volume (lb)";

  // Single data point fallback
  if (chartData.length === 1) {
    const pt = chartData[0];
    return (
      <div className="h-48 w-full bg-white border border-stone-200/80 rounded-2xl p-4 flex flex-col justify-between shadow-2xs">
        <div className="flex items-center justify-between text-xs font-mono text-stone-500">
          <span>{yLabel}</span>
          <span>{pt.fullDate}</span>
        </div>
        <div className="text-center my-auto">
          <div className="text-3xl font-black font-mono text-zinc-900 tracking-tight">
            {metric === "volume" ? pt.value.toLocaleString() : pt.value}{" "}
            <span className="text-sm font-normal text-stone-500">lb</span>
          </div>
          <p className="text-xs text-stone-500 font-mono mt-1">
            Top Set: {pt.topSetSummary}
          </p>
        </div>
        <div className="text-[11px] text-stone-400 text-center font-mono">
          Baseline recorded • Complete additional workouts to plot trajectory
        </div>
      </div>
    );
  }

  return (
    <div className="h-52 w-full bg-white border border-stone-200/80 rounded-2xl p-3 shadow-2xs">
      <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-stone-400 mb-1 px-1">
        {yLabel} • Trajectory
      </div>
      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f1ee" vertical={false} />
            <XAxis
              dataKey="date"
              stroke="#a8a29e"
              fontSize={10}
              tickLine={false}
              axisLine={{ stroke: "#e7e5e4" }}
            />
            <YAxis
              stroke="#a8a29e"
              fontSize={10}
              domain={["dataMin - 5", "dataMax + 5"]}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`)}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const d = payload[0].payload;
                return (
                  <div className="rounded-xl bg-zinc-900 text-white p-2.5 shadow-lg border border-zinc-800 text-xs font-mono">
                    <div className="text-stone-400 text-[10px] mb-1">{d.fullDate}</div>
                    <div className="font-bold text-sm text-emerald-400">
                      {metric === "volume"
                        ? `${d.value.toLocaleString()} lb`
                        : `${d.value} lb`}
                      <span className="text-[10px] text-stone-400 ml-1">
                        {metric === "e1rm" ? "est. 1RM" : metric === "weight" ? "top load" : "volume"}
                      </span>
                    </div>
                    <div className="text-stone-300 text-[11px] mt-0.5">
                      Top Set: {d.topSetSummary}
                    </div>
                    {metric !== "volume" && (
                      <div className="text-stone-400 text-[10px] mt-0.5">
                        Volume: {d.volume.toLocaleString()} lb ({d.setsCount} {d.setsCount === 1 ? "set" : "sets"})
                      </div>
                    )}
                  </div>
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#18181b"
              strokeWidth={2.25}
              dot={{ r: 3.5, fill: "#18181b", stroke: "#fafaf8", strokeWidth: 1.5 }}
              activeDot={{ r: 5, fill: "#10b981", stroke: "#18181b", strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
