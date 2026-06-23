import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { menuKeyboard } from "../toolkit/ui/keyboard.js";

const composer = new Composer<Ctx>();

composer.command("welcome", async (ctx) => {
  await ctx.reply("Welcome! I am ready to help.", {
    reply_markup: menuKeyboard([
      { text: "Help", data: "menu:help" },
      { text: "Leaderboard", data: "leaderboard:view" },
      { text: "Status", data: "menu:status" },
    ]),
  });
});

export default composer;
