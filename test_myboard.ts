import { readFileSync } from "node:fs";
import { buildBot } from "./src/bot.js";
import { runSpecs, parseBotSpec } from "./src/toolkit/index.js";
import { resetBoardStorage } from "./src/models/board.js";

async function main() {
  resetBoardStorage();
  
  const raw = JSON.parse(
    readFileSync(new URL("./tests/specs/board-model.json", import.meta.url), "utf8"),
  ) as unknown[];
  const specs = raw.map(parseBotSpec);
  
  for (const spec of specs) {
    if (spec.name.includes("myboard") || spec.name.includes("board with ships")) {
      console.log("Running spec:", spec.name);
      const suite = await runSpecs(() => buildBot("test-token"), [spec]);
      console.log("Result:", JSON.stringify(suite, null, 2));
    }
  }
}

main().catch(console.error);
