import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import {
  inlineButton,
  inlineKeyboard,
  registerMainMenuItem,
} from "../toolkit/index.js";
import {
  buildOwnerReport,
  getOwnerDefaults,
  setOwnerDefaults,
} from "../lib/domain.js";
import { isOwner } from "../lib/owner.js";
import { withBack } from "../lib/ui.js";

registerMainMenuItem({ label: "Admin Dashboard", data: "admin:view", order: 90 });

const composer = new Composer<Ctx>();

function denyText(): string {
  return "That dashboard is only for the bot owner.";
}

composer.callbackQuery("admin:view", async (ctx) => {
  await ctx.answerCallbackQuery();
  const uid = ctx.from?.id;
  const username = ctx.from?.username;
  if (!isOwner(uid, username)) {
    try {
      await ctx.editMessageText(denyText(), {
        reply_markup: withBack([]),
      });
    } catch {
      await ctx.reply(denyText());
    }
    return;
  }

  const report = await buildOwnerReport();
  const defaults = await getOwnerDefaults();
  const lines: string[] = [
    "Owner dashboard",
    `Total users: ${report.totalUsers}`,
    `Active watchlists: ${report.activeWatchlists}`,
    "",
    "Top-fired alerts:",
  ];
  if (report.topAlerts.length === 0) {
    lines.push("No alerts delivered yet.");
  } else {
    for (const row of report.topAlerts.slice(0, 8)) {
      lines.push(`• ${row.coin}: ${row.count}`);
    }
  }
  lines.push("");
  lines.push(
    `New-user defaults — quiet ${defaults.quietHoursStart}–${defaults.quietHoursEnd}, ` +
      `summary ${defaults.summaryTime}, cooldown ${defaults.cooldownLength}h.`,
  );

  const markup = withBack([
    [inlineButton("Refresh", "admin:view")],
    [inlineButton("Default settings", "admin:defaults")],
  ]);
  try {
    await ctx.editMessageText(lines.join("\n"), { reply_markup: markup });
  } catch {
    await ctx.reply(lines.join("\n"), { reply_markup: markup });
  }
});

composer.callbackQuery("admin:defaults", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isOwner(ctx.from?.id, ctx.from?.username)) {
    await ctx.editMessageText(denyText(), { reply_markup: withBack([]) });
    return;
  }
  const d = await getOwnerDefaults();
  const text =
    "Default settings for new users\n" +
    `Quiet hours: ${d.quietHoursStart}–${d.quietHoursEnd}\n` +
    `Morning summary: ${d.summaryTime}\n` +
    `Alert cooldown: ${d.cooldownLength}h\n\n` +
    "Tap a preset to update defaults for future signups.";
  const markup = inlineKeyboard([
    [inlineButton("Quiet 00–08", "admin:set:quiet:00:00:08:00")],
    [inlineButton("Quiet 22–07", "admin:set:quiet:22:00:07:00")],
    [inlineButton("Cooldown 12h", "admin:set:cd:12")],
    [inlineButton("Cooldown 24h", "admin:set:cd:24")],
    [inlineButton("Summary 08:00", "admin:set:sum:08:00")],
    [inlineButton("Summary 09:00", "admin:set:sum:09:00")],
    [inlineButton("Back to dashboard", "admin:view")],
  ]);
  try {
    await ctx.editMessageText(text, { reply_markup: markup });
  } catch {
    await ctx.reply(text, { reply_markup: markup });
  }
});

composer.callbackQuery(/^admin:set:quiet:(\d{2}):(\d{2}):(\d{2}):(\d{2})$/, async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Saved" });
  if (!isOwner(ctx.from?.id, ctx.from?.username)) return;
  const start = `${ctx.match[1]}:${ctx.match[2]}`;
  const end = `${ctx.match[3]}:${ctx.match[4]}`;
  await setOwnerDefaults({ quietHoursStart: start, quietHoursEnd: end });
  await ctx.editMessageText(
    `Quiet hours default set to ${start}–${end} for new users.`,
    { reply_markup: withBack([[inlineButton("Default settings", "admin:defaults")]]) },
  );
});

composer.callbackQuery(/^admin:set:cd:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Saved" });
  if (!isOwner(ctx.from?.id, ctx.from?.username)) return;
  const hours = Number(ctx.match[1]);
  await setOwnerDefaults({ cooldownLength: hours });
  await ctx.editMessageText(`Alert cooldown default set to ${hours}h for new users.`, {
    reply_markup: withBack([[inlineButton("Default settings", "admin:defaults")]]),
  });
});

composer.callbackQuery(/^admin:set:sum:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Saved" });
  if (!isOwner(ctx.from?.id, ctx.from?.username)) return;
  const t = ctx.match[1] ?? "08:00";
  await setOwnerDefaults({ summaryTime: t });
  await ctx.editMessageText(`Morning summary default set to ${t} for new users.`, {
    reply_markup: withBack([[inlineButton("Default settings", "admin:defaults")]]),
  });
});

export default composer;
