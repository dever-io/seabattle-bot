import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/ui/keyboard.js";
import { profileStore } from "../storage/profile-store.js";

const composer = new Composer<Ctx>();

composer.callbackQuery("profile:view", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) {
    await ctx.answerCallbackQuery({ text: "Could not identify user.", show_alert: true });
    return;
  }

  const profile = await profileStore().get(userId);
  const accuracy =
    profile.totalShots > 0
      ? ((profile.totalHits / profile.totalShots) * 100).toFixed(1)
      : "0.0";

  const text = [
    "<b>Your Profile</b>",
    "",
    `Rating: ${profile.rating}`,
    `Wins: ${profile.wins}`,
    `Losses: ${profile.losses}`,
    `Accuracy: ${accuracy}%`,
  ].join("\n");

  const backButton = inlineButton("Back to Menu", "menu:back");
  const keyboard = inlineKeyboard([[backButton]]);

  try {
    await ctx.editMessageText(text, { reply_markup: keyboard, parse_mode: "HTML" });
  } catch {
    await ctx.reply(text, { reply_markup: keyboard, parse_mode: "HTML" });
  }

  await ctx.answerCallbackQuery();
});

export default composer;