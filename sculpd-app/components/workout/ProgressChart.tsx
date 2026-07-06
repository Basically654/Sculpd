// components/workout/ProgressChart.tsx
"use client";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export default function ProgressChart({
  data,
  onPointClick,
  selectedDate,
}: {
  data: Array<{
    date: string;
    weight: number;
    reps: number;
    session?: { date: string; sets: Array<{ w: number; r: number }> };
  }>;
  onPointClick: (session: any) => void;
  selectedDate?: string;
}) {
  return (
    <div className="h-40 w-full mt-4 bg-zinc-950 border border-zinc-800 rounded-lg p-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <XAxis dataKey="date" stroke="#71717a" fontSize={10} />
          <YAxis stroke="#71717a" fontSize={10} domain={["auto", "auto"]} />
          <Tooltip
            contentStyle={{ backgroundColor: "#18181b", border: "none" }}
          />
          <Line
            type="monotone"
            dataKey="weight"
            stroke="#34d399"
            strokeWidth={2}
            dot={(dotProps: any) => {
              const { cx, cy, payload } = dotProps;
              const isSelected = payload?.date === selectedDate;

              return (
                <g>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isSelected ? 7 : 5}
                    fill={isSelected ? "#fbbf24" : "#34d399"}
                    stroke={isSelected ? "#34d399" : "#18181b"}
                    strokeWidth={isSelected ? 2 : 1}
                    cursor="pointer"
                    onClick={() => onPointClick(payload)}
                  />
                  {isSelected && (
                    <text
                      x={cx}
                      y={cy + 16}
                      textAnchor="middle"
                      fontSize="9"
                      fill="#fbbf24"
                      fontWeight="700"
                    >
                      {payload?.date}
                    </text>
                  )}
                </g>
              );
            }}
            activeDot={false}
          />
          <Line
            type="monotone"
            dataKey="reps"
            stroke="#fbbf24"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
