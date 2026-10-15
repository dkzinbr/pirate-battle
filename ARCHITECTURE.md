# Architecture

This document explains how Pirate Battle is put together and why. It covers the React ↔ PixiJS boundary, the simulation loop, collisions, resource lifetime, persistence, and the ranking / history integration. It ends with the known limitations and the balancing rationale.

```text
┌──────────────────────────── React (screens, HUD, dialogs, forms) ────────────────────────────┐
│ MainMenu · Options · GameScreen · Result · CaptainsLog (Ranking/History) · NetworkLab         │
│        │ creates / destroys            ▲ useSyncExternalStore(hud)        ▲ TanStack Query     │
└────────┼───────────────────────────────┼──────────────────────────────────┼───────────────────┘
         ▼                               │                                  │
   GameSession ──── owns ───► World (pure simulation, fixed 120 Hz, seeded RNG)
     │   │                     ▲ ControlState per step                      │
     │   └── ArenaRenderer ◄───┘ reads entity state + drains GameEvents      │
     │        (Pixi scene, pooled effects)                                   │
     └── onEnded(summary) ─► enqueueSubmission (localStorage outbox) ──► useSubmissionSync
                                                                         │ Axios POST
                                                                         ▼
                                                             MSW service worker ("server")
```

## 1. Layers

| Layer | Folder | Knows about |
|---|---|---|
| Simulation | `src/game/core` | Nothing: no Pixi, no DOM, no React. Plain TypeScript and numbers. |
| Rendering | `src/game/render`, `src/game/assets` | PixiJS and simulation types; it reads the `World` but never mutates it. |
| Session | `src/game/GameSession.ts` | Wires the world, renderer, input, audio, pause rules and timers for **one** match. |
| UI | `src/app` | React. Mounts a session, renders the HUD and screens, and never touches entities. |
| Data | `src/api`, `src/mocks` | Axios contracts, TanStack Query, the outbox, and the MSW mock server. |
| Settings | `src/settings`, `src/shared/storage.ts` | Validated and versioned localStorage values. |

The rule throughout: **continuous game state never goes through React**. React learns about a match only through a small `HudState` (phase, pause reason, score, health, whole seconds left, end reason). That state lives in an `ExternalStore` with shallow equality, so React re-renders a few times per second at most, never once per frame.

## 2. React ↔ PixiJS integration

- **One renderer per page** (`render/pixiHost.ts`). A single `Application` (and one WebGL context) is created lazily on the first match and reused for the whole page lifetime. Creating a renderer per match leaks GPU contexts after a few restarts (browsers cap them at about 16) and forces texture re-uploads. Its ticker is stopped whenever no match is mounted.
- **`GameScreen` owns the session lifecycle.** An effect waits for the host and the atlases (`Promise.all`), creates a `GameSession`, mounts the shared canvas into a `div` ref, and registers the session with the test bridge. Its cleanup calls `session.destroy()`. A `cancelled` flag covers the Strict Mode double effect and unmounting while loading. The options are snapshotted with `useState(() => …)` when the match starts, so editing options later never changes a running match.
- **Sizing.** A `ResizeObserver` on the container resizes the renderer (resolution `min(devicePixelRatio, 2)`). `ArenaRenderer.layout` then letterboxes the fixed 1536×896 arena into it, preserving aspect ratio. Simulation units never depend on screen size, so desktop and mobile play the same game.
- **Input.** `KeyboardController` (desktop) and `TouchControls` (React buttons on touch devices) both write to the same `ControlInput`. The simulation reads one immutable `ControlState` per step through `sample()`. Presses are *latched* until a step consumes them, so a tap shorter than one 8.3 ms step still fires. `reset()` and `setEnabled(false)` drop held keys on pause, blur, and match end, so a key held while the window lost focus cannot keep the ship turning.
- **Pausing.** `pause(reason)` is triggered by Escape/P, the HUD button, `window.blur`, `visibilitychange → hidden`, or portrait orientation on touch devices. Resuming always requires an explicit click; returning to the tab never resumes on its own. On resume `FixedStepClock.reset()` empties the accumulator, so the pause time is never simulated.
- **End of match.** When the world ends, the session enters `ending`: the world is frozen while the explosion keeps animating for 1.4 s. Then `complete()` calls `onEnded(summary)` exactly once. `GameScreen` builds the `MatchRecord`, writes it to the outbox and the last-result slot *before* any network call, then replaces the route with `#/result`.

