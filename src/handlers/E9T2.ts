import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { matchStorage } from "../models/match.js";

const composer = new Composer<Ctx>();

composer.command("newmatch", async (ctx) => {
  if (!ctx.from) {
    await ctx.reply("This command can only be used in private chat.");
    return;
  }
  const args = ctx.message?.text?.trim().split(/\s+/) ?? [];
  if (args.length < 2) {
    await ctx.reply("Usage: /newmatch <telegram_id>");
    return;
  }
  const opponentId = parseInt(args[1], 10);
  if (isNaN(opponentId) || opponentId <= 0) {
    await ctx.reply("Please provide a valid numeric Telegram ID.");
    return;
  }
  if (opponentId === ctx.from.id) {
    await ctx.reply("You cannot challenge yourself.");
    return;
  }
  const match = await matchStorage.create(ctx.from.id, opponentId);
  const turnLabel = match.turn === 0 ? "none" : String(match.turn);
  await ctx.reply(
    `Match #${match.id} created.\nState: ${match.state}\nPlayer A: ${ctx.from.first_name} (${match.playerA})\nPlayer B: unknown (${match.playerB})\nTurn: ${turnLabel}`,
  );
});

composer.command("mymatch", async (ctx) => {
  if (!ctx.from) {
    await ctx.reply("This command can only be used in private chat.");
    return;
  }
  const matches = await matchStorage.findByPlayer(ctx.from.id);
  const active = matches.filter((m) => m.state !== "completed");
  if (active.length === 0) {
    await ctx.reply("You have no active matches.");
    return;
  }
  const match = active[0];
  const turnLabel = match.turn === 0 ? "none" : String(match.turn);
  await ctx.reply(
    `Match #${match.id}\nState: ${match.state}\nPlayer A: ${match.playerA}\nPlayer B: ${match.playerB}\nTurn: ${turnLabel}`,
  );
});

export default composer;