// app/layout.tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { TimerProvider } from "@/components/timer/TimerContext";
import RestTimerBar from "@/components/timer/RestTimerBar";
import { UserProvider } from "@/components/auth/UserContext";
import { DevProvider } from "@/components/dev/DevContext";

// 1. Mobile viewport settings optimized for gym-floor interaction
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
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
      className="h-full w-full bg-[#fafaf8] text-zinc-900 antialiased overflow-x-hidden select-none"
    >
      <body className="h-full w-full max-w-full overflow-x-hidden overflow-y-auto overscroll-x-none bg-[#fafaf8] text-zinc-900">
        <DevProvider>
          <UserProvider>
            <TimerProvider>
              {children}
              <RestTimerBar />
            </TimerProvider>
          </UserProvider>
        </DevProvider>
      </body>
    </html>
  );
}
