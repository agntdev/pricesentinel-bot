/**
 * Background price monitor + morning-summary scheduler.
 * Uses the injectable clock. Safe DM delivery (403 → skip, don't abort loop).
 */

import { evaluateUser } from "./alerts.js";
import { now } from "./clock.js";
import {
  getLastSummaryDay,
  getProfile,
  listUserIds,
  listWatchlistUserIds,
  setLastSummaryDay,
} from "./domain.js";
import { buildSummaryText } from "./summary.js";
import { isSummaryTime, localParts } from "./time.js";

export type SendFn = (chatId: number, text: string) => Promise<void>;

/** Minimal bot surface the monitor needs (avoids generic Context coupling). */
export interface MonitorBot {
  api: { sendMessage: (chatId: number, text: string) => Promise<unknown> };
}

/** Send a DM; swallow 403 (blocked / never started) without aborting. */
export async function safeSend(send: SendFn, chatId: number, text: string): Promise<boolean> {
  try {
    await send(chatId, text);
    return true;
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (msg.includes("403") || msg.includes("blocked") || msg.includes("Forbidden")) {
      return false;
    }
    // Other errors: log and continue
    console.error("[monitor] send failed", chatId, msg);
    return false;
  }
}

/** One full poll cycle: evaluate alerts + optional morning summaries. */
export async function runMonitorCycle(send: SendFn): Promise<void> {
  const wlUsers = await listWatchlistUserIds();
  for (const uid of wlUsers) {
    try {
      const msgs = await evaluateUser(uid);
      for (const m of msgs) {
        await safeSend(send, m.chatId, m.text);
      }
    } catch (e) {
      console.error("[monitor] evaluate failed", uid, e);
    }
  }

  // Morning summaries for users who opted in and whose local time matches.
  const all = await listUserIds();
  for (const uid of all) {
    try {
      const profile = await getProfile(uid);
      if (!profile?.morningSummary) continue;
      if (!isSummaryTime(profile.timezone, profile.summaryTime)) continue;
      const { ymd } = localParts(profile.timezone, now());
      const last = await getLastSummaryDay(uid);
      if (last === ymd) continue; // already sent today
      const text = await buildSummaryText(uid);
      const ok = await safeSend(send, uid, text);
      if (ok) await setLastSummaryDay(uid, ymd);
    } catch (e) {
      console.error("[monitor] summary failed", uid, e);
    }
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Start periodic monitoring. No-op if already running.
 * Interval defaults to 60s; injectable for tests.
 */
export function startMonitor(
  bot: MonitorBot,
  opts: { intervalMs?: number } = {},
): void {
  if (timer) return;
  const intervalMs = opts.intervalMs ?? 60_000;
  const send: SendFn = async (chatId, text) => {
    await bot.api.sendMessage(chatId, text);
  };
  // First tick after interval (don't block startup).
  timer = setInterval(() => {
    void runMonitorCycle(send);
  }, intervalMs);
  // Unref so Node can exit in tests if needed.
  if (typeof timer === "object" && timer && "unref" in timer) {
    (timer as NodeJS.Timeout).unref?.();
  }
}

export function stopMonitor(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
