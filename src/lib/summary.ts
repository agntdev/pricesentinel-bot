import { fetch24h, formatPct, formatPrice } from "./binance.js";
import { now } from "./clock.js";
import { getWatchlist, recentAlerts } from "./domain.js";

export interface Mover {
  ticker: string;
  displayName: string;
  price: number;
  changePct: number;
}

/**
 * Build morning-summary text for a user. Pure content helper used by both
 * the View Summary button and the scheduled morning job.
 */
export async function buildSummaryText(telegramId: number): Promise<string> {
  const wl = await getWatchlist(telegramId);
  if (wl.items.length === 0) {
    return (
      "Your morning summary is empty — no coins on your watchlist yet.\n" +
      "Tap Manage Watchlist to add BTC, ETH, or TON."
    );
  }

  const movers: Mover[] = [];
  for (const item of wl.items) {
    try {
      const t = await fetch24h(item.ticker);
      if (!t) continue;
      movers.push({
        ticker: item.ticker,
        displayName: item.displayName,
        price: t.lastPrice,
        changePct: t.priceChangePercent,
      });
    } catch {
      // skip failed fetches
    }
  }

  if (movers.length === 0) {
    return (
      "Couldn't load prices for your watchlist right now.\n" +
      "Try again in a moment."
    );
  }

  const ranked = [...movers].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
  const top = ranked.slice(0, 5);

  const lines: string[] = ["Morning summary — top movers on your list:"];
  for (const m of top) {
    lines.push(`• ${m.displayName}: ${formatPrice(m.price)} (${formatPct(m.changePct)})`);
  }

  const dayAgo = now() - 24 * 60 * 60 * 1000;
  const alerts = (await recentAlerts(telegramId, dayAgo)).filter((e) => e.deliveryStatus === "sent");
  lines.push("");
  if (alerts.length === 0) {
    lines.push("No alerts fired in the last 24 hours.");
  } else {
    lines.push(`Notable alerts (last 24h): ${alerts.length}`);
    for (const a of alerts.slice(0, 5)) {
      lines.push(
        `• ${a.coin}: ${formatPrice(a.oldPrice)} → ${formatPrice(a.newPrice)} (${formatPct(a.percentChange)})`,
      );
    }
  }

  return lines.join("\n");
}
