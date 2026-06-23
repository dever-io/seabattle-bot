import { Composer } from "grammy";
import { randomBytes } from "node:crypto";
import type { Ctx } from "../bot.js";
import { getRedisClient } from "../storage/persistent.js";

const composer = new Composer<Ctx>();

composer.callbackQuery("invite:create", async (ctx) => {
  await ctx.answerCallbackQuery();

  const redis = getRedisClient();
  if (!redis) {
    await ctx.reply("Could not create invite. Please try again later.");
    return;
  }

  const code = randomBytes(16).toString("hex");
  await redis.set(
    `invite:${code}`,
    JSON.stringify({
      createdAt: Date.now(),
      createdBy: ctx.from?.id ?? 0,
    }),
    "EX",
    7 * 24 * 60 * 60,
  );

  const botUsername = ctx.me?.username ?? "YourBot";
  const link = `https://t.me/${botUsername}?start=invite_${code}`;

  await ctx.reply(
    `Play with a friend! Share this invite link (valid for 7 days):\n${link}`,
  );
});

export default composer;