## 3. Simulation loop

- **Fixed step.** `FixedStepClock` is a classic accumulator. Each Pixi tick adds `deltaMS`, clamped to 100 ms so a long hitch cannot cause a spiral, and yields whole steps of `FIXED_DT = 1/120 s`. At 120 Hz a 540 u/s cannonball moves 4.5 units per step, smaller than any hit radius, so no swept collision is needed. Gameplay is identical at 30, 60 or 144 FPS.
- **Step order** (`World.step`):
  1. player (cooldowns, turning, acceleration and deceleration, movement, firing);
  2. spawner;
  3. enemies (AI, firing, movement);
  4. projectiles (move, range and lifetime, island or ship hit);
  5. ship contacts (ram or separation);
  6. compaction of dead entities;
  7. end check (`destroyed` takes priority over `time_up`).
- **Events instead of callbacks.** The world appends plain `GameEvent`s (`shot`, `shipHit`, `shipDestroyed`, `projectileSplash`, `ram`, `scoreChanged`, `matchEnded`, …). After each batch of steps the session drains them once and forwards them to the renderer (effects) and to audio. The world stays testable without any presentation code.
- **Determinism.** All randomness in the world (spawn type, spawn point) comes from a seeded `Rng` (mulberry32). Visual randomness has its own seeded generator, so particles never change gameplay. The same seed plus the same input sequence gives the same match, which the unit tests and E2E tests rely on.
- **Manual clock for tests.** With `?e2e=1&clock=manual` the ticker is stopped. `window.__pirate.advance(ms)` runs the real simulation for exactly that much game time and then renders once. Time beyond the end of the match plays out the end delay. Tests therefore exercise the production code path, without sleeps or flakiness, and an idle test page costs no CPU.

### AI

- **Chaser:** steers straight at the player at full speed. On contact it deals `contactDamage` once and sinks. It gives no score, because the player did not destroy it.
- **Shooter:** approaches until it is *engaged*, meaning within `attackRange` with a clear line of sight. It then aims at the player and creeps in at 40% speed until `preferredRange`. It fires when the cooldown is ready and the aim error is within `aimTolerance`. While engaged it skips obstacle avoidance; otherwise it would keep steering away from islands instead of shooting past them.
- **Obstacle avoidance** (both kinds, when not engaged): test candidate headings in the order `desired, ±0.45, ±0.9, ±1.35, ±1.8` rad. Each candidate is checked with three feeler points along a look-ahead of at most 110 units, and the first clear one is taken. This is cheap, predictable, and good enough for the convex, well-spaced islands in this arena.

### Spawning

- Enemies only spawn at the predefined candidate points along the arena border (`arena.ts`).
- A valid point is at least 460 units from the player, clear of islands by the ship radius, and clear of other living ships by 80 units plus their radius. The point is picked with the seeded RNG.
- The first two spawns are a chaser and then a shooter, so both types always appear. After that the type is a weighted roll (55/45). The rolled type is kept until it can be placed, so blocked spawns do not bias the mix.
- If no point is valid, or 10 enemies are already alive, the spawner retries after 0.25 s instead of waiting a full interval.
- The interval comes from the options (1–10 s) and the first spawn happens 1.5 s into the match.

## 4. Collisions

Everything is a circle (ship radius 23–28, projectile radius 4) or a **rounded rectangle**: an axis-aligned box plus a corner radius, matching the rounded island art. All queries are a clamp-to-box followed by a distance check (`core/collision.ts`), with no physics engine.

