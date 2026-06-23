import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/ui/keyboard.js";
import { boardStorage } from "../models/board.js";
import { checkWinCondition } from "../models/move.js";
import { profileStore } from "../storage/profile-store.js";

interface AttackSession {
  attackMsgId?: number;
  opponentId?: number;
}

function getAttackSession(ctx: Ctx): AttackSession | undefined {
  return (ctx.session as Record<string, unknown>).attackState as AttackSession | undefined;
}

const RATING_DELTA = 25;

const composer = new Composer<Ctx>();

composer.command("endgame", async (ctx) => {
  const chatId = ctx.chat!.id;
  const attackSession = getAttackSession(ctx);

  if (!attackSession?.opponentId) {
    await ctx.reply("No active game found. Start with /attack.");
    return;
  }

  const opponentId = attackSession.opponentId;
  const board = await boardStorage.getBoard(opponentId);

  if (!checkWinCondition(board)) {
    const remaining = board.ships.filter((s) => !s.sunk).length;
    await ctx.reply(
      `The battle continues! ${remaining} enemy ship${remaining !== 1 ? "s" : ""} still afloat.`,
    );
    return;
  }

  const winnerId = chatId;
  const loserId = opponentId;

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
    // opponent may not be reachable
  }
});

composer.callbackQuery("end:rematch", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    "Rematch requested! Set up a new game with /invite or /quickmatch.",
  );
});

composer.callbackQuery("end:replay", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    "Replay viewer coming soon. Check your match history with /history.",
  );
});

export default composer;