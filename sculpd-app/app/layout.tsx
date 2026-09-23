// app/layout.tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { TimerProvider } from "@/components/timer/TimerContext";
import RestTimerBar from "@/components/timer/RestTimerBar";
import { UserProvider } from "@/components/auth/UserContext";

// 1. Mobile viewport settings optimized for gym-floor interaction
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#fafaf8",
};

// 2. Metadata configuration for PWA standalone usage
export const metadata: Metadata = {
  title: "Sculp’d",
  description: "High-Efficiency Workout Tracker",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  ),
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Sculp’d",
  },
  openGraph: {
    title: "Sculp’d",
    description: "High-Efficiency Workout Tracker",
    type: "website",
  },
  verification: {
    google: "",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className="h-full bg-[#fafaf8] text-zinc-900 antialiased overflow-hidden select-none"
    >
      <body className="h-full w-full overflow-y-auto bg-[#fafaf8] text-zinc-900">
        <UserProvider>
          <TimerProvider>
            {children}
            <RestTimerBar />
          </TimerProvider>
        </UserProvider>
      </body>
    </html>
  );
}
