import { Composer } from "grammy";
import type { Ctx } from "../bot.js";

const composer = new Composer<Ctx>();

composer.command("ping", async (ctx) => {
  await ctx.reply("Pong! Bot skeleton is operational.");
});

export default composer;