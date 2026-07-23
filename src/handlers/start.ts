import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { mainMenuKeyboard, inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { ensureProfile, getProfile, saveProfile } from "../lib/domain.js";
import { TIMEZONES } from "../lib/types.js";

const composer = new Composer<Ctx>();

export const WELCOME =
  "PriceSentinel watches Binance spot prices for you.\n\n" +
  "Add coins, set alerts, and get a morning summary — all from the buttons below.";

export const TZ_PROMPT =
  "First, pick your timezone so quiet hours and morning summaries land at the right time.";

function timezoneKeyboard() {
  const rows = [];
  for (let i = 0; i < TIMEZONES.length; i += 2) {
    const slice = TIMEZONES.slice(i, i + 2);
    rows.push(slice.map((tz) => inlineButton(tz.label, `tz:${tz.value}`)));
  }
  return inlineKeyboard(rows);
}

composer.command("start", async (ctx) => {
  const uid = ctx.from?.id;
  if (!uid) {
    await ctx.reply("Couldn't identify you. Open this bot from your personal chat.");
    return;
  }

  ctx.session.step = "idle";
  ctx.session.alertDraft = undefined;
  ctx.session.pendingTicker = undefined;

  const profile = await ensureProfile(uid);
  if (!profile.onboarded) {
    ctx.session.step = "awaiting_timezone";
    await ctx.reply(`${WELCOME}\n\n${TZ_PROMPT}`, {
      reply_markup: timezoneKeyboard(),
    });
    return;
  }

  await ctx.reply(WELCOME, { reply_markup: mainMenuKeyboard() });
});

composer.callbackQuery(/^tz:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const uid = ctx.from?.id;
  if (!uid) return;
  const tz = ctx.match[1] || "UTC";
  // Validate against known list; fall back to UTC on bad value.
  const known = TIMEZONES.some((t) => t.value === tz);
  const profile = await ensureProfile(uid);
  profile.timezone = known ? tz : "UTC";
  profile.onboarded = true;
  await saveProfile(profile);
  ctx.session.step = "idle";
  const label = TIMEZONES.find((t) => t.value === profile.timezone)?.label ?? profile.timezone;
  await ctx.editMessageText(
    `Timezone set to ${label}. Quiet hours default to 00:00–08:00; alert cooldown is 24h.\n\n` +
      WELCOME,
    { reply_markup: mainMenuKeyboard() },
  );
});

// "Back to menu" — re-render the main menu in place from any sub-view.
composer.callbackQuery("menu:main", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "idle";
  ctx.session.alertDraft = undefined;
  ctx.session.pendingTicker = undefined;
  await ctx.editMessageText(WELCOME, { reply_markup: mainMenuKeyboard() });
});

// Global cancel for multi-step flows.
composer.callbackQuery("flow:cancel", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Cancelled" });
  ctx.session.step = "idle";
  ctx.session.alertDraft = undefined;
  ctx.session.pendingTicker = undefined;
  await ctx.editMessageText(WELCOME, { reply_markup: mainMenuKeyboard() });
});

export default composer;
