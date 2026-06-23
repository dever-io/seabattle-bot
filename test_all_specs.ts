import { readFileSync, readdirSync } from "node:fs";
import { buildBot } from "./src/bot.js";
import { runSpecs, parseBotSpec, formatSuiteResult } from "./src/toolkit/index.js";
import { resetBoardStorage } from "./src/models/board.js";
import { resetMatchStorage } from "./src/models/match.js";
import { resetMoveStorage } from "./src/models/move.js";
import { resetUserStorage } from "./src/models/user.js";
import { resetMatchInviteStorage } from "./src/models/invite.js";
import { resetProfileStore } from "./src/storage/profile-store.js";
import { resetMatchmakingQueue } from "./src/storage/matchmaking-queue.js";
import { resetInviteStore } from "./src/storage/invite-store.js";

async function main() {
  const specsDir = new URL("./tests/specs/", import.meta.url);
  const files = readdirSync(specsDir).filter(f => f.endsWith(".json")).sort();
  
  let totalFailed = 0;
  let totalPassed = 0;
  let failedSpecNames: string[] = [];
  
  for (const file of files) {
    const raw = JSON.parse(
      readFileSync(new URL(file, specsDir), "utf8"),
    ) as unknown[];
    const specs = raw.map(parseBotSpec);
    
    // Simulate harness-entry: reset per file
    const suite = await runSpecs(async () => {
      resetBoardStorage();
      resetMatchStorage();
      resetMoveStorage();
      resetUserStorage();
      resetMatchInviteStorage();
      resetProfileStore();
      resetMatchmakingQueue();
      resetInviteStore();
      return buildBot("test-token");
    }, specs);
    
    totalFailed += suite.failed;
    totalPassed += suite.passed;
    
    for (const r of suite.results) {
      if (!r.ok) {
        failedSpecNames.push(`  ✗ ${r.name} (${file})`);
        for (let i = 0; i < r.steps.length; i++) {
          const st = r.steps[i];
          if (!st.ok) {
            failedSpecNames.push(`      step ${i+1}: ${st.failures.join("; ")}`);
          }
        }
      }
    }
  }
  
  console.log(`\nTotal: ${totalPassed + totalFailed} | Passed: ${totalPassed} | Failed: ${totalFailed}`);
  if (failedSpecNames.length > 0) {
    console.log("\nFailed specs:");
    for (const f of failedSpecNames) {
      console.log(f);
    }
  }
}

main().catch(console.error);
