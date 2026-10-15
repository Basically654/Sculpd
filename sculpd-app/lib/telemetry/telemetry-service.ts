// lib/telemetry/telemetry-service.ts
import { generateUUID } from "@/lib/crypto/uuid";

export type TelemetryCategory =
  | "workout"
  | "set"
  | "timer"
  | "notification"
  | "sync"
  | "backup"
  | "test"
  | "error";

export interface TelemetryEvent {
  id: string;
  timestamp: string;
  epochMs: number;
  category: TelemetryCategory;
  eventType: string;
  environment: "development" | "production" | "test";
  correlationId?: string;
  data?: Record<string, any>;
  isSimulated?: boolean;
  error?: string;
}

const STORAGE_KEY = "sculpd_dev_telemetry_events";
const MAX_EVENTS = 200;

class TelemetryService {
  private events: TelemetryEvent[] = [];
  private listeners: Set<(event: TelemetryEvent) => void> = new Set();
  private initialized = false;

  constructor() {
    this.initFromStorage();
  }

  private initFromStorage() {
    if (this.initialized) return;
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            this.events = parsed.slice(-MAX_EVENTS);
          }
        }
      } catch (e) {
        console.warn("Failed to load telemetry from localStorage:", e);
      }
    }
    this.initialized = true;
  }

  private persist() {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.events));
      } catch {
        // quota exceeded or private mode, gracefully slice
        this.events = this.events.slice(-50);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(this.events));
        } catch {
          // ignore
        }
      }
    }
  }

  public recordEvent(
    input: Omit<TelemetryEvent, "id" | "timestamp" | "epochMs" | "environment"> & {
      environment?: "development" | "production" | "test";
    }
  ): TelemetryEvent {
    this.initFromStorage();

    const now = Date.now();
    const event: TelemetryEvent = {
      id: generateUUID(),
      timestamp: new Date(now).toISOString(),
      epochMs: now,
      environment:
        input.environment ||
        (process.env.NODE_ENV === "production" ? "production" : "development"),
      category: input.category,
      eventType: input.eventType,
      correlationId: input.correlationId,
      data: input.data,
      isSimulated: Boolean(input.isSimulated),
      error: input.error,
    };

    this.events.push(event);
    if (this.events.length > MAX_EVENTS) {
      this.events = this.events.slice(-MAX_EVENTS);
    }

    this.persist();

    // Notify active subscribers
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("Telemetry listener error:", err);
      }
    }

    return event;
  }

  public getEvents(category?: TelemetryCategory): TelemetryEvent[] {
    this.initFromStorage();
    if (category) {
      return this.events.filter((e) => e.category === category);
    }
    return [...this.events].reverse(); // newest first
  }

  public clear(): void {
    this.events = [];
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
    for (const listener of this.listeners) {
      try {
        listener({
          id: generateUUID(),
          timestamp: new Date().toISOString(),
          epochMs: Date.now(),
          category: "error",
          eventType: "telemetry.cleared",
          environment: "development",
        });
      } catch {
        // ignore
      }
    }
  }

  public subscribe(callback: (event: TelemetryEvent) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }
}

export const telemetry = new TelemetryService();

// Helper logging functions
export function logWorkoutTelemetry(
  action: "created" | "updated" | "completed",
  sessionId: string,
  meta?: Record<string, any>
) {
  return telemetry.recordEvent({
    category: "workout",
    eventType: `workout.session.${action}`,
    correlationId: sessionId,
    data: { sessionId, ...meta },
  });
}

export function logSetTelemetry(
  action: "saved" | "deleted",
  setId: string,
  meta?: Record<string, any>
) {
  return telemetry.recordEvent({
    category: "set",
    eventType: `set.${action}`,
    correlationId: setId,
    data: { setId, ...meta },
  });
}

export function logTimerTelemetry(
  action: "started" | "shortened" | "completed" | "canceled",
  timerId: string,
  meta?: Record<string, any>
) {
  return telemetry.recordEvent({
    category: "timer",
    eventType: `timer.${action}`,
    correlationId: timerId,
    data: { timerId, ...meta },
  });
}

export type DiagnosticTelemetryEvent = TelemetryEvent;

export function getRecentTelemetry(category?: TelemetryCategory): TelemetryEvent[] {
  return telemetry.getEvents(category);
}

export function clearTelemetryBuffer(): void {
  telemetry.clear();
}

export function exportTelemetryJson(): void {
  if (typeof window === "undefined") return;
  const events = telemetry.getEvents();
  const blob = new Blob([JSON.stringify(events, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sculpd-telemetry-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function logNotificationTelemetry(
  stage: "scheduled" | "dispatched" | "received" | "clicked" | "simulated" | string,
  meta?: Record<string, any>
) {
  return telemetry.recordEvent({
    category: "notification",
    eventType: `notification.${stage}`,
    isSimulated: stage === "simulated",
    data: meta,
  });
}

export function logSyncTelemetry(
  status: "queued" | "succeeded" | "retried" | "failed",
  meta?: Record<string, any>
) {
  return telemetry.recordEvent({
    category: "sync",
    eventType: `sync.${status}`,
    data: meta,
  });
}

export function logBackupTelemetry(
  action: "exported" | "imported",
  meta?: Record<string, any>
) {
  return telemetry.recordEvent({
    category: "backup",
    eventType: `backup.${action}`,
    data: meta,
  });
}

export function logTestTelemetry(
  testName: string,
  status: "pass" | "fail" | "skip",
  durationOrMeta?: number | Record<string, any>,
  error?: string
) {
  const isNumber = typeof durationOrMeta === "number";
  return telemetry.recordEvent({
    category: "test",
    eventType: `test.${status}`,
    data: isNumber
      ? { testName, durationMs: durationOrMeta }
      : { testName, ...(durationOrMeta || {}) },
    error,
  });
}

export function logErrorTelemetry(error: any, context?: string) {
  const errMsg =
    typeof error === "string"
      ? error
      : error?.message || "Unknown application error";
  return telemetry.recordEvent({
    category: "error",
    eventType: "app.error",
    error: errMsg,
    data: { context, stack: error?.stack },
  });
}
