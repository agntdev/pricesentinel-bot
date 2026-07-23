import { getStore, keys } from "./store.js";
import { now } from "./clock.js";
import { newId } from "./time.js";
import type {
  AlertEvent,
  AlertRule,
  OwnerDefaults,
  OwnerReport,
  PercentRule,
  ThresholdRule,
  UserProfile,
  Watchlist,
  WatchlistItem,
} from "./types.js";
import { DEFAULT_OWNER_DEFAULTS } from "./types.js";

// ── Owner defaults ───────────────────────────────────────────────────────

export async function getOwnerDefaults(): Promise<OwnerDefaults> {
  const s = await getStore();
  return (await s.get<OwnerDefaults>(keys.ownerDefaults())) ?? { ...DEFAULT_OWNER_DEFAULTS };
}

export async function setOwnerDefaults(patch: Partial<OwnerDefaults>): Promise<OwnerDefaults> {
  const s = await getStore();
  const cur = await getOwnerDefaults();
  const next = { ...cur, ...patch };
  await s.set(keys.ownerDefaults(), next);
  return next;
}

// ── User profiles ────────────────────────────────────────────────────────

export async function getProfile(telegramId: number): Promise<UserProfile | undefined> {
  const s = await getStore();
  return s.get<UserProfile>(keys.user(telegramId));
}

export async function ensureProfile(telegramId: number): Promise<UserProfile> {
  const existing = await getProfile(telegramId);
  if (existing) return existing;
  const defaults = await getOwnerDefaults();
  const profile: UserProfile = {
    telegramId,
    timezone: "UTC",
    quietHoursStart: defaults.quietHoursStart,
    quietHoursEnd: defaults.quietHoursEnd,
    summaryTime: defaults.summaryTime,
    cooldownLength: defaults.cooldownLength,
    enabledAlerts: true,
    morningSummary: true,
    onboarded: false,
    createdAt: now(),
  };
  await saveProfile(profile);
  return profile;
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  const s = await getStore();
  await s.set(keys.user(profile.telegramId), profile);
  // Maintain user index without scanning.
  const idx = (await s.get<number[]>(keys.userIndex())) ?? [];
  if (!idx.includes(profile.telegramId)) {
    idx.push(profile.telegramId);
    await s.set(keys.userIndex(), idx);
  }
}

export async function listUserIds(): Promise<number[]> {
  const s = await getStore();
  return (await s.get<number[]>(keys.userIndex())) ?? [];
}

// ── Watchlists ───────────────────────────────────────────────────────────

export async function getWatchlist(telegramId: number): Promise<Watchlist> {
  const s = await getStore();
  return (
    (await s.get<Watchlist>(keys.watchlist(telegramId))) ?? {
      telegramId,
      items: [],
    }
  );
}

async function saveWatchlist(wl: Watchlist): Promise<void> {
  const s = await getStore();
  await s.set(keys.watchlist(wl.telegramId), wl);
  const idx = (await s.get<number[]>(keys.watchlistIndex())) ?? [];
  const has = wl.items.length > 0;
  const i = idx.indexOf(wl.telegramId);
  if (has && i < 0) {
    idx.push(wl.telegramId);
    await s.set(keys.watchlistIndex(), idx);
  } else if (!has && i >= 0) {
    idx.splice(i, 1);
    await s.set(keys.watchlistIndex(), idx);
  }
}

export async function listWatchlistUserIds(): Promise<number[]> {
  const s = await getStore();
  return (await s.get<number[]>(keys.watchlistIndex())) ?? [];
}

export async function addTicker(
  telegramId: number,
  ticker: string,
  displayName?: string,
): Promise<WatchlistItem> {
  const wl = await getWatchlist(telegramId);
  const t = ticker.toUpperCase();
  const existing = wl.items.find((i) => i.ticker === t);
  if (existing) return existing;
  const item: WatchlistItem = {
    ticker: t,
    displayName: displayName ?? t,
    alertRules: [],
  };
  wl.items.push(item);
  await saveWatchlist(wl);
  return item;
}

