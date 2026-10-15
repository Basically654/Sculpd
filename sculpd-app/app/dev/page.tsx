// app/dev/page.tsx
import { Metadata } from "next";
import DevConsoleClient from "@/components/dev/DevConsoleClient";

export const metadata: Metadata = {
  title: "Sculp'd Developer Console",
  description: "Private Developer Mode, Telemetry, and Feature Test Console for Sculp'd.",
};

export default function DevPage() {
  return <DevConsoleClient />;
}
