import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { getRedisClient } from "../storage/persistent.js";

const redis = getRedisClient();

const composer = new Composer<Ctx>();

const QUEUE_KEY = "matchmaking:queue";

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

  await redis.rpush(QUEUE_KEY, currentChatStr);

  const queueLen = await redis.llen(QUEUE_KEY);

  if (queueLen >= 2) {
    const p1 = await redis.lpop(QUEUE_KEY);
    const p2 = await redis.lpop(QUEUE_KEY);

    if (p1 && p2) {
      const matchKey = `match:${p1}:${p2}`;
      await redis.set(matchKey, JSON.stringify({
        p1,
        p2,
        createdAt: Date.now(),
      }));

      const confirmKeyboard = {
        inline_keyboard: [[
          { text: "Place ships now", callback_data: "ships:place" },
          { text: "Auto-place", callback_data: "ships:auto" },
        ]],
      };

      const p1ChatId = parseInt(p1, 10);
      const p2ChatId = parseInt(p2, 10);

      await Promise.all([
        ctx.api.sendMessage(p1ChatId, "Match found! Place ships now or Auto-place.", {
          reply_markup: confirmKeyboard,
        }),
        ctx.api.sendMessage(p2ChatId, "Match found! Place ships now or Auto-place.", {
          reply_markup: confirmKeyboard,
        }),
      ]);
    }
  } else {
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