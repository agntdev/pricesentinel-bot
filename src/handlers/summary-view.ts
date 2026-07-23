import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, registerMainMenuItem } from "../toolkit/index.js";
import { ensureProfile } from "../lib/domain.js";
import { buildSummaryText } from "../lib/summary.js";
import { withBack } from "../lib/ui.js";

registerMainMenuItem({ label: "View Summary", data: "summary:view", order: 30 });

const composer = new Composer<Ctx>();

composer.callbackQuery("summary:view", async (ctx) => {
  await ctx.answerCallbackQuery();
  const uid = ctx.from?.id;
  if (!uid) return;
  await ensureProfile(uid);

  const text = await buildSummaryText(uid);
  const markup = withBack([[inlineButton("Refresh", "summary:view")]]);
  try {
    await ctx.editMessageText(text, { reply_markup: markup });
  } catch {
    await ctx.reply(text, { reply_markup: markup });
  }
});

export default composer;
