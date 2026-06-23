import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { getRedisClient } from "../storage/persistent.js";

interface RatingQueueRedis {
  zadd(key: string, score: number, member: string): Promise<number>;
  zrem(key: string, ...members: string[]): Promise<number>;
  zrangebyscore(key: string, min: number, max: number): Promise<string[]>;
}

const redis = getRedisClient() as unknown as RatingQueueRedis | null;

const composer = new Composer<Ctx>();

const QUEUE_ZSET = "matchmaking:rating:queue";
const BASE_WINDOW = 100;
const EXPAND_INTERVAL_MS = 15_000;
const EXPAND_STEP = 100;
const INITIAL_RATING = 1200;

export function computeWindowRadius(elapsedMs: number): number {
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
  const param = ctx.match?.trim();
  const offsetMs = param ? parseInt(param, 10) * 1000 : 0;
  if (!isNaN(offsetMs) && offsetMs >= 0) {
    sess.mmStartTime = Date.now() - offsetMs;
  } else {
    sess.mmStartTime = Date.now();
  }
  sess.mmRating = INITIAL_RATING;

  if (redis) {
    try {
      await redis.zadd(QUEUE_ZSET, sess.mmRating, userId.toString());
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
        sess.mmActive = false;

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