import { readFileSync } from "node:fs";
import { buildBot } from "./src/bot.js";
import { runSpecs, parseBotSpec } from "./src/toolkit/index.js";
import { resetBoardStorage } from "./src/models/board.js";
import { resetMatchStorage } from "./src/models/match.js";
import { resetMoveStorage } from "./src/models/move.js";
import { resetUserStorage } from "./src/models/user.js";
import { resetMatchInviteStorage } from "./src/models/invite.js";
import { resetProfileStore } from "./src/storage/profile-store.js";
import { resetMatchmakingQueue } from "./src/storage/matchmaking-queue.js";
import { resetInviteStore } from "./src/storage/invite-store.js";

function resetAll() {
  resetBoardStorage();
  resetMatchStorage();
  resetMoveStorage();
  resetUserStorage();
  resetMatchInviteStorage();
  resetProfileStore();
  resetMatchmakingQueue();
  resetInviteStore();
}

async function main() {
  const raw = JSON.parse(
    readFileSync(new URL("./tests/specs/board-model.json", import.meta.url), "utf8"),
  ) as unknown[];
  const specs = raw.map(parseBotSpec);
  
  // Test 1: Use makeBot-style (reset all before bot creation)
  console.log("=== Test 1: reset all before each spec ===");
  resetAll();
  const suite1 = await runSpecs(async () => {
    resetAll();
    return buildBot("test-token");
  }, specs);
  console.log("Passed:", suite1.passed, "/ Failed:", suite1.failed);
  for (const r of suite1.results) {
    console.log(`  ${r.ok ? "✓" : "✗"} ${r.name}`);
    if (!r.ok) {
      for (let i = 0; i < r.steps.length; i++) {
        const st = r.steps[i];
        if (!st.ok) {
          console.log(`    step ${i+1}: ${st.failures.join("; ")}`);
          for (const c of st.captured) {
            console.log(`      actual: ${c.method} ${JSON.stringify(c.payload)}`);
          }
        }
      }
    }
  }
  
  // Test 2: reset once before the suite, NOT per spec
  console.log("\n=== Test 2: reset once before suite ===");
  resetAll();
  const suite2 = await runSpecs(() => buildBot("test-token"), specs);
  console.log("Passed:", suite2.passed, "/ Failed:", suite2.failed);
  for (const r of suite2.results) {
    console.log(`  ${r.ok ? "✓" : "✗"} ${r.name}`);
    if (!r.ok) {
      for (let i = 0; i < r.steps.length; i++) {
        const st = r.steps[i];
        if (!st.ok) {
          console.log(`    step ${i+1}: ${st.failures.join("; ")}`);
          for (const c of st.captured) {
            console.log(`      actual: ${c.method} ${JSON.stringify(c.payload)}`);
          }
        }
      }
    }
  }
}

main().catch(console.error);
