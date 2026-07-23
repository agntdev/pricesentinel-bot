import { fetch24h, formatPct, formatPrice } from "./binance.js";
import { now } from "./clock.js";
import {
  getProfile,
  getWatchlist,
  recordAlertEvent,
  touchLastAlert,
  updateItem,
} from "./domain.js";
import { inQuietHours } from "./time.js";
import type { AlertRule, PercentRule, ThresholdRule, UserProfile, WatchlistItem } from "./types.js";

export interface OutboundMessage {
  chatId: number;
  text: string;
}

/**
 * Evaluate one item's rules against a live price. Returns messages to send
 * (empty when quiet hours / cooldown / no trigger / fetch failure).
 */
export async function evaluateItem(
  telegramId: number,
  item: WatchlistItem,
  profile: UserProfile,
): Promise<OutboundMessage[]> {
  if (!profile.enabledAlerts) return [];

  let ticker;
  try {
    ticker = await fetch24h(item.ticker);
  } catch {
    // Binance API failure — retry silently, no alerts (edge case).
    return [];
  }
  if (!ticker) return [];

  const price = ticker.lastPrice;
  const out: OutboundMessage[] = [];
  const rules = [...item.alertRules];
  let rulesDirty = false;

  for (const rule of rules) {
    const hit = await checkRule(rule, price, (r) => {
      // Persist baseline updates for percent rules.
      Object.assign(rule, r);
      rulesDirty = true;
    });
    if (!hit) continue;

    const cooldownMs = (profile.cooldownLength || 24) * 60 * 60 * 1000;
    const last = item.lastAlertTimestamp ?? 0;
    if (last && now() - last < cooldownMs) {
      await recordAlertEvent({
        telegramId,
        coin: item.ticker,
        oldPrice: hit.oldPrice,
        newPrice: price,
        percentChange: hit.percentChange,
        timestamp: now(),
        deliveryStatus: "suppressed_cooldown",
        ruleId: rule.id,
      });
      continue;
    }

    if (inQuietHours(profile.timezone, profile.quietHoursStart, profile.quietHoursEnd)) {
      await recordAlertEvent({
        telegramId,
        coin: item.ticker,
        oldPrice: hit.oldPrice,
        newPrice: price,
        percentChange: hit.percentChange,
        timestamp: now(),
        deliveryStatus: "suppressed_quiet",
        ruleId: rule.id,
      });
      continue;
    }

    const text = formatAlertMessage(item, rule, hit.oldPrice, price, hit.percentChange);
    out.push({ chatId: telegramId, text });
    await recordAlertEvent({
      telegramId,
      coin: item.ticker,
      oldPrice: hit.oldPrice,
      newPrice: price,
      percentChange: hit.percentChange,
      timestamp: now(),
      deliveryStatus: "sent",
      ruleId: rule.id,
    });
    item.lastAlertTimestamp = now();
    await touchLastAlert(telegramId, item.ticker, now());
  }

  if (rulesDirty) {
    await updateItem(telegramId, item.ticker, { alertRules: rules });
  }

  return out;
}

async function checkRule(
  rule: AlertRule,
  price: number,
  onUpdate: (patch: Partial<AlertRule>) => void,
): Promise<{ oldPrice: number; percentChange: number } | null> {
  if (rule.type === "threshold") {
    return checkThreshold(rule, price);
  }
  return checkPercent(rule, price, onUpdate);
}

function checkThreshold(
  rule: ThresholdRule,
  price: number,
): { oldPrice: number; percentChange: number } | null {
  if (rule.direction === "above" && price >= rule.price) {
    return { oldPrice: rule.price, percentChange: ((price - rule.price) / rule.price) * 100 };
  }
  if (rule.direction === "below" && price <= rule.price) {
    return { oldPrice: rule.price, percentChange: ((price - rule.price) / rule.price) * 100 };
  }
  return null;
}

function checkPercent(
  rule: PercentRule,
  price: number,
  onUpdate: (patch: Partial<PercentRule>) => void,
): { oldPrice: number; percentChange: number } | null {
  const windowMs = (rule.timeframeHours || 24) * 60 * 60 * 1000;
  if (rule.baselinePrice == null || rule.baselineAt == null || now() - rule.baselineAt > windowMs) {
    // Start / roll a new baseline window — do not fire on first observation.
    onUpdate({ baselinePrice: price, baselineAt: now() });
    return null;
  }
  const pct = ((price - rule.baselinePrice) / rule.baselinePrice) * 100;
  if (Math.abs(pct) >= rule.percent) {
    const old = rule.baselinePrice;
    // Reset baseline after fire so it doesn't spam every poll.
    onUpdate({ baselinePrice: price, baselineAt: now() });
    return { oldPrice: old, percentChange: pct };
  }
  return null;
}

export function formatAlertMessage(
  item: WatchlistItem,
  rule: AlertRule,
  oldPrice: number,
  newPrice: number,
  percentChange: number,
): string {
  if (rule.type === "threshold") {
    const dir = rule.direction === "above" ? "rose above" : "fell below";
    return (
      `Alert: ${item.displayName} ${dir} ${formatPrice(rule.price)}\n` +
      `Now: ${formatPrice(newPrice)} (${formatPct(percentChange)})`
    );
  }
  return (
    `Alert: ${item.displayName} moved ${formatPct(percentChange)} ` +
    `in ${rule.timeframeHours}h\n` +
    `Was ${formatPrice(oldPrice)} → now ${formatPrice(newPrice)}`
  );
}

/** Run evaluation for one user across their whole watchlist. */
export async function evaluateUser(telegramId: number): Promise<OutboundMessage[]> {
  const profile = await getProfile(telegramId);
  if (!profile) return [];
  const wl = await getWatchlist(telegramId);
  const msgs: OutboundMessage[] = [];
  for (const item of wl.items) {
    // Process all rules independently (edge case: multiple rules per coin).
    const m = await evaluateItem(telegramId, item, profile);
    msgs.push(...m);
  }
  return msgs;
}
