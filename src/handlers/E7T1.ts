import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/ui/keyboard.js";
import {
  boardStorage,
  BOARD_SIZE,
  SHOT_RESULT_HIT,
  SHOT_RESULT_MISS,
  SHOT_RESULT_SUNK,
} from "../models/board.js";
import { type ShipType, type ShipOrientation } from "../models/ship.js";
import { moveStorage, checkWinCondition } from "../models/move.js";
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

const FIXED_PLACEMENTS: { type: ShipType; row: number; col: number; orientation: ShipOrientation }[] = [
  { type: "carrier", row: 0, col: 0, orientation: "horizontal" },
  { type: "battleship", row: 1, col: 0, orientation: "horizontal" },
  { type: "cruiser", row: 2, col: 0, orientation: "horizontal" },
  { type: "submarine", row: 3, col: 0, orientation: "horizontal" },
  { type: "destroyer", row: 4, col: 0, orientation: "horizontal" },
];

const RATING_DELTA = 25;

function getAttackState(ctx: Ctx): AttackSession {
  return (ctx.session as Record<string, unknown>).attackState as AttackSession | undefined ?? {};
}

function setAttackState(ctx: Ctx, state: AttackSession): void {
  (ctx.session as Record<string, unknown>).attackState = state;
}

function clearAttackState(ctx: Ctx): void {
  delete (ctx.session as Record<string, unknown>).attackState;
}

async function triggerEndgame(ctx: Ctx, winnerId: number, loserId: number): Promise<void> {
  const store = profileStore();
  const [winnerProfile, loserProfile] = await Promise.all([
    store.get(winnerId),
    store.get(loserId),
  ]);

  winnerProfile.wins += 1;
  winnerProfile.rating += RATING_DELTA;
  loserProfile.losses += 1;
  loserProfile.rating = Math.max(0, loserProfile.rating - RATING_DELTA);

  await Promise.all([
    store.set(winnerId, winnerProfile),
    store.set(loserId, loserProfile),
  ]);

  const keyboard = inlineKeyboard([
    [
      inlineButton("Rematch", "end:rematch"),
      inlineButton("View replay", "end:replay"),
    ],
  ]);

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
}

function buildGridKeyboard(attacks: AttackCell[]): ReturnType<typeof inlineKeyboard> {
  const rows = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    const row: ReturnType<typeof inlineButton>[] = [];
    for (let c = 0; c < BOARD_SIZE; c++) {
      const attack = attacks.find((a) => a.row === r && a.col === c);
      const label = attack ? (attack.hit ? "X" : "O") : "~";
      row.push(inlineButton(label, `atk:${r}:${c}`));
    }
    rows.push(row);
  }
  return inlineKeyboard(rows);
}

async function seedOpponentBoard(opponentId: number): Promise<void> {
  const board = await boardStorage.getBoard(opponentId);
  if (board.ships.length > 0) {
    return;
  }
  for (const placement of FIXED_PLACEMENTS) {
    const result = await boardStorage.placeShip(
      opponentId,
      placement.type,
      placement.row,
      placement.col,
      placement.orientation,
    );
    if (!result.ok) {
      if (result.error === "duplicate") {
        continue;
      }
      return;
    }
  }
}

async function notifyOpponent(
  ctx: Ctx,
  opponentId: number,
  row: number,
  col: number,
  result: string,
  shipName?: string,
): Promise<void> {
  const prefix = "Opponent";
  let text: string;
  if (result === SHOT_RESULT_MISS) {
    text = `${prefix} fired at (${row}, ${col}) — Miss!`;
  } else if (result === SHOT_RESULT_HIT) {
    text = `${prefix} fired at (${row}, ${col}) — Hit!`;
  } else {
    text = `${prefix} fired at (${row}, ${col}) — Sunk the ${shipName ?? "ship"}!`;
  }
  try {
    await ctx.api.sendMessage(opponentId, text);
  } catch {}
}

const composer = new Composer<Ctx>();

