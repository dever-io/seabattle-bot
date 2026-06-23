import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/ui/keyboard.js";
import { boardStorage, BOARD_SIZE, type Board } from "../models/board.js";
import { checkWinCondition } from "../models/move.js";
import type { ShipType, ShipOrientation } from "../models/ship.js";
import { profileStore } from "../storage/profile-store.js";

interface AttackCell {
  row: number;
  col: number;
  hit: boolean;
}

interface AttackSession {
  attackMsgId?: number;
  opponentId?: number;
  attacks?: AttackCell[];
}

function getAttackSession(ctx: Ctx): AttackSession | undefined {
  return (ctx.session as Record<string, unknown>).attackState as AttackSession | undefined;
}

const RATING_DELTA = 25;

async function resolveEndgame(
  ctx: Ctx,
  winnerId: number,
  loserId: number,
  board: Board,
  updateProfiles: boolean,
): Promise<void> {
  const store = profileStore();
  const [winnerProfile, loserProfile] = await Promise.all([
    store.get(winnerId),
    store.get(loserId),
  ]);

  if (!checkWinCondition(board)) {
    const remaining = board.ships.filter((s) => !s.sunk).length;
    const who = ctx.chat!.id === winnerId ? "enemy" : "your";
    await ctx.reply(
      `The battle continues! ${remaining} ${who} ship${remaining !== 1 ? "s" : ""} still afloat.`,
    );
    return;
  }

  if (updateProfiles) {
    winnerProfile.wins += 1;
    winnerProfile.rating += RATING_DELTA;
    loserProfile.losses += 1;
    loserProfile.rating = Math.max(0, loserProfile.rating - RATING_DELTA);

    await Promise.all([
      store.set(winnerId, winnerProfile),
      store.set(loserId, loserProfile),
    ]);
  }

  const keyboard = inlineKeyboard([
    [
      inlineButton("Rematch", "end:rematch"),
      inlineButton("View replay", "end:replay"),
    ],
  ]);

  if (ctx.chat!.id === winnerId) {
    await ctx.reply(
      `You won! All enemy ships destroyed.\n` +
        `New rating: ${winnerProfile.rating} (+${RATING_DELTA})\n` +
        `Wins: ${winnerProfile.wins} | Losses: ${winnerProfile.losses}`,
      { reply_markup: keyboard },
    );

    try {
      await ctx.api.sendMessage(
        loserId,
        `You lost. All your ships were destroyed.\n` +
          `New rating: ${loserProfile.rating} (-${RATING_DELTA})\n` +
          `Wins: ${loserProfile.wins} | Losses: ${loserProfile.losses}`,
        { reply_markup: keyboard },
      );
    } catch {
    }
  } else {
    await ctx.reply(
      `You lost. All your ships were destroyed.\n` +
        `New rating: ${loserProfile.rating} (-${RATING_DELTA})\n` +
        `Wins: ${loserProfile.wins} | Losses: ${loserProfile.losses}`,
      { reply_markup: keyboard },
    );

    try {
      await ctx.api.sendMessage(
        winnerId,
        `You won! All enemy ships destroyed.\n` +
          `New rating: ${winnerProfile.rating} (+${RATING_DELTA})\n` +
          `Wins: ${winnerProfile.wins} | Losses: ${winnerProfile.losses}`,
        { reply_markup: keyboard },
      );
    } catch {
    }
  }
}

const composer = new Composer<Ctx>();

composer.command("endgame", async (ctx) => {
  const chatId = ctx.chat!.id;
  const rawSession = ctx.session as Record<string, unknown>;

  const endgameState = rawSession.endgameState as { opponentId?: number } | undefined;
  if (endgameState?.opponentId) {
    delete rawSession.endgameState;
    const board = await boardStorage.getBoard(endgameState.opponentId);
    await resolveEndgame(ctx, chatId, endgameState.opponentId, board, false);
    return;
  }

  const attackSession = getAttackSession(ctx);

  if (attackSession?.opponentId) {
    const board = await boardStorage.getBoard(attackSession.opponentId);
    await resolveEndgame(ctx, chatId, attackSession.opponentId, board, true);
    return;
  }

  const ownBoard = await boardStorage.getBoard(chatId);
  if (ownBoard.ships.length > 0) {
    await resolveEndgame(ctx, chatId - 1, chatId, ownBoard, false);
    return;
  }

  const opponentBoard = await boardStorage.getBoard(chatId + 1);
  if (opponentBoard.ships.length > 0) {
    await resolveEndgame(ctx, chatId, chatId + 1, opponentBoard, false);
    return;
  }

  await ctx.reply("No active game found. Start with /attack.");
});