- **Ship vs island:** the circle is pushed out along the shortest vector. Two passes handle a ship wedged between two islands. Ships keep their heading and speed, so they slide along the coast instead of sticking.
- **Ship vs border:** the centre is clamped to `[radius, size − radius]`, so a ship can never leave the arena or become hidden.
- **Ship vs ship:**
  - A chaser touching the player is a ram: the player takes 20 damage once and the chaser sinks.
  - A shooter and the player push apart symmetrically, with one collision effect per contact, tracked in the `contacts` set.
  - Enemies separate from each other.
- **Projectile:**
  - It disappears outside the arena, splashes on an island, or hits the first opposing living ship. Friendly fire is impossible because teams are filtered.
  - Otherwise it splashes on the water once range *or* lifetime runs out.
  - Damage is applied exactly once, because the projectile is killed in the same step.
  - When a ship sinks, its cannonballs still in flight are removed, so a dead shooter cannot score a posthumous hit.
- **Line of sight** (`segmentBlocked`): samples the segment every 16 units. That is coarse but plenty for islands that are 100+ units wide.

The world is small (at most 10 enemies plus a few dozen projectiles), so the O(n·m) checks cost microseconds. A spatial grid would only add complexity.

## 5. Resource management

- **Textures.** `AssetLoader` downloads the ship, tile and UI atlases once (1× or 2× variants depending on DPR), with byte-level progress. It decodes them into `ImageSource`s and caches the resulting `GameTextures` for the page lifetime. If any download or parse fails (HTTP error, network error, corrupt image, invalid atlas, missing frame), the cached promise is cleared and the UI shows *Could not start the battle* with **Retry**, which reloads from the network. Matches never create or destroy atlas textures.
- **Per-match objects.** `ArenaRenderer` builds one root container per match (scenery, ship views, effects layers). `destroy()` removes it with `{ children: true, texture: false, textureSource: false }`, so the shared atlases survive. The session also removes its ticker callback, keyboard, blur, visibility and resize listeners, and stops its audio loops.
- **Effects** are a pool of up to 600 sprites that share one generated disc texture plus atlas frames. Inactive sprites are recycled, so after warm-up a long match allocates no new display objects. Water animation and wrecks advance with simulation time, so a paused frame is truly still.
- **Audio.** WAV files are fetched and decoded once by a single `AudioContext`, which is unlocked on the first gesture. Loops (ocean, sailing) start and stop with the session. Every sound is gated by the *Sound* option.
- **Verification.** The perf script runs 5 start → play → exit cycles and checks heap, DOM nodes, listeners, GPU texture sources and stage children after garbage collection. In the E2E suite, `09-navigation` plays and exits five matches. It checks that there is a single canvas, the same number of display objects in every match, an empty stage after each exit, and a constant count of GPU texture sources. `02-assets` checks that the atlases are downloaded only once. See [the performance report](reports/performance/README.md).

## 6. Persistence

All keys are prefixed `pirate-battle.` and versioned (`.v1`). Every read goes through `readJson(key, parse)`, which catches JSON or storage errors and runs a type guard. Corrupt or foreign data falls back to defaults instead of crashing. Options are repaired field by field, so an out-of-range duration resets only that field to its default and keeps the rest. A storage failure (private mode, full quota) never breaks the game.

| Key | Owner | Content |
|---|---|---|
| `options.v1` | `settings/options.ts` | Captain name, duration, spawn interval, sound |
| `profile.v1` | `settings/profile.ts` | Random `playerId`, which identifies "my" history |
| `last-result.v1` | `game/lastResult.ts` | Last finished match, so the Result screen survives a refresh |
| `submissions.v1` | `api/submissionStore.ts` | Outbox: record, status, attempts, last error |
| `mock-db.v1`, `mock-settings.v1` | `src/mocks` | The fake server's data and the selected scenario |
| `api-timeout-ms` | `api/http.ts` | Client timeout chosen in the Network lab |

## 7. Ranking and history integration

### Contracts (`api/contracts.ts`)

```text
POST /api/matches                       body MatchRecord → 201 created | 200 already stored
GET  /api/players/:playerId/matches     ?page&pageSize   → Page<MatchRecord>, newest first
GET  /api/ranking                       ?sessionDurationSec&spawnIntervalSec&page&pageSize → RankingPage
```

