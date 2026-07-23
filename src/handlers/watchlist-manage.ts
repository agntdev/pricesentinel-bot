import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import {
  inlineButton,
  inlineKeyboard,
  registerMainMenuItem,
} from "../toolkit/index.js";
import { normalizeTicker, validateTicker } from "../lib/binance.js";
import {
  addTicker,
  ensureProfile,
  getWatchlist,
  removeTicker,
} from "../lib/domain.js";
import { COMMON_TICKERS } from "../lib/types.js";
import { withBack } from "../lib/ui.js";

registerMainMenuItem({ label: "Manage Watchlist", data: "watchlist:manage", order: 10 });

const composer = new Composer<Ctx>();

async function renderWatchlist(telegramId: number): Promise<{
  text: string;
  markup: ReturnType<typeof inlineKeyboard>;
}> {
  const wl = await getWatchlist(telegramId);
  const lines: string[] = ["Your watchlist"];
  if (wl.items.length === 0) {
    lines.push("No coins yet — tap a common coin or add another ticker.");
  } else {
    for (const item of wl.items) {
      const n = item.alertRules.length;
      lines.push(
        `• ${item.displayName}${n > 0 ? ` (${n} alert${n === 1 ? "" : "s"})` : ""}`,
      );
    }
  }

  const rows: ReturnType<typeof inlineButton>[][] = [];
  // Common coins to add
  rows.push(
    COMMON_TICKERS.map((t) => {
      const on = wl.items.some((i) => i.ticker === t);
      return inlineButton(on ? `✓ ${t}` : `+ ${t}`, on ? `watchlist:rm:${t}` : `watchlist:add:${t}`);
    }),
  );
  rows.push([inlineButton("Add other ticker", "watchlist:other")]);

  // Remove buttons for non-common items
  const extras = wl.items.filter((i) => !(COMMON_TICKERS as readonly string[]).includes(i.ticker));
  for (const item of extras) {
    rows.push([inlineButton(`Remove ${item.displayName}`, `watchlist:rm:${item.ticker}`)]);
  }

  return { text: lines.join("\n"), markup: withBack(rows) };
}

composer.callbackQuery("watchlist:manage", async (ctx) => {
  await ctx.answerCallbackQuery();
  const uid = ctx.from?.id;
  if (!uid) return;
  await ensureProfile(uid);
  ctx.session.step = "idle";
  const { text, markup } = await renderWatchlist(uid);
  try {
    await ctx.editMessageText(text, { reply_markup: markup });
  } catch {
    await ctx.reply(text, { reply_markup: markup });
  }
});

composer.callbackQuery(/^watchlist:add:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const uid = ctx.from?.id;
  if (!uid) return;
  const ticker = normalizeTicker(ctx.match[1] ?? "");
  if (!ticker) {
    await ctx.answerCallbackQuery({ text: "Invalid ticker" });
    return;
  }
  try {
    const ok = await validateTicker(ticker);
    if (!ok) {
      try {
        await ctx.editMessageText(
          `Couldn't find ${ticker} on Binance spot USDT. Check the spelling and try again.`,
          { reply_markup: withBack([[inlineButton("Back to watchlist", "watchlist:manage")]]) },
        );
      } catch {
        await ctx.reply(
          `Couldn't find ${ticker} on Binance spot USDT. Check the spelling and try again.`,
        );
      }
      return;
    }
  } catch {
    try {
      await ctx.editMessageText(
        "Couldn't reach Binance to validate that ticker. Try again in a moment.",
        { reply_markup: withBack([[inlineButton("Back to watchlist", "watchlist:manage")]]) },
      );
    } catch {
      await ctx.reply("Couldn't reach Binance to validate that ticker. Try again in a moment.");
    }
    return;
  }

  await addTicker(uid, ticker);
  const { text, markup } = await renderWatchlist(uid);
  try {
    await ctx.editMessageText(`Added ${ticker}.\n\n${text}`, { reply_markup: markup });
  } catch {
    await ctx.reply(`Added ${ticker}.\n\n${text}`, { reply_markup: markup });
  }
});

composer.callbackQuery(/^watchlist:rm:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const uid = ctx.from?.id;
  if (!uid) return;
  const ticker = normalizeTicker(ctx.match[1] ?? "");
  await removeTicker(uid, ticker);
  const { text, markup } = await renderWatchlist(uid);
  try {
    await ctx.editMessageText(`Removed ${ticker}.\n\n${text}`, { reply_markup: markup });
  } catch {
    await ctx.reply(`Removed ${ticker}.\n\n${text}`, { reply_markup: markup });
  }
});

composer.callbackQuery("watchlist:other", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "awaiting_ticker";
  try {
    await ctx.editMessageText(
      "Send the ticker symbol (e.g. SOL or DOGE). I'll check it on Binance before adding.",
      {
        reply_markup: inlineKeyboard([
          [inlineButton("Cancel", "flow:cancel")],
          [inlineButton("Back to watchlist", "watchlist:manage")],
        ]),
      },
    );
  } catch {
    await ctx.reply(
      "Send the ticker symbol (e.g. SOL or DOGE). I'll check it on Binance before adding.",
    );
  }
});

// Free-form ticker input
composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "awaiting_ticker") return next();
  // Ignore commands
  if (ctx.message.text.startsWith("/")) return next();

  const uid = ctx.from?.id;
  if (!uid) return;
  const ticker = normalizeTicker(ctx.message.text);
  if (!ticker || ticker.length < 2 || ticker.length > 12) {
    await ctx.reply("That doesn't look like a ticker. Send something like SOL or DOGE.");
    return;
  }

  try {
    const ok = await validateTicker(ticker);
    if (!ok) {
      await ctx.reply(
        `Couldn't find ${ticker} on Binance spot USDT. Check the spelling and try again.`,
      );
      return;
    }
  } catch {
    await ctx.reply("Couldn't reach Binance to validate that ticker. Try again in a moment.");
    return;
  }

  await addTicker(uid, ticker);
  ctx.session.step = "idle";
  const { text, markup } = await renderWatchlist(uid);
  await ctx.reply(`Added ${ticker}.\n\n${text}`, { reply_markup: markup });
});

export default composer;
