import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inviteStore } from "../storage/invite-store.js";

const composer = new Composer<Ctx>();

composer.command("invite", async (ctx) => {
  if (!ctx.from) {
    await ctx.reply("This command can only be used in private chat.");
    return;
  }
  const store = inviteStore();
  const code = await store.nextCode();
  await store.createInvite(code, {
    createdBy: ctx.from.id,
    createdAt: Date.now(),
  });
  const botUsername = ctx.me?.username ?? "YourBot";
  const link = `https://t.me/${botUsername}?start=invite_${code}`;
  await ctx.reply(
    `Share this invite link with a friend (valid for 7 days):\n${link}`,
  );
});

composer.command("start", async (ctx, next) => {
  const param = ctx.match?.trim();
  if (!param || !param.startsWith("invite_")) {
    await ctx.reply("Welcome! I am ready to help.");
    return;
  }

  const code = param.slice("invite_".length);
  if (!code) {
    await ctx.reply("Invalid invite link.");
    return;
  }

  const invitedId = ctx.from?.id;
  if (!invitedId) {
    await ctx.reply("Could not identify your account. Please try again.");
    return;
  }

  const store = inviteStore();
  const inviteData = await store.getInvite(code);
  if (!inviteData) {
    await ctx.reply("This invite link is invalid or has expired.");
    return;
  }

  if (invitedId === inviteData.createdBy) {
    await ctx.reply("You cannot use your own invite link.");
    return;
  }

  const consumed = await store.consumeInvite(code);
  if (!consumed) {
    await ctx.reply("This invite link is no longer available.");
    return;
  }

  const matchId = `match_${code}`;
  const pendingMatch = {
    matchId,
    player1Id: inviteData.createdBy,
    player2Id: invitedId,
    status: "pending" as const,
    createdAt: Date.now(),
    inviteCode: code,
  };
  await store.createPendingMatch(pendingMatch);

  const invitedName = ctx.from?.first_name ?? "an opponent";
  await ctx.api.sendMessage(
    inviteData.createdBy,
    `Your invite was accepted. A match with ${invitedName} is pending.`,
  );

  await ctx.reply(
    `Match pending! You are about to face the invite sender. Waiting for the host to confirm.`,
  );
});

export default composer;