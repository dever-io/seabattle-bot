import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { createRequire } from "node:module";

function getRedisClient() {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  const require = createRequire(import.meta.url);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ioredis: any = require("ioredis");
  const Redis = ioredis.default ?? ioredis.Redis ?? ioredis;
  return new Redis(url, { maxRetriesPerRequest: null, lazyConnect: false }) as {
    sadd(key: string, ...members: string[]): Promise<number>;
  };
}

const redis = getRedisClient();

const composer = new Composer<Ctx>();

composer.callbackQuery("matchmaking:quick", async (ctx) => {
  await ctx.answerCallbackQuery();

  const chatId = ctx.chat?.id;
  if (chatId && redis) {
    await redis.sadd("matchmaking:queue", chatId.toString());
  }

  await ctx.editMessageText("Looking for a match...");
});

export default composer;