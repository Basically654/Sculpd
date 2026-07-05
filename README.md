# Sculpd
A high-efficiency, lightweight mobile-first Progressive Web Application (PWA) designed to maximize gym floor productivity. Built specifically to transition users away from prolonged, inefficient sessions into a structured, high-intensity 45–60 minute routine with zero data-entry distractions.

# 🚀 Core Value Proposition
Zero-Friction Logging: Immediate input for weight, reps, and a rapid-fire + commit action button to log sets seamlessly within tight rest windows.
Automatic Overload Context: Queries and displays exact performance numbers achieved during the most recent historical entry for the active exercise—no digging through tabs.
Zero Decision Fatigue: Detects the current day of the week on launch to auto-load that day's highly curated target routine with an instant 1-tap manual override.
App-Shell Performance: Employs explicit CSS and viewport configurations to override web defaults—completely eliminating elastic rubber-banding scrolling and input-focus zooming on iOS Safari.

# 🛠️ Tech Stack & Architecture

Frontend & Server-Side Execution: Next.js (App Router) + TypeScript 
Styling & Native PWA Layout Controls: Tailwind CSS 
Database & Engine Layer: PostgreSQL hosted natively on Supabase 
Deployment & Hosting: Vercel

# Data Schema Relationship
The architecture enforces strict relational integrity over standard flexible JSON to maximize rapid historical queries:
```text
┌──────────────┐       ┌─────────────────┐       ┌────────────────┐
│     User     │───◄   │ Routine_Day     │───◄   │    Exercise    │
└──────────────┘       └─────────────────┘       └────────────────┘
                                │                         │
                                ▼                         ▼
                       ┌─────────────────┐       ┌────────────────┐
                       │  Workout_Log    │───◄   │    Set_Log     │
                       └─────────────────┘       └────────────────┘

📂 Project Directory StructurePlaintext├── app/
│   ├── layout.tsx         # Global layouts, PWA viewport/meta tags (zoom prevention)
│   ├── page.tsx           # Dashboard / Quick Day-of-the-Week selector
│   ├── workout/
│   │   └── [day]/
│   │       └── page.tsx   # Active gym-floor logging view (e.g., /workout/monday)
│   └── api/
│       ├── workout/       # Endpoints to initialize a workout session
│       └── set/           # Fast POST requests for the "+" log button
├── components/
│   ├── ui/                # Fast, atomic Tailwind UI elements (buttons, inputs)
│   └── workout/
│       ├── ExerciseCard.tsx # Displays exercise cues, historical data, and set rows
│       └── SetRow.tsx     # Weight/Rep inputs and the instant "+" log button
├── lib/
│   └── supabase.ts        # Supabase client instantiation
└── types/
    └── database.types.ts  # Generated TypeScript definitions from Postgres
``` 
# ⚡ Quick Start & Development Setup
1. Prerequisites
Ensure you have the latest Node.js LTS version installed locally.

2. Clone and Install Dependencies
``` text
git clone https://github.com/your-username/sculpd-app.git
cd sculpd-app
npm install
```

3. Environment Configuration
Create a .env.local file in your root folder and add your cloud credentials:
``` text
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_public_key
```

4. Boot the Development ServerBashnpm run dev
 ``` text
Open http://localhost:3000 to view the app. Use your browser's responsive mobile simulation tools set to an iOS viewport canvas to check native behavior.
```
