import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { userStorage } from "../models/user.js";
import { paginate } from "../toolkit/ui/keyboard.js";

const PER_PAGE = 5;

const composer = new Composer<Ctx>();

async function showLeaderboard(ctx: Ctx, page: number) {
  const users = await userStorage.list();
  const sorted = [...users].sort((a, b) => b.rating - a.rating);
  const { pageItems, page: actualPage, totalPages, controls } = paginate(sorted, {
    page,
    perPage: PER_PAGE,
    callbackPrefix: "leaderboard",
    prevLabel: "« Prev",
    nextLabel: "Next »",
  });

  let text: string;
  if (pageItems.length === 0) {
    text = "No registered users yet.";
  } else {
    const lines = [`Leaderboard (page ${actualPage + 1}/${totalPages})`];
    for (let i = 0; i < pageItems.length; i++) {
      const u = pageItems[i];
      const rank = actualPage * PER_PAGE + i + 1;
      lines.push(`${rank}. ${u.display_name} — ${u.rating}`);
    }
    text = lines.join("\n");
  }

  try {
    await ctx.editMessageText(text, { reply_markup: controls });
  } catch {
    await ctx.reply(text, { reply_markup: controls });
  }
}

composer.callbackQuery("leaderboard:view", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showLeaderboard(ctx, 0);
});

composer.callbackQuery(/^leaderboard:prev:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await showLeaderboard(ctx, parseInt(ctx.match[1]));
});

composer.callbackQuery(/^leaderboard:next:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await showLeaderboard(ctx, parseInt(ctx.match[1]));
});

export default composer;