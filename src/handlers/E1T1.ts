import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { getRedisClient } from "../storage/persistent.js";

const composer = new Composer<Ctx>();

composer.callbackQuery("matchmaking:quick", async (ctx) => {
  await ctx.answerCallbackQuery();

  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const redis = getRedisClient();
  if (!redis) {
    await ctx.editMessageText("Matchmaking is temporarily unavailable");
    return;
  }

  await redis.sadd("matchmaking:queue", chatId.toString());
  await ctx.editMessageText("Looking for a match...");
});

export default composer;