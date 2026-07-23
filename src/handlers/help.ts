import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";

const composer = new Composer<Ctx>();

const HELP =
  "PriceSentinel monitors Binance spot prices and pings you when a coin hits your rules.\n\n" +
  "• Manage Watchlist — add or remove coins\n" +
  "• Set Alert — threshold or percent-move rules\n" +
  "• View Summary — top movers + recent alerts\n" +
  "• /price BTC — quick price check (or /price for your whole list)\n\n" +
  "Tap /start anytime to open the menu.";

const backToMenu = inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]);

composer.command("help", async (ctx) => {
  await ctx.reply(HELP);
});

composer.callbackQuery("menu:help", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(HELP, { reply_markup: backToMenu });
});

export default composer;
