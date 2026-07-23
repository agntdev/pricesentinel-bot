import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import {
  inlineButton,
  inlineKeyboard,
  registerMainMenuItem,
} from "../toolkit/index.js";
import { addAlertRule, ensureProfile, getWatchlist } from "../lib/domain.js";
import { withBack } from "../lib/ui.js";

registerMainMenuItem({ label: "Set Alert", data: "alert:create", order: 20 });

const composer = new Composer<Ctx>();

function pickCoinKeyboard(tickers: string[]) {
  const rows = tickers.map((t) => [inlineButton(t, `alert:coin:${t}`)]);
  rows.push([inlineButton("Cancel", "flow:cancel")]);
  return withBack(rows);
}

composer.callbackQuery("alert:create", async (ctx) => {
  await ctx.answerCallbackQuery();
  const uid = ctx.from?.id;
  if (!uid) return;
  await ensureProfile(uid);
  ctx.session.alertDraft = {};
  ctx.session.step = "idle";

  const wl = await getWatchlist(uid);
  if (wl.items.length === 0) {
    const text =
      "No coins on your watchlist yet — add one before setting an alert.\n" +
      "Tap Manage Watchlist to get started.";
    const markup = withBack([[inlineButton("Manage Watchlist", "watchlist:manage")]]);
    try {
      await ctx.editMessageText(text, { reply_markup: markup });
    } catch {
      await ctx.reply(text, { reply_markup: markup });
    }
    return;
  }

  const text = "Which coin should this alert watch?";
  const markup = pickCoinKeyboard(wl.items.map((i) => i.ticker));
  try {
    await ctx.editMessageText(text, { reply_markup: markup });
  } catch {
    await ctx.reply(text, { reply_markup: markup });
  }
});

composer.callbackQuery(/^alert:coin:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const ticker = (ctx.match[1] ?? "").toUpperCase();
  ctx.session.alertDraft = { ticker };
  const text = `${ticker} — choose an alert type:`;
  const markup = inlineKeyboard([
    [inlineButton("Price threshold", "alert:type:threshold")],
    [inlineButton("Percent move", "alert:type:percent")],
    [inlineButton("Cancel", "flow:cancel")],
  ]);
  try {
    await ctx.editMessageText(text, { reply_markup: markup });
  } catch {
    await ctx.reply(text, { reply_markup: markup });
  }
});

composer.callbackQuery("alert:type:threshold", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.session.alertDraft?.ticker) {
    await ctx.editMessageText("Start over — pick Set Alert from the menu.");
    return;
  }
  ctx.session.alertDraft.type = "threshold";
  const text = "Alert when price goes:";
  const markup = inlineKeyboard([
    [inlineButton("Above a price", "alert:dir:above")],
    [inlineButton("Below a price", "alert:dir:below")],
    [inlineButton("Cancel", "flow:cancel")],
  ]);
  try {
    await ctx.editMessageText(text, { reply_markup: markup });
  } catch {
    await ctx.reply(text, { reply_markup: markup });
  }
});

composer.callbackQuery(/^alert:dir:(above|below)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const dir = ctx.match[1] as "above" | "below";
  if (!ctx.session.alertDraft?.ticker) {
    await ctx.editMessageText("Start over — pick Set Alert from the menu.");
    return;
  }
  ctx.session.alertDraft.direction = dir;
  ctx.session.alertDraft.type = "threshold";
  ctx.session.step = "awaiting_threshold_price";
  const text =
    dir === "above"
      ? "Send the price to watch above (e.g. 65000)."
      : "Send the price to watch below (e.g. 60000).";
  try {
    await ctx.editMessageText(text, {
      reply_markup: inlineKeyboard([[inlineButton("Cancel", "flow:cancel")]]),
    });
  } catch {
    await ctx.reply(text);
  }
});

composer.callbackQuery("alert:type:percent", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.session.alertDraft?.ticker) {
    await ctx.editMessageText("Start over — pick Set Alert from the menu.");
    return;
  }
  ctx.session.alertDraft.type = "percent";
  ctx.session.step = "awaiting_percent_value";
  const text = "Send the percent move to watch (e.g. 5 for 5%).";
  try {
    await ctx.editMessageText(text, {
      reply_markup: inlineKeyboard([[inlineButton("Cancel", "flow:cancel")]]),
    });
  } catch {
    await ctx.reply(text);
  }
});

composer.callbackQuery(/^alert:tf:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const hours = Number(ctx.match[1]);
  const draft = ctx.session.alertDraft;
  if (!draft?.ticker || draft.type !== "percent" || draft.percent == null) {
    await ctx.editMessageText("Start over — pick Set Alert from the menu.");
    return;
  }
  draft.timeframeHours = hours;
  await finalizePercent(ctx);
});

