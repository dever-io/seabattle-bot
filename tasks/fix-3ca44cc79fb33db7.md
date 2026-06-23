# fix-3ca44cc79fb33db7 — Race condition in nextCode — concurrent /invite calls can collide on the same code

**Weight:** 0.0000 (share of project budget)
**Reward:** 0 SBOT

`nextCode()` in `src/storage/invite-store.ts:55-59` is a read-modify-write cycle on the counter key `invite:counter`. Two concurrent `/invite` calls: (A) reads counter → 5, (B) reads counter → 5 (before A writes), both compute next = 6, both write back 6. Both return `INV-6`. Then `createInvite` is called twice with the same code — the second call overwrites the first invite entry, silently losing the first invite.

With Redis: use `INCR` instead of read+write. With the fallback Map: as a single-threaded in-process store this is technically safe (no interleaving between `await` points for the Map path), but the Redis path has the hole.

## Dialog tests

This is a FIX task: the behavior it repairs is already covered by an existing spec under `tests/specs/`. Fix the code to make that existing spec pass — do NOT author a new `tests/specs/fix-3ca44cc79fb33db7.json` (a duplicate spec for the same behavior makes the tests-gate count it twice and it can never go green). Add a new spec file ONLY if you are introducing genuinely new user-facing behavior that no existing spec covers; if so, name it `tests/specs/fix-3ca44cc79fb33db7.json` (and any new command `tests/commands/fix-3ca44cc79fb33db7.json`).


## Handler module

This is a FIX task. Find the EXISTING handler under `src/handlers/` that implements the affected command/behavior and EDIT it in place. Do NOT create a new `src/handlers/fix-3ca44cc79fb33db7.ts` — a second `Composer` binding the same command conflicts with the original and breaks the bot. Create a new handler file ONLY if the affected command does not exist anywhere yet (then name it `src/handlers/fix-3ca44cc79fb33db7.ts` and default-export a grammY `Composer`; `buildBot()` auto-loads it). NEVER edit `src/bot.ts`; the global error boundary + unknown-command fallback already live in `buildBot()`.


## Implementation contract

Ship a COMPLETE, working implementation — not a stub. A task is INCOMPLETE (and will be rejected) even if it compiles and the dialog tests pass when it does any of these:
- **Stubbed code:** empty bodies, `TODO`/`FIXME`, commented-out logic, or `throw new Error("not implemented")`.
- **Fabricated data:** `Math.random()`, hardcoded sample arrays, or canned responses standing in for real computed or fetched values.
- **No in-memory data store:** a `Map`/array/module-level variable used as a database is a defect. Anything that must survive a restart (records, subscriptions, balances, schedules, settings) MUST use the toolkit's persistent storage (Redis-backed), not process memory. (The toolkit's auto-selected session storage is only for ephemeral conversation state.)
- **Broken integrations:** call external APIs against their real contract — correct endpoints, ids and params (e.g. a coin *id* like `the-open-network`, not a ticker like `TON`) — with credentials read from env. Do not invent endpoints or fake responses.
- **Dead code:** the feature's command/handler must be registered via its default-exported `Composer` in `src/handlers/<slug>.ts` (auto-loaded) and reachable from the bot's command surface.
If the spec is genuinely under-specified, implement the smallest REAL slice you can verify and note the gap — never fake behavior to make the PR look complete.
