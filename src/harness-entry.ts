import { buildBot } from "./bot.js";
import { resetBoardStorage } from "./models/board.js";
import { resetMatchStorage } from "./models/match.js";
import { resetMoveStorage } from "./models/move.js";
import { resetUserStorage } from "./models/user.js";
import { resetMatchInviteStorage } from "./models/invite.js";
import { resetProfileStore } from "./storage/profile-store.js";
import { resetMatchmakingQueue } from "./storage/matchmaking-queue.js";

// The Tests-gate harness imports THIS module and calls makeBot() with no args,
// replaying dialog specs tokenlessly (it fakes the Bot API transport — no real
// Telegram call is made). The token is a placeholder for replay. The agntdev-ci
// orchestrator points AGNTDEV_BOT_MODULE at the compiled dist/harness-entry.js.
export async function makeBot() {
  resetBoardStorage();
  resetMatchStorage();
  resetMoveStorage();
  resetUserStorage();
  resetMatchInviteStorage();
  resetProfileStore();
  resetMatchmakingQueue();
  return buildBot(process.env.BOT_TOKEN ?? "harness-test-token");
}