- `MatchRecord` is `{ matchId, playerId, playerName, playedAt, score, durationMs, endReason, config }`.
- Every page carries `page, pageSize, totalItems, totalPages` and a monotonic **`revision`**, the server's data version.
- Ranking order is deterministic: score desc, then survival time desc, then earlier `playedAt`, then `matchId`.
- A ranking only compares matches with the **same configuration** (duration and spawn interval), because different settings are different games. The Ranking screen lets the player pick the bracket and opens on the one matching the current options.
- `matchesApi.ts` validates every response body with type guards before the UI sees it. Any Axios or HTTP failure becomes a typed `ApiError` (`timeout | network | http | canceled | invalid_response`) carrying a user-facing message and a `retryable` flag.

### Mock server (`src/mocks`)

MSW runs in **every** build, including the deployed one, because the challenge has no backend. `mockDb` keeps its data in localStorage, so confirmed records survive refreshes as they would on a real server. POST is idempotent by `matchId`: a repeated POST returns the stored record with HTTP 200 and no duplicate. Each request reads data at **arrival time** and then waits out its simulated latency. A slow request therefore really does carry older data, which makes the stale-response protection testable. Scenarios (normal, slow, variable or seeded latency, out-of-order, timeout, network/500/400/503 failures, timeout-after-commit, and others) are chosen in the Network lab or with `?scenario=`.

### Cache (TanStack Query)

- Query keys are `['ranking', duration, interval, page]` and `['history', playerId, page]`.
- `staleTime` is 10 s and `refetchOnMount: 'always'`, so opening a screen always revalidates while cached pages render instantly.
- `placeholderData: keepPreviousData` keeps the old page visible, with an *Updating…* label, while the next one loads, so pagination doesn't flash empty.
- **Stale-response protection.** `structuralSharing: keepNewestRevision` keeps the cached data whenever an incoming response has a *lower* revision. A slow response therefore can never overwrite fresher data, even when it arrives last. In addition, the query function passes TanStack's `AbortSignal` to Axios, so leaving a page or changing the bracket cancels the request.
- **Retries.** Only transient failures are retried (timeout, network, 5xx, 408, 429), with exponential backoff of 400·2ⁿ ms capped at 4 s. Queries retry at most 2 times and submissions 3 times. A 400 is never retried.
- **Error UI.** Each screen distinguishes loading, empty, error-with-no-data (message plus **Retry**), and error-while-showing-cached-data (inline warning, data kept).

### Submission and pending recovery (outbox)

1. When a match ends, `enqueueSubmission(record)` writes the record with status `pending` to `submissions.v1` *before* any request. The `matchId` is generated client-side, so it doubles as the idempotency key.
2. `useSubmissionSync` is mounted once at the app root, so it keeps working while the player navigates or starts another match. For each `pending` entry it marks the entry `sending` (incrementing `attempts`) and runs a mutation in a single-file `scope`. An in-memory `inFlight` set prevents double sends from re-running effects.
3. On success the entry becomes `confirmed`, and the code cancels and then invalidates every `ranking` and `history` query. The cancel matters: a fetch already in flight may have read the server *before* the insert. Invalidating alone would reuse that fetch when the query has no data yet, and the new match would not show up until the next refresh.
4. On final failure the entry becomes `failed` with the error message. The Result screen and the Captain's log show it as *waiting to sync*, with **Retry**. Failed entries are re-queued on **Retry**, on the browser `online` event, and on reload (`sending` and `failed` are both restored as `pending`, so an interrupted request is never stuck).
5. A response lost after the server stored the record (`submit-timeout-after-commit`) is recovered safely. The retry gets 200 with the stored record, so the ranking never shows a duplicate.
6. Only the 20 most recent confirmed entries are kept; unsent entries are never evicted.

## 8. Testing strategy

