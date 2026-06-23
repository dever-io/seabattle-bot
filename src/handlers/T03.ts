import { Composer } from "grammy";
import { readdirSync, readFileSync } from "node:fs";
import type { Ctx } from "../bot.js";

const composer = new Composer<Ctx>();

composer.command("help", async (ctx) => {
  const dir = new URL("./", import.meta.url);
  const files = readdirSync(dir).filter(
    (f) =>
      (f.endsWith(".js") || f.endsWith(".ts")) &&
      !f.endsWith(".d.ts") &&
      !f.includes(".test.") &&
      !f.includes(".spec."),
  );
  const commands: string[] = [];
  for (const file of files.sort()) {
    const content = readFileSync(new URL(file, dir), "utf8");
    const matches = content.matchAll(/\.command\(["'](\w+)["']/g);
    for (const m of matches) {
      commands.push(`/${m[1]}`);
    }
  }
  const unique = [...new Set(commands)].sort();
  await ctx.reply(
    unique.length > 0
      ? `Available commands:\n${unique.join("\n")}`
      : "No commands available yet.",
  );
});

export default composer;