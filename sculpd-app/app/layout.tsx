// app/layout.tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";

// 1. Deny elastic responsive layouts (Kills iOS input auto-zoom anomalies)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#000000",
};

// 2. Enable standalone background execution (Hides Safari headers on save)
export const metadata: Metadata = {
  title: "Sculp’d",
  description: "High-Efficiency Workout Tracker",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Sculp’d",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full bg-black text-white antialiased overflow-hidden select-none touch-none">
      <body className="h-full w-full overflow-y-auto webkit-overflow-scrolling-touch">
        {children}
      </body>
    </html>
  );
}