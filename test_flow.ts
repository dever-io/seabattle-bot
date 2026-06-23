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
  
  // Run all specs ONE BY ONE with a fresh bot each time (as harness-entry does)
  for (const spec of specs) {
    const suite = await runSpecs(async () => {
      resetBoardStorage();
      return buildBot("test-token");
    }, [spec]);
    if (!suite.results[0].ok) {
      console.log("FAILED:", spec.name);
      console.log(JSON.stringify(suite.results[0], null, 2));
    }
  }
  
  console.log("Running ALL specs in ONE bot (shared state):");
  resetBoardStorage();
  const suite = await runSpecs(() => buildBot("test-token"), specs);
  for (const r of suite.results) {
    if (!r.ok) {
      console.log("FAILED:", r.name);
      for (let i = 0; i < r.steps.length; i++) {
        if (!r.steps[i].ok) {
          console.log(`  step ${i+1}:`, r.steps[i].failures.join("; "));
          for (const c of r.steps[i].captured) {
            console.log(`    actual: ${c.method} ${JSON.stringify(c.payload)}`);
          }
        }
      }
    }
  }
}

main().catch(console.error);