composer.command("attack", async (ctx) => {
  const chatId = ctx.chat!.id;
  const opponentId = chatId + 1;

  await seedOpponentBoard(opponentId);

  const state: AttackSession = {
    attackMsgId: 0,
    opponentId,
    attacks: [],
  };

  const gridKeyboard = buildGridKeyboard(state.attacks ?? []);
  const msg = await ctx.reply(
    "Attack grid — tap a cell to fire!\nX = hit, O = miss, ~ = unknown",
    { reply_markup: gridKeyboard },
  );

  state.attackMsgId = msg.message_id;
  setAttackState(ctx, state);
});

composer.callbackQuery(/^atk:(\d+):(\d+)$/, async (ctx) => {
  const state = getAttackState(ctx);
  if (!state.attackMsgId || state.opponentId == null) {
    await ctx.answerCallbackQuery({ text: "Start with /attack first.", show_alert: true });
    return;
  }

  const row = parseInt(ctx.match[1], 10);
  const col = parseInt(ctx.match[2], 10);
  const chatId = ctx.chat!.id;

  const attacks = state.attacks ?? [];

  if (attacks.some((a) => a.row === row && a.col === col)) {
    await ctx.answerCallbackQuery({ text: "Already fired there!", show_alert: true });
    return;
  }

  const outcome = await boardStorage.fire(state.opponentId, row, col);

  if (!outcome) {
    await ctx.answerCallbackQuery({ text: "Already fired there!", show_alert: true });
    return;
  }

  if (outcome.result === SHOT_RESULT_MISS) {
    attacks.push({ row, col, hit: false });
    state.attacks = attacks;
    setAttackState(ctx, state);

    await moveStorage.create(
      `attack:${chatId}:${state.opponentId}`,
      chatId,
      outcome.position,
      outcome.result,
    );

    const gridKeyboard = buildGridKeyboard(attacks);
    try {
      await ctx.api.editMessageText(
        chatId,
        state.attackMsgId,
        "Attack grid — tap a cell to fire!\nX = hit, O = miss, ~ = unknown",
        { reply_markup: gridKeyboard },
      );
    } catch {}

    await ctx.answerCallbackQuery({ text: "Miss!", show_alert: true });
    await notifyOpponent(ctx, state.opponentId, row, col, SHOT_RESULT_MISS);
  } else if (outcome.result === SHOT_RESULT_HIT) {
    attacks.push({ row, col, hit: true });
    state.attacks = attacks;
    setAttackState(ctx, state);

    await moveStorage.create(
      `attack:${chatId}:${state.opponentId}`,
      chatId,
      outcome.position,
      outcome.result,
    );

    const gridKeyboard = buildGridKeyboard(attacks);
    try {
      await ctx.api.editMessageText(
        chatId,
        state.attackMsgId,
        "Attack grid — tap a cell to fire!\nX = hit, O = miss, ~ = unknown",
        { reply_markup: gridKeyboard },
      );
    } catch {}

    await ctx.answerCallbackQuery({ text: "Hit!", show_alert: true });
    await notifyOpponent(ctx, state.opponentId, row, col, SHOT_RESULT_HIT);
  } else if (outcome.result === SHOT_RESULT_SUNK) {
    attacks.push({ row, col, hit: true });
    state.attacks = attacks;
    setAttackState(ctx, state);

    await moveStorage.create(
      `attack:${chatId}:${state.opponentId}`,
      chatId,
      outcome.position,
      outcome.result,
    );

    const gridKeyboard = buildGridKeyboard(attacks);
    try {
      await ctx.api.editMessageText(
        chatId,
        state.attackMsgId,
        "Attack grid — tap a cell to fire!\nX = hit, O = miss, ~ = unknown",
        { reply_markup: gridKeyboard },
      );
    } catch {}

    const shipName = outcome.ship?.type ?? "ship";
    await ctx.answerCallbackQuery({ text: `Sunk the ${shipName}!`, show_alert: true });
    await notifyOpponent(ctx, state.opponentId, row, col, SHOT_RESULT_SUNK, shipName);

    if (checkWinCondition(outcome.board)) {
      await triggerEndgame(ctx, chatId, state.opponentId);
      clearAttackState(ctx);
    }
  } else {
    await ctx.answerCallbackQuery();
  }
});

export default composer;