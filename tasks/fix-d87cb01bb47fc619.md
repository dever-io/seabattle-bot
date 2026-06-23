# fix-d87cb01bb47fc619 — E7T1 /attack grid play is disconnected from the match/turn system E7T2 /turnt depends on

**Weight:** 0.0000 (share of project budget)
**Reward:** 0 SBOT

E7T1 (`/attack`) uses an artificial `opponentId = chatId + 1` (line 96) and has zero integration with `matchStorage`, `moveStorage`, or turn management. Moves are recorded only in ephemeral session state, not via `moveStorage`. E7T2 (`/turnt`) is designed to work with the match system and its inline button directs users to `/fire` (E9T4's command-based flow), not `/attack`. The two tasks form completely separate, incompatible gameplay flows — a user of the attack grid cannot participate in the match turn lifecycle, and a match-turn user gets no grid UI.

**Specific issues:**
- `opponentId` is fabricated as `chatId + 1` (no real opponent)
- No call to `matchStorage` (no match context)
- No call to `moveStorage` (moves not persistently recorded, violating "record the move" req)
- `notifyOpponent` sends plain text but no "Your Turn" button (E7T2's core requirement)
- E7T2 callback returns help about `/fire`, not `/attack`

## Dialog tests

This is a FIX task: the behavior it repairs is already covered by an existing spec under `tests/specs/`. Fix the code to make that existing spec pass — do NOT author a new `tests/specs/fix-d87cb01bb47fc619.json` (a duplicate spec for the same behavior makes the tests-gate count it twice and it can never go green). Add a new spec file ONLY if you are introducing genuinely new user-facing behavior that no existing spec covers; if so, name it `tests/specs/fix-d87cb01bb47fc619.json` (and any new command `tests/commands/fix-d87cb01bb47fc619.json`).


## Handler module

This is a FIX task. Find the EXISTING handler under `src/handlers/` that implements the affected command/behavior and EDIT it in place. Do NOT create a new `src/handlers/fix-d87cb01bb47fc619.ts` — a second `Composer` binding the same command conflicts with the original and breaks the bot. Create a new handler file ONLY if the affected command does not exist anywhere yet (then name it `src/handlers/fix-d87cb01bb47fc619.ts` and default-export a grammY `Composer`; `buildBot()` auto-loads it). NEVER edit `src/bot.ts`; the global error boundary + unknown-command fallback already live in `buildBot()`.


## Implementation contract

Ship a COMPLETE, working implementation — not a stub. A task is INCOMPLETE (and will be rejected) even if it compiles and the dialog tests pass when it does any of these:
- **Stubbed code:** empty bodies, `TODO`/`FIXME`, commented-out logic, or `throw new Error("not implemented")`.
- **Fabricated data:** `Math.random()`, hardcoded sample arrays, or canned responses standing in for real computed or fetched values.
- **No in-memory data store:** a `Map`/array/module-level variable used as a database is a defect. Anything that must survive a restart (records, subscriptions, balances, schedules, settings) MUST use the toolkit's persistent storage (Redis-backed), not process memory. (The toolkit's auto-selected session storage is only for ephemeral conversation state.)
- **Broken integrations:** call external APIs against their real contract — correct endpoints, ids and params (e.g. a coin *id* like `the-open-network`, not a ticker like `TON`) — with credentials read from env. Do not invent endpoints or fake responses.
- **Dead code:** the feature's command/handler must be registered via its default-exported `Composer` in `src/handlers/<slug>.ts` (auto-loaded) and reachable from the bot's command surface.
If the spec is genuinely under-specified, implement the smallest REAL slice you can verify and note the gap — never fake behavior to make the PR look complete.
