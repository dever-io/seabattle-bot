import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { matchStorage } from "../models/match.js";
import { moveStorage } from "../models/move.js";
import { inlineButton, inlineKeyboard } from "../toolkit/ui/keyboard.js";

const composer = new Composer<Ctx>();

composer.command("turnt", async (ctx) => {
  if (!ctx.from) {
    await ctx.reply("This command can only be used in private chat.");
    return;
  }

  const args = ctx.message?.text?.trim().split(/\s+/) ?? [];
  if (args.length < 2) {
    await ctx.reply("Usage: /turnt <match_id>");
    return;
  }

  const matchId = args[1];
  const match = await matchStorage.read(matchId);
  if (!match) {
    await ctx.reply("Match not found.");
    return;
  }

  if (match.state !== "in_progress") {
    await ctx.reply("The match is not in progress.");
    return;
  }

  if (match.turn !== ctx.from.id) {
    await ctx.reply("It is not your turn.");
    return;
  }

  const moves = await moveStorage.findByPlayerAndMatch(ctx.from.id, matchId);
  if (moves.length === 0) {
    await ctx.reply("You must make a move before passing the turn.");
    return;
  }

  const updated = await matchStorage.passTurn(match.id, ctx.from.id);
  if (!updated) {
    await ctx.reply("Failed to pass turn.");
    return;
  }

  const opponentId =
    match.playerA === ctx.from.id ? match.playerB : match.playerA;

  const notificationText = `Your opponent has made a move. It's your turn! Match #${match.id}`;
  await ctx.api.sendMessage(opponentId, notificationText, {
    reply_markup: inlineKeyboard([
      [inlineButton("Your Turn", `turnt:match:${match.id}`)],
    ]),
  });

  await ctx.reply(`Turn passed. It is now player ${opponentId}'s turn.`);
});

composer.callbackQuery(/^turnt:match:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery({
    text: "Use /fire <row> <col> to attack!",
    show_alert: true,
  });
});

export default composer;