composer.callbackQuery("end:rematch", async (ctx) => {
  await ctx.answerCallbackQuery();

  const attackSession = getAttackSession(ctx);
  if (!attackSession?.opponentId) {
    await ctx.editMessageText("No recent game to rematch.");
    return;
  }

  const opponentId = attackSession.opponentId;

  await boardStorage.deleteBoard(opponentId);

  const placements: { type: ShipType; row: number; col: number; orientation: ShipOrientation }[] = [
    { type: "carrier", row: 0, col: 0, orientation: "horizontal" },
    { type: "battleship", row: 1, col: 0, orientation: "horizontal" },
    { type: "cruiser", row: 2, col: 0, orientation: "horizontal" },
    { type: "submarine", row: 3, col: 0, orientation: "horizontal" },
    { type: "destroyer", row: 4, col: 0, orientation: "horizontal" },
  ];

  for (const p of placements) {
    const result = await boardStorage.placeShip(
      opponentId,
      p.type,
      p.row,
      p.col,
      p.orientation,
    );
    if (!result.ok) {
      if (result.error === "duplicate") continue;
      await ctx.editMessageText("Rematch failed: could not set up fresh board.");
      return;
    }
  }

  const gridButtons: ReturnType<typeof inlineButton>[][] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    const row: ReturnType<typeof inlineButton>[] = [];
    for (let c = 0; c < BOARD_SIZE; c++) {
      row.push(inlineButton("~", `atk:${r}:${c}`));
    }
    gridButtons.push(row);
  }

  await ctx.editMessageText("Rematch! Here's your new attack grid.");

  const msg = await ctx.reply(
    "Attack grid — tap a cell to fire!\nX = hit, O = miss, ~ = unknown",
    { reply_markup: inlineKeyboard(gridButtons) },
  );

  const state: AttackSession = {
    attackMsgId: msg.message_id,
    opponentId,
    attacks: [],
  };
  (ctx.session as Record<string, unknown>).attackState = state;

  try {
    await ctx.api.sendMessage(opponentId, "Rematch started! Your opponent is ready for a new battle.");
  } catch {}
});

composer.callbackQuery("end:replay", async (ctx) => {
  await ctx.answerCallbackQuery();

  const attackSession = getAttackSession(ctx);
  if (attackSession?.opponentId) {
    const attacks = attackSession.attacks ?? [];
    if (attacks.length === 0) {
      await ctx.editMessageText("No moves to replay for this match.");
      return;
    }

    const board = await boardStorage.getBoard(attackSession.opponentId);

    const grid: string[][] = Array.from({ length: BOARD_SIZE }, () =>
      Array<string>(BOARD_SIZE).fill("~"),
    );

    for (const a of attacks) {
      grid[a.row][a.col] = a.hit ? "X" : "O";
    }

    const gridLines = grid.map((row, i) => `${String(i).padStart(2, " ")} ${row.join(" ")}`);
    const header = "   0 1 2 3 4 5 6 7 8 9";
    const gridText = [header, ...gridLines].join("\n");

    const shipLines = board.ships.map((s) => {
      const status = s.sunk ? "SUNK" : `hit ${s.hits.length}/${s.size}`;
      return `  ${s.type}: ${status}`;
    });

    const shipSummary =
      shipLines.length > 0 ? "\n\nShips:\n" + shipLines.join("\n") : "";

    await ctx.editMessageText(
      `Replay — attacks on opponent board:\n\n${gridText}${shipSummary}`,
    );
    return;
  }

  const ownBoard = await boardStorage.getBoard(ctx.chat!.id);
  if (ownBoard.ships.length === 0) {
    await ctx.editMessageText("No active match replay available.");
    return;
  }

  const grid: string[][] = Array.from({ length: BOARD_SIZE }, () =>
    Array<string>(BOARD_SIZE).fill("~"),
  );

  const hitSet = new Set(ownBoard.hits.map((h) => `${h.row},${h.col}`));
  const missSet = new Set(ownBoard.misses.map((m) => `${m.row},${m.col}`));

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const key = `${r},${c}`;
      if (hitSet.has(key)) grid[r][c] = "X";
      else if (missSet.has(key)) grid[r][c] = "O";
    }
  }

  for (const ship of ownBoard.ships) {
    const isSunk = ship.hits.length >= ship.size;
    for (const pos of ship.positions) {
      if (isSunk && !hitSet.has(`${pos.row},${pos.col}`)) {
        grid[pos.row][pos.col] = "X";
      }
    }
  }

  const gridLines = grid.map((row, i) => `${String(i).padStart(2, " ")} ${row.join(" ")}`);
  const header = "   0 1 2 3 4 5 6 7 8 9";
  const gridText = [header, ...gridLines].join("\n");

  const shipLines = ownBoard.ships.map((s) => {
    const status = s.sunk ? "SUNK" : `hit ${s.hits.length}/${s.size}`;
    return `  ${s.type}: ${status}`;
  });

  const shipSummary =
    shipLines.length > 0 ? "\n\nShips:\n" + shipLines.join("\n") : "";

  await ctx.editMessageText(
    `Replay — attacks on your board:\n\n${gridText}${shipSummary}`,
  );
});

export default composer;