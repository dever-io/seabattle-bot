# fix-f786c6dfe045e47d — E7T1 session reset on re-calling /attack causes grid/board state mismatch

**Weight:** 0.0000 (share of project budget)
**Reward:** 0 SBOT

When `/attack` is called again for the same user, `attacks` is reset to `[]` (line 103) while the `boardStorage` for the same `opponentId` (recomputed at line 96) retains all previous hits/misses. The displayed grid shows `~` for previously-fired cells, but `boardStorage.fire()` correctly returns `null` for already-occupied positions. The user sees a confusing 'Already fired there!' alert on cells displayed as unknown.

**Steps to reproduce:**
1. `/attack` → fire at (0,0) → grid shows 'X'
2. `/attack` again → grid shows `~` at (0,0)
3. Tap (0,0) → alert: "Already fired there!" with no explanation in the grid

## Dialog tests

This is a FIX task: the behavior it repairs is already covered by an existing spec under `tests/specs/`. Fix the code to make that existing spec pass — do NOT author a new `tests/specs/fix-f786c6dfe045e47d.json` (a duplicate spec for the same behavior makes the tests-gate count it twice and it can never go green). Add a new spec file ONLY if you are introducing genuinely new user-facing behavior that no existing spec covers; if so, name it `tests/specs/fix-f786c6dfe045e47d.json` (and any new command `tests/commands/fix-f786c6dfe045e47d.json`).


## Handler module

This is a FIX task. Find the EXISTING handler under `src/handlers/` that implements the affected command/behavior and EDIT it in place. Do NOT create a new `src/handlers/fix-f786c6dfe045e47d.ts` — a second `Composer` binding the same command conflicts with the original and breaks the bot. Create a new handler file ONLY if the affected command does not exist anywhere yet (then name it `src/handlers/fix-f786c6dfe045e47d.ts` and default-export a grammY `Composer`; `buildBot()` auto-loads it). NEVER edit `src/bot.ts`; the global error boundary + unknown-command fallback already live in `buildBot()`.


## Implementation contract

Ship a COMPLETE, working implementation — not a stub. A task is INCOMPLETE (and will be rejected) even if it compiles and the dialog tests pass when it does any of these:
- **Stubbed code:** empty bodies, `TODO`/`FIXME`, commented-out logic, or `throw new Error("not implemented")`.
- **Fabricated data:** `Math.random()`, hardcoded sample arrays, or canned responses standing in for real computed or fetched values.
- **No in-memory data store:** a `Map`/array/module-level variable used as a database is a defect. Anything that must survive a restart (records, subscriptions, balances, schedules, settings) MUST use the toolkit's persistent storage (Redis-backed), not process memory. (The toolkit's auto-selected session storage is only for ephemeral conversation state.)
- **Broken integrations:** call external APIs against their real contract — correct endpoints, ids and params (e.g. a coin *id* like `the-open-network`, not a ticker like `TON`) — with credentials read from env. Do not invent endpoints or fake responses.
- **Dead code:** the feature's command/handler must be registered via its default-exported `Composer` in `src/handlers/<slug>.ts` (auto-loaded) and reachable from the bot's command surface.
If the spec is genuinely under-specified, implement the smallest REAL slice you can verify and note the gap — never fake behavior to make the PR look complete.
