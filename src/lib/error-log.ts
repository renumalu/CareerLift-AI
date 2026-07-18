// Lightweight client-side error logger + server-side alert reporter.
// Captures window errors, unhandled promise rejections, realtime drops,
// and forwards to system_alerts via recordAlert (best-effort, throttled).

import { recordAlert, type AlertCategory, type AlertSeverity } from "./alerts.functions";

export type LoggedError = {
  id: string;
  at: string;
  source: "window" | "promise" | "manual" | "realtime";
  message: string;
  detail?: string;
};

const MAX_ENTRIES = 50;
let entries: LoggedError[] = [];
const listeners = new Set<(items: LoggedError[]) => void>();
let installed = false;

// throttle: same message within 30s only reported once
const reported = new Map<string, number>();
const THROTTLE_MS = 30_000;

function emit() {
  const snapshot = entries.slice();
  listeners.forEach((l) => l(snapshot));
}

function sourceToCategory(src: LoggedError["source"]): AlertCategory {
  if (src === "realtime") return "realtime";
  if (src === "promise" || src === "manual") return "api";
  return "client";
}

async function reportServerSide(entry: LoggedError) {
  const key = `${entry.source}:${entry.message}`;
  const last = reported.get(key) ?? 0;
  if (Date.now() - last < THROTTLE_MS) return;
  reported.set(key, Date.now());
  try {
    await recordAlert({
      data: {
        severity: (entry.source === "realtime" ? "warning" : "error") as AlertSeverity,
        category: sourceToCategory(entry.source),
        message: entry.message,
        context: { detail: entry.detail, at: entry.at, url: typeof location !== "undefined" ? location.pathname : "" },
      },
    });
  } catch {
    // best-effort; don't loop errors
  }
}

export function logError(
  source: LoggedError["source"],
  message: string,
  detail?: unknown,
) {
  const safeDetail =
    detail instanceof Error
      ? detail.stack ?? detail.message
      : typeof detail === "string"
        ? detail
        : detail
          ? (() => {
              try {
                return JSON.stringify(detail);
              } catch {
                return String(detail);
              }
            })()
          : undefined;
  const entry: LoggedError = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(),
    source,
    message: message.slice(0, 300),
    detail: safeDetail?.slice(0, 1000),
  };
  entries = [entry, ...entries].slice(0, MAX_ENTRIES);
  emit();
  // Fire-and-forget server persist (throttled)
  void reportServerSide(entry);
}

export function clearErrors() {
  entries = [];
  emit();
}

export function getErrors() {
  return entries.slice();
}

export function subscribeErrors(fn: (items: LoggedError[]) => void) {
  listeners.add(fn);
  fn(entries.slice());
  return () => {
    listeners.delete(fn);
  };
}

export function installGlobalErrorLogging() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => {
    logError("window", e.message || "Unknown window error", e.error ?? e.filename);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason;
    const msg =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : "Unhandled promise rejection";
    logError("promise", msg, reason);
  });
}