composer.callbackQuery("alert:confirm", async (ctx) => {
  await ctx.answerCallbackQuery();
  const uid = ctx.from?.id;
  const draft = ctx.session.alertDraft;
  if (!uid || !draft?.ticker || draft.type !== "threshold" || draft.price == null || !draft.direction) {
    try {
      await ctx.editMessageText("Start over — pick Set Alert from the menu.");
    } catch {
      await ctx.reply("Start over — pick Set Alert from the menu.");
    }
    return;
  }
  await addAlertRule(uid, draft.ticker, {
    type: "threshold",
    direction: draft.direction,
    price: draft.price,
  });
  ctx.session.step = "idle";
  ctx.session.alertDraft = undefined;
  const text =
    `Alert saved for ${draft.ticker}: notify when price goes ${draft.direction} ${draft.price}.\n` +
    "I'll check Binance on a schedule and respect your quiet hours.";
  try {
    await ctx.editMessageText(text, {
      reply_markup: withBack([[inlineButton("Set another", "alert:create")]]),
    });
  } catch {
    await ctx.reply(text, {
      reply_markup: withBack([[inlineButton("Set another", "alert:create")]]),
    });
  }
});

// Free-form inputs for threshold price / percent / (legacy)
composer.on("message:text", async (ctx, next) => {
  const step = ctx.session.step;
  if (
    step !== "awaiting_threshold_price" &&
    step !== "awaiting_percent_value" &&
    step !== "awaiting_percent_timeframe"
  ) {
    return next();
  }
  if (ctx.message.text.startsWith("/")) return next();

  const uid = ctx.from?.id;
  if (!uid) return;
  const draft = ctx.session.alertDraft ?? {};

  if (step === "awaiting_threshold_price") {
    const n = Number(ctx.message.text.replace(/,/g, "").trim());
    if (!Number.isFinite(n) || n <= 0) {
      await ctx.reply("Send a positive number, e.g. 65000.");
      return;
    }
    draft.price = n;
    ctx.session.alertDraft = draft;
    ctx.session.step = "idle";
    const dir = draft.direction === "below" ? "below" : "above";
    await ctx.reply(
      `Confirm: alert when ${draft.ticker} goes ${dir} ${n}?`,
      {
        reply_markup: inlineKeyboard([
          [inlineButton("Save alert", "alert:confirm")],
          [inlineButton("Cancel", "flow:cancel")],
        ]),
      },
    );
    return;
  }

  if (step === "awaiting_percent_value") {
    const n = Number(ctx.message.text.replace(/%/g, "").trim());
    if (!Number.isFinite(n) || n <= 0 || n > 100) {
      await ctx.reply("Send a percent between 0 and 100, e.g. 5.");
      return;
    }
    draft.percent = n;
    draft.type = "percent";
    ctx.session.alertDraft = draft;
    ctx.session.step = "idle";
    await ctx.reply("Over what timeframe?", {
      reply_markup: inlineKeyboard([
        [
          inlineButton("1h", "alert:tf:1"),
          inlineButton("4h", "alert:tf:4"),
          inlineButton("24h", "alert:tf:24"),
        ],
        [inlineButton("Cancel", "flow:cancel")],
      ]),
    });
    return;
  }

  return next();
});

async function finalizePercent(ctx: Ctx): Promise<void> {
  const uid = ctx.from?.id;
  const draft = ctx.session.alertDraft;
  if (!uid || !draft?.ticker || draft.percent == null || draft.timeframeHours == null) {
    try {
      await ctx.editMessageText("Start over — pick Set Alert from the menu.");
    } catch {
      await ctx.reply("Start over — pick Set Alert from the menu.");
    }
    return;
  }
  await addAlertRule(uid, draft.ticker, {
    type: "percent",
    percent: draft.percent,
    timeframeHours: draft.timeframeHours,
  });
  ctx.session.step = "idle";
  ctx.session.alertDraft = undefined;
  const text =
    `Alert saved for ${draft.ticker}: notify on a ${draft.percent}% move within ${draft.timeframeHours}h.\n` +
    "I'll check Binance on a schedule and respect your quiet hours.";
  try {
    await ctx.editMessageText(text, {
      reply_markup: withBack([[inlineButton("Set another", "alert:create")]]),
    });
  } catch {
    await ctx.reply(text, {
      reply_markup: withBack([[inlineButton("Set another", "alert:create")]]),
    });
  }
}

export default composer;
