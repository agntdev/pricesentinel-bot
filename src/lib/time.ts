import { now } from "./clock.js";

/**
 * Local wall-clock parts for a timezone. Falls back to UTC on parse errors
 * (edge case: timezone conversion errors → default UTC).
 */
export function localParts(
  timezone: string,
  atMs: number = now(),
): { hour: number; minute: number; hhmm: string; ymd: string } {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "UTC",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = fmt.formatToParts(new Date(atMs));
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
    const hour = Number(get("hour"));
    const minute = Number(get("minute"));
    const ymd = `${get("year")}-${get("month")}-${get("day")}`;
    const hhmm = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    return { hour, minute, hhmm, ymd };
  } catch {
    const d = new Date(atMs);
    const hour = d.getUTCHours();
    const minute = d.getUTCMinutes();
    const ymd = d.toISOString().slice(0, 10);
    const hhmm = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    return { hour, minute, hhmm, ymd };
  }
}

/** Parse "HH:MM" → minutes from midnight. */
export function parseHHMM(s: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec((s ?? "").trim());
  if (!m) return 0;
  const h = Math.min(23, Math.max(0, Number(m[1])));
  const min = Math.min(59, Math.max(0, Number(m[2])));
  return h * 60 + min;
}

/**
 * True when local time is inside quiet hours [start, end).
 * Supports overnight windows (e.g. 22:00–08:00).
 */
export function inQuietHours(
  timezone: string,
  startHHMM: string,
  endHHMM: string,
  atMs: number = now(),
): boolean {
  const { hour, minute } = localParts(timezone, atMs);
  const cur = hour * 60 + minute;
  const start = parseHHMM(startHHMM);
  const end = parseHHMM(endHHMM);
  if (start === end) return false; // zero-width → never quiet
  if (start < end) return cur >= start && cur < end;
  // overnight
  return cur >= start || cur < end;
}

/** True when local HH:MM equals summaryTime (minute precision). */
export function isSummaryTime(
  timezone: string,
  summaryTime: string,
  atMs: number = now(),
): boolean {
  const { hhmm } = localParts(timezone, atMs);
  return hhmm === summaryTime;
}

/** Unique rule id (no Math.random — deterministic-ish from time + salt). */
let _seq = 0;
export function newId(prefix = "r"): string {
  _seq += 1;
  return `${prefix}_${now().toString(36)}_${_seq.toString(36)}`;
}
