import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { newUser, userStorage } from "../models/user.js";
import { inlineKeyboard, inlineButton } from "../toolkit/ui/keyboard.js";

const composer = new Composer<Ctx>();

composer.command("start", async (ctx, next) => {
  if (ctx.match?.trim().startsWith("invite_")) {
    return next();
  }
  if (!ctx.from) {
    await ctx.reply("This command can only be used in private chat.");
    return;
  }
  await userStorage.create(newUser(ctx.from.id, ctx.from.first_name));
  await ctx.reply(
    `Welcome, ${ctx.from.first_name}! Your profile has been created.\nReady to get started?`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("Get Started", "onboarding:start")],
      ]),
    },
  );
  return next();
});

composer.callbackQuery("onboarding:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("Great, you're all set!");
});

export default composer;