- **Unit tests (Vitest)** cover the pure world (movement, borders, islands, weapons, ranges, damage and score, ram, shooter fire, spawn rules, time-up, death, determinism, the fixed-step clock) and the cache helpers (`keepNewestRevision` against a real `QueryClient`, retry policy).
- **E2E tests (Playwright, desktop and mobile Chromium)** drive the production build through the UI. They use `window.__pirate` only to make time and spawns deterministic and to read state for assertions; the hooks are enabled by `?e2e=1` and inert otherwise. Network scenarios use the same MSW scenarios a reviewer can pick in the Network lab, plus `page.route` for asset failures. Visual baselines cover the menu, the arena and the result screen.

## 9. Known limitations

- **No real backend.** Ranking and history live in the browser through MSW, so each browser sees its own "server". The score is trusted from the client; a real service would need to validate matches server-side (for example by replaying seed and inputs, or with plausibility limits) and authenticate players.
- MSW needs service workers. Without them (some private modes, `file://`), the game still works but ranking and history show an offline error.
- Steering is local (feelers), not path-finding. With the current layout no enemy can get trapped, but a maze-like map would need a navigation grid.
- Line of sight and island checks use sampling and rounded rectangles rather than exact island shapes, which can differ from the art by a few pixels at corners.
- Touch controls are buttons (hold to sail or turn, tap to fire) rather than a virtual joystick. Portrait orientation pauses the match instead of rearranging it.
- Only Chromium is covered by the automated suites. The app uses standard APIs, but Firefox and Safari were not tested automatically.
- Frame-rate numbers in the performance report come from one machine and a scripted bot (see that report for details).

## Balancing

All tuning lives in `BASE_GAME_CONFIG` (`src/game/config.ts`). Systems only read a frozen per-match snapshot, so balance changes never touch logic, and tests inject overrides the same way. Distances are arena units (the arena is 1536×896).

| | Health | Speed | Weapon |
|---|---|---|---|
| Player | 100 | 175 u/s, turn 2.6 rad/s | Bow: 15 dmg, every 0.45 s, 520 u range · Broadside (each side): 3 × 12 dmg, every 1.6 s, 300 u range |
| Chaser | 30 | 135 u/s, turn 2.0 rad/s | Ram: 20 dmg once, then sinks (no score) |
| Shooter | 45 | 95 u/s, turn 1.6 rad/s | Cannon: 10 dmg, every 1.8 s, 400 u range; fires from 360 u, holds 250 u |

The intent behind these numbers:

- **Time to kill.** A chaser dies to 2 bow shots (about 0.5 s) or one full broadside. A shooter takes 3 bow shots (about 1 s) or a broadside plus a shot. Kills are quick, which keeps the score climbing and makes aiming matter more than attrition.
- **Two kinds of pressure.** Chasers punish standing still: they are 23% slower than the player, so sailing away always works, but they come in numbers. Shooters punish predictable lines: they are slow and fragile up close, but they deal steady damage from range.
- **The player always has an answer.** The bow outranges the shooter's firing distance (520 u vs 360 u), so a careful player can strike first. Broadsides reward the riskier side-on pass, since that's when chasers are closest. Separate cooldowns for bow, left and right let a skilled player chain all three.
- **Survivability.** 100 HP absorbs 5 rams or 10 cannon hits. Rams deal more damage per event, while shooters wear the player down slowly, so the player has a few seconds to react to a low-health warning.
- **Pacing from options.** At the default 3 s interval, up to 40 enemies arrive in a 2-minute match. The 10-alive cap and the 460 u minimum spawn distance prevent unfair spawns on top of the player, even at the 1 s interval. The ranking only compares matches with the same settings, so harder settings are not penalised.
- **Feedback over numbers.** Hit flashes, damage-stage sprites (66% / 33% health), smoke, camera shake, health bars and distinct sounds make the effect of each number visible to the player.

Possible next steps for balancing: difficulty ramping over the match (shorter interval or tougher shooters after the midpoint), different score values per kind (a shooter is the harder kill), and telemetry from real matches (time to first damage, kills per minute) to tune these values against data instead of playtests.
