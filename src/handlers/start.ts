import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { newUser, userStorage } from "../models/user.js";
import { inlineKeyboard, inlineButton } from "../toolkit/ui/keyboard.js";

const composer = new Composer<Ctx>();

composer.command("start", async (ctx) => {
  const from = ctx.from;
  if (!from) {
    await ctx.reply("This command can only be used in private chat.");
    return;
  }

  const user = newUser(from.id, from.first_name);
  await userStorage.create(user);

  const displayName = from.first_name;
  await ctx.reply(
    `Welcome, ${displayName}! Your profile has been created.\nReady to get started?`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("Get Started", "onboarding:start")],
      ]),
    },
  );
});

export default composer;
