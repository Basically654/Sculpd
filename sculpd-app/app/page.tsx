// app/page.tsx
import Link from "next/link";

const DAYS_OF_WEEK = [
  { slug: "monday", label: "Monday", focus: "Glute Focus (Upper & Side) + Calves", color: "from-emerald-500/20 to-zinc-900" },
  { slug: "tuesday", label: "Tuesday", focus: "Upper Body (Hourglass Balance) + Abs", color: "from-blue-500/10 to-zinc-900" },
  { slug: "wednesday", label: "Wednesday", focus: "Quad & Hip Focus + Calves", color: "from-amber-500/10 to-zinc-900" },
  { slug: "thursday", label: "Thursday", focus: "Active Recovery, Core, & Lower Back", color: "from-purple-500/10 to-zinc-900" },
  { slug: "friday", label: "Friday", focus: "Full Lower Body (Posterior Chain) + Calves", color: "from-rose-500/10 to-zinc-900" },
];

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-black text-white p-4 font-sans flex flex-col justify-between pb-12">
      {/* Upper Brand Section */}
      <header className="pt-6 pb-4">
        <h1 className="text-3xl font-black tracking-tighter text-zinc-100 uppercase">
          SCULP’D
        </h1>
        <p className="text-xs font-medium text-zinc-500 mt-0.5 tracking-wide">
          High-Efficiency Workout Architecture
        </p>
      </header>

      {/* Main Routine Navigation Array */}
      <div className="flex-1 flex flex-col justify-center space-y-3.5 my-auto max-w-md mx-auto w-full">
        {DAYS_OF_WEEK.map((day) => (
          <Link
            key={day.slug}
            href={`/workout/${day.slug}`}
            className={`w-full p-4 rounded-xl bg-gradient-to-r ${day.color} border border-zinc-800/80 hover:border-zinc-700 flex items-center justify-between transition-all duration-200 active:scale-[0.98] group`}
          >
            <div className="space-y-1">
              <h2 className="text-lg font-black tracking-tight text-zinc-200 group-hover:text-white uppercase">
                {day.label}
              </h2>
              <p className="text-xs text-zinc-400 font-medium line-clamp-1">
                {day.focus}
              </p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-zinc-950/60 border border-zinc-800 flex items-center justify-center text-zinc-500 group-hover:text-zinc-300">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </div>
          </Link>
        ))}
      </div>

      {/* Static Footer Context */}
      <footer className="text-center pt-6">
        <p className="text-[10px] font-mono tracking-widest text-zinc-600 uppercase">
          MVP Phase 1.0 • Supabase Live Connection Verified
        </p>
      </footer>
    </main>
  );
}