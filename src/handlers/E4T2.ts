import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { createRequire } from "node:module";

interface RatingQueueRedis {
  zadd(key: string, score: number, member: string): Promise<number>;
  zrem(key: string, ...members: string[]): Promise<number>;
  zrangebyscore(key: string, min: number, max: number): Promise<string[]>;
  set(key: string, value: string): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<unknown>;
}

function getRatingQueueClient(): RatingQueueRedis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  try {
    const require = createRequire(import.meta.url);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ioredis: any = require("ioredis");
    const Redis = ioredis.default ?? ioredis.Redis ?? ioredis;
    return new Redis(url, {
      maxRetriesPerRequest: null,
      lazyConnect: false,
    }) as RatingQueueRedis;
  } catch {
    return null;
  }
}

const redis = getRatingQueueClient();

const composer = new Composer<Ctx>();

const QUEUE_ZSET = "matchmaking:rating:queue";
const CHAT_KEY_PREFIX = "mm:chat:";
const BASE_WINDOW = 100;
const EXPAND_INTERVAL_MS = 15_000;
const EXPAND_STEP = 100;
const INITIAL_RATING = 1200;

function computeWindowRadius(elapsedMs: number): number {
  const steps = Math.floor(elapsedMs / EXPAND_INTERVAL_MS);
  return BASE_WINDOW + steps * EXPAND_STEP;
}

composer.command("rmatch", async (ctx) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const userId = ctx.from?.id;
  if (!userId) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sess = ctx.session as any;
  sess.mmActive = true;
  sess.mmStartTime = Date.now();
  sess.mmRating = INITIAL_RATING;

  if (redis) {
    try {
      await redis.zadd(QUEUE_ZSET, sess.mmRating, userId.toString());
      await redis.set(CHAT_KEY_PREFIX + userId.toString(), chatId.toString());
    } catch {
      // queue push failed; user can still see the search UI
    }
  }

  const windowRadius = computeWindowRadius(0);

  const keyboard = {
    inline_keyboard: [
      [
        { text: "Wait (expand window)", callback_data: "mm:wait" },
        { text: "Friend Invite", callback_data: "mm:friend" },
      ],
    ],
  };

  await ctx.reply(
    `Searching for opponent...\nRating: ${sess.mmRating}\nRating window: ±${windowRadius}`,
    { reply_markup: keyboard },
  );
});

composer.callbackQuery("mm:wait", async (ctx) => {
  await ctx.answerCallbackQuery();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sess = ctx.session as any;
  const userId = ctx.from?.id;

  if (!sess.mmActive || !sess.mmStartTime) {
    await ctx.editMessageText("No active matchmaking search. Use /rmatch to start.");
    return;
  }

  const elapsedMs = Date.now() - sess.mmStartTime;
  const windowRadius = computeWindowRadius(elapsedMs);
  const rating = (sess.mmRating as number) ?? INITIAL_RATING;

  if (redis && userId) {
    try {
      const minScore = rating - windowRadius;
      const maxScore = rating + windowRadius;
      const candidates = await redis.zrangebyscore(QUEUE_ZSET, minScore, maxScore);
      const opponentId = candidates.find((id) => id !== userId.toString());
      if (opponentId) {
        await redis.zrem(QUEUE_ZSET, userId.toString(), opponentId);
        await redis.del(CHAT_KEY_PREFIX + userId.toString());
        await redis.del(CHAT_KEY_PREFIX + opponentId);
        sess.mmActive = false;

        const opponentChatId = await redis.get(CHAT_KEY_PREFIX + opponentId);
        if (opponentChatId) {
          await ctx.api.sendMessage(
            parseInt(opponentChatId, 10),
            `Match found!\nOpponent: ${userId}\nUse /newmatch ${userId} to start a game`,
          ).catch(() => {});
        }

        await ctx.editMessageText(
          `Match found!\nYour rating: ${rating}\nOpponent: ${opponentId}\nRating window used: ±${windowRadius}`,
        );
        return;
      }
    } catch {
      // queue lookup failed; keep showing search UI
    }
  }

  const steps = Math.floor(elapsedMs / EXPAND_INTERVAL_MS);
  const keyboard = {
    inline_keyboard: [
      [
        { text: "Wait (expand window)", callback_data: "mm:wait" },
        { text: "Friend Invite", callback_data: "mm:friend" },
      ],
    ],
  };

  await ctx.editMessageText(
    `Still searching...\nRating: ${rating}\nRating window: ±${windowRadius} (${
      steps > 0 ? `${steps} expansions` : "no expansions yet"
    })\nElapsed: ~${Math.floor(elapsedMs / 1000)}s`,
    { reply_markup: keyboard },
  );
});

composer.callbackQuery("mm:friend", async (ctx) => {
  await ctx.answerCallbackQuery();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sess = ctx.session as any;
  sess.mmActive = false;

  const userId = ctx.from?.id;
  if (redis && userId) {
    try {
      await redis.zrem(QUEUE_ZSET, userId.toString());
      await redis.del(CHAT_KEY_PREFIX + userId.toString());
    } catch {
      // removal failed; user is no longer active anyway
    }
  }

  const botUsername = ctx.me?.username ?? "bot";
  const inviteLink = `https://t.me/${botUsername}?start=invite${userId}`;

  await ctx.editMessageText(
    `Matchmaking cancelled.\n\nShare this link with a friend to play:\n${inviteLink}`,
  );
});

export default composer;