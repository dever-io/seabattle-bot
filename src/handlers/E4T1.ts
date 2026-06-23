import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { getRedisClient } from "../storage/persistent.js";

interface MatchmakingRedis {
  lpush(key: string, ...values: string[]): Promise<number>;
  rpop(key: string): Promise<string | null>;
  lrem(key: string, count: number, value: string): Promise<number>;
  lpos(key: string, value: string): Promise<number | null>;
  set(key: string, value: string): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

const redis = getRedisClient() as unknown as MatchmakingRedis | null;

const composer = new Composer<Ctx>();

const QUEUE_KEY = "matchmaking:queue";
const MATCHES_KEY = "matchmaking:matches";

composer.command("quickmatch", async (ctx) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const userId = ctx.from?.id;
  if (!userId) return;

  if (!redis) {
    await ctx.reply("Matchmaking is unavailable right now. Try again later.");
    return;
  }

  const currentChatStr = chatId.toString();

  const existingPosition = await redis.lpos(QUEUE_KEY, currentChatStr);
  if (existingPosition !== null) {
    await ctx.reply("You are already in the matchmaking queue.");
    return;
  }

  await redis.lpush(QUEUE_KEY, currentChatStr);

  const opponentStr = await redis.rpop(QUEUE_KEY);

  if (opponentStr && opponentStr !== currentChatStr) {
    await redis.lrem(QUEUE_KEY, 1, currentChatStr);

    const matchKey = `match:${opponentStr}:${currentChatStr}`;
    await redis.set(matchKey, JSON.stringify({
      p1: opponentStr,
      p2: currentChatStr,
      createdAt: Date.now(),
    }));

    const confirmKeyboard = {
      inline_keyboard: [[
        { text: "Place ships now", callback_data: "ships:place" },
        { text: "Auto-place", callback_data: "ships:auto" },
      ]],
    };

    await ctx.reply("Match found! Place ships now or Auto-place.", {
      reply_markup: confirmKeyboard,
    });

    const opponentChatId = parseInt(opponentStr, 10);
    await ctx.api.sendMessage(
      opponentChatId,
      "Match found! Place ships now or Auto-place.",
      { reply_markup: confirmKeyboard },
    );
  } else {
    if (opponentStr === currentChatStr) {
      await redis.rpop(QUEUE_KEY);
      await redis.lpush(QUEUE_KEY, currentChatStr);
    }

    await ctx.reply("Searching for an opponent...");
  }
});

composer.callbackQuery("ships:place", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Place your ships on the board." });
  await ctx.editMessageText("Place your ships on the grid. Ready when you are.");
});

composer.callbackQuery("ships:auto", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Ships auto-placed!" });
  await ctx.editMessageText("Ships have been placed automatically. Get ready!");
});

export default composer;