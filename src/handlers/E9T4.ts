import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { matchStorage } from "../models/match.js";
import { boardStorage } from "../models/board.js";
import { moveStorage, checkWinCondition } from "../models/move.js";

const composer = new Composer<Ctx>();

composer.command("fire", async (ctx) => {
  if (!ctx.from) {
    await ctx.reply("This command can only be used in private chat.");
    return;
  }
  const args = ctx.message?.text?.trim().split(/\s+/) ?? [];
  if (args.length < 3) {
    await ctx.reply("Usage: /fire <row> <col>");
    return;
  }
  const row = parseInt(args[1], 10);
  const col = parseInt(args[2], 10);
  if (isNaN(row) || row < 0 || isNaN(col) || col < 0) {
    await ctx.reply("Row and col must be non-negative integers.");
    return;
  }

  const matches = await matchStorage.findByPlayer(ctx.from.id);
  const active = matches.filter((m) => m.state !== "completed");
  if (active.length === 0) {
    await ctx.reply("You have no active match.");
    return;
  }
  let match = active[0];

  if (match.state === "waiting") {
    const started = await matchStorage.startMatch(match.id);
    if (!started) {
      await ctx.reply("Failed to start match.");
      return;
    }
    match = started;
  }

  if (match.state !== "in_progress") {
    await ctx.reply("Match is not in progress.");
    return;
  }

  if (match.turn !== ctx.from.id) {
    await ctx.reply("It is not your turn.");
    return;
  }

  const opponent =
    match.playerA === ctx.from.id ? match.playerB : match.playerA;

  const outcome = await boardStorage.fire(opponent, row, col);
  if (!outcome) {
    await ctx.reply("You already fired at this cell.");
    return;
  }

  const move = await moveStorage.create(
    match.id,
    ctx.from.id,
    outcome.position,
    outcome.result,
  );

  const won = checkWinCondition(outcome.board);

  if (won) {
    await matchStorage.completeMatch(match.id);
    await ctx.reply(
      `Move #${move.id}: ${outcome.result} at (${outcome.position.row},${outcome.position.col}). All enemy ships destroyed! You win!`,
    );
    return;
  }

  await matchStorage.passTurn(match.id, ctx.from.id);
  await ctx.reply(
    `Move #${move.id}: ${outcome.result} at (${outcome.position.row},${outcome.position.col}). Next player's turn.`,
  );
});

composer.command("history", async (ctx) => {
  if (!ctx.from) {
    await ctx.reply("This command can only be used in private chat.");
    return;
  }
  const matches = await matchStorage.findByPlayer(ctx.from.id);
  const active = matches.filter((m) => m.state !== "completed");
  if (active.length === 0) {
    await ctx.reply("You have no active match.");
    return;
  }
  const match = active[0];
  const moves = await moveStorage.findByMatch(match.id);
  if (moves.length === 0) {
    await ctx.reply("No moves recorded yet.");
    return;
  }
  const lines = moves.map(
    (m) => `#${m.id}: (${m.coordinate.row},${m.coordinate.col}) → ${m.result}`,
  );
  await ctx.reply(
    `Move history for match #${match.id}:\n${lines.join("\n")}`,
  );
});

export default composer;