export async function removeTicker(telegramId: number, ticker: string): Promise<boolean> {
  const wl = await getWatchlist(telegramId);
  const t = ticker.toUpperCase();
  const before = wl.items.length;
  wl.items = wl.items.filter((i) => i.ticker !== t);
  if (wl.items.length === before) return false;
  await saveWatchlist(wl);
  return true;
}

export async function getItem(
  telegramId: number,
  ticker: string,
): Promise<WatchlistItem | undefined> {
  const wl = await getWatchlist(telegramId);
  return wl.items.find((i) => i.ticker === ticker.toUpperCase());
}

export async function addAlertRule(
  telegramId: number,
  ticker: string,
  rule: AlertRule | (Omit<ThresholdRule, "id"> & { id?: string }) | (Omit<PercentRule, "id"> & { id?: string }),
): Promise<AlertRule | null> {
  const wl = await getWatchlist(telegramId);
  const item = wl.items.find((i) => i.ticker === ticker.toUpperCase());
  if (!item) return null;
  const full = { ...rule, id: rule.id ?? newId("ar") } as AlertRule;
  item.alertRules.push(full);
  await saveWatchlist(wl);
  return full;
}

export async function updateItem(
  telegramId: number,
  ticker: string,
  patch: Partial<WatchlistItem>,
): Promise<void> {
  const wl = await getWatchlist(telegramId);
  const item = wl.items.find((i) => i.ticker === ticker.toUpperCase());
  if (!item) return;
  Object.assign(item, patch);
  // If alertRules replaced, keep reference
  if (patch.alertRules) item.alertRules = patch.alertRules;
  await saveWatchlist(wl);
}

export async function touchLastAlert(telegramId: number, ticker: string, at = now()): Promise<void> {
  const wl = await getWatchlist(telegramId);
  const item = wl.items.find((i) => i.ticker === ticker.toUpperCase());
  if (!item) return;
  item.lastAlertTimestamp = at;
  await saveWatchlist(wl);
}

// ── Alert events ─────────────────────────────────────────────────────────

const MAX_EVENTS_PER_USER = 100;

export async function recordAlertEvent(
  event: Omit<AlertEvent, "id"> & { id?: string },
): Promise<AlertEvent> {
  const s = await getStore();
  const full: AlertEvent = { ...event, id: event.id ?? newId("ae") };
  const list = (await s.get<AlertEvent[]>(keys.alerts(event.telegramId))) ?? [];
  list.unshift(full);
  if (list.length > MAX_EVENTS_PER_USER) list.length = MAX_EVENTS_PER_USER;
  await s.set(keys.alerts(event.telegramId), list);

  if (full.deliveryStatus === "sent") {
    const counts = (await s.get<Record<string, number>>(keys.alertCounts())) ?? {};
    counts[full.coin] = (counts[full.coin] ?? 0) + 1;
    await s.set(keys.alertCounts(), counts);
  }
  return full;
}

export async function recentAlerts(
  telegramId: number,
  sinceMs?: number,
): Promise<AlertEvent[]> {
  const s = await getStore();
  const list = (await s.get<AlertEvent[]>(keys.alerts(telegramId))) ?? [];
  if (sinceMs == null) return list;
  return list.filter((e) => e.timestamp >= sinceMs);
}

export async function getAlertCounts(): Promise<Record<string, number>> {
  const s = await getStore();
  return (await s.get<Record<string, number>>(keys.alertCounts())) ?? {};
}

// ── Owner report ─────────────────────────────────────────────────────────

export async function buildOwnerReport(): Promise<OwnerReport> {
  const users = await listUserIds();
  const active = await listWatchlistUserIds();
  const counts = await getAlertCounts();
  const topAlerts = Object.entries(counts)
    .map(([coin, count]) => ({ coin, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  return {
    totalUsers: users.length,
    activeWatchlists: active.length,
    topAlerts,
  };
}

// ── Summary day tracking ─────────────────────────────────────────────────

export async function getLastSummaryDay(telegramId: number): Promise<string | undefined> {
  const s = await getStore();
  return s.get<string>(keys.lastSummaryDay(telegramId));
}

export async function setLastSummaryDay(telegramId: number, ymd: string): Promise<void> {
  const s = await getStore();
  await s.set(keys.lastSummaryDay(telegramId), ymd);
}
