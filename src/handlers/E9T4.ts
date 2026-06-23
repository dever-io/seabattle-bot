import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { matchStorage } from "../models/match.js";
import type { Match } from "../models/match.js";
import { boardStorage } from "../models/board.js";
import { moveStorage, checkWinCondition } from "../models/move.js";

const composer = new Composer<Ctx>();

function activeListText(
  active: Match[],
  userId: number,
): string {
  return active
    .map((m) => {
      const opp = m.playerA === userId ? m.playerB : m.playerA;
      return `#${m.id} vs ${opp} (${m.state})`;
    })
    .join("\n");
}

composer.command("fire", async (ctx) => {
  if (!ctx.from) {
    await ctx.reply("This command can only be used in private chat.");
    return;
  }
  const args = ctx.message?.text?.trim().split(/\s+/) ?? [];
  const userId = ctx.from.id;

  if (args.length < 2) {
    await ctx.reply("Usage: /fire <row> <col>");
    return;
  }

  let row: number;
  let col: number;
  let match: Match;

  const matches = await matchStorage.findByPlayer(userId);
  const active = matches.filter((m) => m.state !== "completed");

  if (active.length === 0) {
    row = parseInt(args[1], 10);
    col = parseInt(args[2] ?? "", 10);
    if (isNaN(row) || row < 0 || isNaN(col) || col < 0) {
      await ctx.reply("Row and col must be non-negative integers.");
      return;
    }
    await ctx.reply("You have no active match.");
    return;
  }

  if (active.length === 1) {
    row = parseInt(args[1], 10);
    col = parseInt(args[2] ?? "", 10);
    if (isNaN(row) || row < 0 || isNaN(col) || col < 0) {
      await ctx.reply("Row and col must be non-negative integers.");
      return;
    }
    match = active[0];
  } else {
    if (args.length >= 4) {
      const matchId = args[1];
      const found = active.find((m) => m.id === matchId);
      if (!found) {
        await ctx.reply(
          "Match #" +
            matchId +
            " not found in your active matches.\n\nYour active matches:\n" +
            activeListText(active, userId),
        );
        return;
      }
      match = found;
      row = parseInt(args[2], 10);
      col = parseInt(args[3], 10);
      if (isNaN(row) || row < 0 || isNaN(col) || col < 0) {
        await ctx.reply("Row and col must be non-negative integers.");
        return;
      }
    } else if (args.length >= 3) {
      await ctx.reply(
        "You have multiple active matches. Specify the match ID:\n\n" +
          activeListText(active, userId) +
          "\n\nUsage: /fire <match_id> <row> <col>",
      );
      return;
    } else {
      await ctx.reply(
        "You have multiple active matches. Specify the match ID:\n\n" +
          activeListText(active, userId) +
          "\n\nUsage: /fire <match_id> <row> <col>",
      );
      return;
    }
  }

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

  if (match.turn !== userId) {
    await ctx.reply("It is not your turn.");
    return;
  }

  const opponent = match.playerA === userId ? match.playerB : match.playerA;

  const outcome = await boardStorage.fire(opponent, row, col);
  if (!outcome) {
    await ctx.reply("You already fired at this cell.");
    return;
  }

  const move = await moveStorage.create(
    match.id,
    userId,
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

  await matchStorage.passTurn(match.id, userId);
  await ctx.reply(
    `Move #${move.id}: ${outcome.result} at (${outcome.position.row},${outcome.position.col}). Next player's turn.`,
  );
});

composer.command("history", async (ctx) => {
  if (!ctx.from) {
    await ctx.reply("This command can only be used in private chat.");
    return;
  }
  const args = ctx.message?.text?.trim().split(/\s+/) ?? [];
  const userId = ctx.from.id;

  const matches = await matchStorage.findByPlayer(userId);
  const active = matches.filter((m) => m.state !== "completed");
  if (active.length === 0) {
    await ctx.reply("You have no active match.");
    return;
  }

  let match: Match;

  if (active.length === 1) {
    match = active[0];
  } else {
    if (args.length >= 2) {
      const matchId = args[1];
      const found = active.find((m) => m.id === matchId);
      if (!found) {
        await ctx.reply(
          "Match #" +
            matchId +
            " not found in your active matches.\n\nYour active matches:\n" +
            activeListText(active, userId),
        );
        return;
      }
      match = found;
    } else {
      await ctx.reply(
        "You have multiple active matches. Specify the match ID:\n\n" +
          activeListText(active, userId) +
          "\n\nUsage: /history <match_id>",
      );
      return;
    }
  }

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