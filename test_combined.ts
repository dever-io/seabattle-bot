import { readFileSync, readdirSync } from "node:fs";
import { buildBot } from "./src/bot.js";
import { runSpecs, parseBotSpec, formatSuiteResult } from "./src/toolkit/index.js";
import { makeBot } from "./src/harness-entry.js";

async function main() {
  const specsDir = new URL("./tests/specs/", import.meta.url);
  const files = readdirSync(specsDir).filter(f => f.endsWith(".json")).sort();
  
  // Concatenate ALL specs into a single array (like the Tests-gate does)
  const allSpecs = [];
  for (const file of files) {
    const raw = JSON.parse(
      readFileSync(new URL(file, specsDir), "utf8"),
    ) as unknown[];
    allSpecs.push(...raw.map(parseBotSpec));
  }
  
  console.log(`Total specs: ${allSpecs.length}`);
  
  // Use makeBot from harness-entry (which resets storage)
  const suite = await runSpecs(makeBot, allSpecs);
  console.log(formatSuiteResult(suite));
}

main().catch(console.error);
