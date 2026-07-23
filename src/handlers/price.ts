import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { fetch24h, formatPct, formatPrice, normalizeTicker } from "../lib/binance.js";
import { ensureProfile, getWatchlist } from "../lib/domain.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";

const composer = new Composer<Ctx>();

const backKb = inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]);

composer.command("price", async (ctx) => {
  const uid = ctx.from?.id;
  if (!uid) {
    await ctx.reply("Couldn't identify you. Open this bot from your personal chat.");
    return;
  }
  await ensureProfile(uid);

  const text = ctx.message?.text ?? "";
  // "/price" or "/price@bot BTC"
  const parts = text.trim().split(/\s+/);
  const arg = parts.length >= 2 ? parts.slice(1).join(" ") : "";

  if (arg) {
    await replyForTicker(ctx, normalizeTicker(arg));
    return;
  }

  // Full watchlist view
  const wl = await getWatchlist(uid);
  if (wl.items.length === 0) {
    await ctx.reply(
      "Your watchlist is empty — add a coin first, or try /price BTC.",
      { reply_markup: backKb },
    );
    return;
  }

  const lines: string[] = ["Your watchlist:"];
  const movers: { name: string; pct: number }[] = [];

  for (const item of wl.items) {
    try {
      const t = await fetch24h(item.ticker);
      if (!t) {
        lines.push(`• ${item.displayName}: not found on Binance spot`);
        continue;
      }
      lines.push(
        `• ${item.displayName}: ${formatPrice(t.lastPrice)} (${formatPct(t.priceChangePercent)} 24h)`,
      );
      movers.push({ name: item.displayName, pct: t.priceChangePercent });
    } catch {
      lines.push(`• ${item.displayName}: price unavailable right now`);
    }
  }

  if (movers.length > 0) {
    const top = [...movers].sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, 3);
    lines.push("");
    lines.push("Top movers:");
    for (const m of top) {
      lines.push(`• ${m.name}: ${formatPct(m.pct)}`);
    }
  }

  await ctx.reply(lines.join("\n"), { reply_markup: backKb });
});

async function replyForTicker(ctx: Ctx, ticker: string): Promise<void> {
  if (!ticker || ticker.length < 2) {
    await ctx.reply("That doesn't look like a ticker. Try /price BTC.");
    return;
  }
  try {
    const t = await fetch24h(ticker);
    if (!t) {
      await ctx.reply(
        `Couldn't find ${ticker} on Binance spot USDT. Check the spelling and try again.`,
      );
      return;
    }
    await ctx.reply(
      `${ticker}: ${formatPrice(t.lastPrice)}\n` +
        `24h change: ${formatPct(t.priceChangePercent)}\n` +
        `24h range: ${formatPrice(t.lowPrice)} – ${formatPrice(t.highPrice)}`,
    );
  } catch {
    await ctx.reply("Couldn't reach Binance right now. Try again in a moment.");
  }
}

export default composer;
