import { Composer } from "grammy";

// Replicate the handler logic from E9T3.ts
const shipType = "carrier";
const status = "";  // not sunk
const posStr = "(0,0) (0,1) (0,2) (0,3) (0,4)";

const shipLine = `${shipType} ${status}: ${posStr}`;
console.log("Ship line:", JSON.stringify(shipLine));

const lines = ["Board for player 1", shipLine, "Hits: (none)", "Misses: (none)"];
const actual = lines.join("\n");
console.log("Actual:", JSON.stringify(actual));

const expected = "Board for player 1\ncarrier : (0,0) (0,1) (0,2) (0,3) (0,4)\nHits: (none)\nMisses: (none)";
console.log("Expected:", JSON.stringify(expected));
console.log("Match:", actual === expected);

// Show hex diff if mismatch
if (actual !== expected) {
  for (let i = 0; i < Math.max(actual.length, expected.length); i++) {
    if (actual[i] !== expected[i]) {
      console.log(`Diff at pos ${i}: actual=0x${actual.charCodeAt(i).toString(16)} (${JSON.stringify(actual[i])}) expected=0x${expected.charCodeAt(i).toString(16)} (${JSON.stringify(expected[i])})`);
    }
  }
}
