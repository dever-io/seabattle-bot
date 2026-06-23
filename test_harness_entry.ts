import { readFileSync } from "node:fs";
import { buildBot } from "./src/bot.js";
import { runSpecs, parseBotSpec } from "./src/toolkit/index.js";
import { resetBoardStorage } from "./src/models/board.js";

async function main() {
  const raw = JSON.parse(
    readFileSync(new URL("./tests/specs/board-model.json", import.meta.url), "utf8"),
  ) as unknown[];
  const specs = raw.map(parseBotSpec);
  
  // Simulate what harness-entry.ts does: reset per spec
  const suite = await runSpecs(async () => {
    resetBoardStorage();
    return buildBot("test-token");
  }, specs);
  console.log("Suite result:", JSON.stringify(suite, null, 2));
}

main().catch(console.error);
