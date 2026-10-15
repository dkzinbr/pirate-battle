# Pirate Battle

A top-down 2D naval shooter. Sail around an archipelago, sink as many enemy ships as you can before the time runs out, and compare your result in the Captain's Log.

**Stack:** React 19 · TypeScript (strict) · PixiJS 8 · TanStack Query 5 · Axios · MSW 2 · Playwright · Vite 7 · Vitest.

**Live build:** [pirate-battle-sigma-plum.vercel.app](https://pirate-battle-sigma-plum.vercel.app/)

- [Quick start](#quick-start)
- [How to play](#how-to-play)
- [Gameplay configuration](#gameplay-configuration)
- [Network scenarios (mock API)](#network-scenarios-mock-api)
- [Reproducing failures](#reproducing-failures)
- [Commands](#commands)
- [Tests](#tests)
- [Performance](#performance)
- [Deploy](#deploy)
- [Project layout](#project-layout)
- [Assets and licenses](#assets-and-licenses)

Architecture, the simulation loop, collisions, resource management, persistence and the ranking/history integration are described in [ARCHITECTURE.md](ARCHITECTURE.md). The original challenge brief is kept in [docs/CHALLENGE.md](docs/CHALLENGE.md).

## Quick start

Requirements: Node.js 20.19+ (developed on Node 24) and npm 10+.

```bash
npm ci
npm run dev            # http://127.0.0.1:5173
```

Production build:

```bash
npm run build
npm run preview        # http://127.0.0.1:4173
```

There is no real backend: ranking, match history and match submission are served by an MSW service worker that runs in the browser, in development **and** in the published build.

### Environment variables

The app needs no environment variables. The only variables used are for tooling:

| Variable | Used by | Effect |
|---|---|---|
| `E2E_BASE_URL` | Playwright | Run the E2E suite against an already running/deployed URL instead of starting `vite preview` (for example `E2E_BASE_URL=https://your-app.vercel.app/ npm run test:e2e`). |
| `CI` | Playwright | Enables `forbidOnly`, one retry and 2 workers. |

Runtime knobs that a tester may want to change live in the in-app **Network lab** (see below) and in `localStorage`, not in env vars.

## How to play

Each enemy ship sunk by your cannons scores **1 point**. Chasers explode when they ram you (no points); shooters keep their distance and fire. A match ends when the timer reaches zero or your ship sinks.

| Action | Keyboard | Touch |
|---|---|---|
| Sail forward | `W` / `↑` | ⬆ (left pad) |
| Turn left / right | `A` `D` / `←` `→` | ↶ ↷ (left pad) |
| Bow cannon (1 ball) | `Space` / `K` | centre button (right pad) |
| Port broadside (3 balls) | `Q` / `J` | left button (right pad) |
| Starboard broadside (3 balls) | `E` / `L` | right button (right pad) |
| Pause / resume | `P` / `Esc` | ⏸ in the HUD |

- Ships only move forward; there is no reverse. Releasing forward lets the ship coast to a stop.
- Islands block ships and cannonballs. The arena edges block ships; cannonballs that leave the arena are removed.
- The game pauses automatically when the window loses focus or the tab is hidden. It never resumes by itself.
- Game keys are only captured while a match is running and not paused, and never while typing in a field.
- **Mobile:** matches are played in **landscape**. In portrait the match pauses and asks you to rotate. Touch pads track each finger, so you can steer and fire at the same time.
- Reloading the page during a match abandons it and returns to the menu. Abandoned matches are never recorded.

## Gameplay configuration

Players can change these values in **Options** (also available from the pause menu). They are validated, persisted in `localStorage` and applied when the next match starts.

| Option | Range | Default |
|---|---|---|
| Game session time | 60–180 s, steps of 10 s | 120 s |
| Enemy spawn time | 1–10 s, steps of 0.5 s | 3 s |
| Captain name | 2–18 characters (letters, digits, space, `.` `'` `_` `-`) | Captain Jack |
| Sound effects | on/off | on |

All other tuning lives in a single, typed object, `BASE_GAME_CONFIG` in [`src/game/config.ts`](src/game/config.ts). Each match receives a frozen copy, so changing options never affects a running match.

| | Health | Speed | Weapon |
|---|---|---|---|
| Player | 100 | 175 u/s, turn 2.6 rad/s | Bow cannon: 15 damage, 0.45 s cooldown, 520 u range. Broadsides: 3 balls × 12 damage, 1.6 s cooldown each side, 300 u range |
| Chaser | 30 | 135 u/s | Ramming: 20 damage to the player, then it explodes |
| Shooter | 45 | 95 u/s | Cannon: 10 damage, 1.8 s cooldown; fires within 360 u, holds at about 250 u |

- Spawning: the first enemy appears after 1.5 s, then one every *spawn time* seconds. At most 10 enemies are alive at once. Spawn points sit on the arena border, at least 460 u from the player and clear of islands and ships. The first two spawns are always a chaser and then a shooter, so every match contains both types. After that the type is chosen by weighted random (55 % chaser, 45 % shooter).
- Damage sprites change at 66 % and 33 % health.
- Balance notes and their reasoning are in [ARCHITECTURE.md](ARCHITECTURE.md#balancing).

## Network scenarios (mock API)

Open **Network lab** at the bottom of the main menu. It lets you:

- **Pick a scenario.** It applies to the next request:

  | Scenario | Behaviour |
  |---|---|
  | Normal | Success after 150–450 ms (seeded). |
  | Instant | Success with no latency (used by the E2E tests). |
  | Empty lists | Ranking and history return no entries. |
  | Slow network | Every response takes 2.5 s. |
  | Variable latency | Seeded random latency of 100 ms–3 s. |
  | Out-of-order responses | Odd requests take 2.5 s and even ones 150 ms. Data is read when the request arrives, so slow responses really carry older data. |
  | Timeout | Requests never answer; the client gives up after its timeout. |
  | Connection failure | Network-level failure. |
  | Server error (500) / Bad request (400) | Every request fails with that status. 4xx errors are not retried. |
  | Ranking unavailable / History unavailable | Only that query fails (503 / 500). |
  | Timeout after saving | The first submission of a match is stored, but its response never arrives. The retry returns the stored record (HTTP 200) without duplicating it. |
  | Saving unavailable | Submissions fail with 503 while queries work. |

- Set the **latency seed**, which makes "Normal" and "Variable latency" reproducible.
- Set the **client timeout** (`pirate-battle.api-timeout-ms`, default 5000 ms).
- Use **Retry pending** to send any record still in the outbox.
- Use **Seed my history** to add 12 sample battles for the current captain, which gives a 3-page history.
- Use **Reset mock API** to restore the initial fixtures, the *Normal* scenario and the default timeout. The 120 s / 3 s bracket has 13 rivals across 3 pages, including a tie.
- Use **Erase local data** to wipe options, profile, last result, outbox, mock server and scenario, then reload.

Scenarios can also be chosen from the URL: `?scenario=<id>&mockSeed=<n>`, for example `/?scenario=out-of-order#/log/ranking`. The selection is persisted; use **Reset mock API** (or pick *Normal*) to go back.

Local storage keys (all prefixed `pirate-battle.`): `options.v1`, `profile.v1`, `last-result.v1`, `submissions.v1` (outbox), `mock-db.v1` (mock server data), `mock-settings.v1`, `api-timeout-ms`.

## Reproducing failures

| Situation | Steps |
|---|---|
| Lists loading | Network lab → *Slow network* → open Ranking. Paging keeps the previous page visible while the next one loads. |
| Empty lists | *Empty lists* → Ranking / Match History. |
| List errors and retry | *Ranking unavailable* (or *History unavailable*) → open the tab → wait for the retries to fail → switch to *Normal* → **Try again**. |
| Pending record and recovery after a refresh | *Saving unavailable* → play a match. The result shows "Not saved yet" and the menu and Match History show the pending banner. Reload the page with `?scenario=normal`: the outbox is restored and flushed. |
| Retry after a lost response, without duplicates | Set the client timeout to 1000 ms → *Timeout after saving* → play a match. The first request is stored but times out; the retry is confirmed and the history shows the match once. |
| Late responses | *Out-of-order responses* → Ranking → change the brackets quickly. The slow responses for older selections arrive later and never replace the current view. |
| Asset loading failure | DevTools → Network → block the `ships_miscellaneous_sheet*.xml` request → Play. An error appears with **Retry**; unblock the request and retry. |
| Asset loading progress | DevTools → Network → throttle to "Slow 3G" → Play. |

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Vite dev server with HMR. |
| `npm run build` | Type check (`tsc -b`) and optimized production build in `dist/`. |
| `npm run preview` | Serves `dist/` at http://127.0.0.1:4173. |
| `npm run lint` | ESLint (typescript-eslint `strictTypeChecked` and React Hooks rules). |
| `npm run typecheck` | TypeScript project references check. |
| `npm run test:unit` | Vitest unit tests (simulation rules, fixed clock, cache and retry policy). |
| `npm run test:e2e` | Playwright on Chromium desktop and Chromium mobile. Builds and serves the production bundle automatically. |
| `npm run test:e2e:update` | Re-records the visual baselines. |
| `npm run test:e2e:report` | Opens the HTML report in `reports/playwright`. |
| `npm run perf` | Profiles a 3-minute match and 5 start/play/exit cycles in a real Chrome window and writes `reports/performance/`. Requires `npm run build` first. |
| `npm run check` | Type check, lint and unit tests. |

Install the Playwright browser once with `npx playwright install chromium`.

## Tests

**End-to-end (Playwright):** `tests/e2e/`, 52 tests × 2 projects:

- `desktop-chromium`: 1280×720.
- `mobile-chromium`: Pixel 7 in landscape (touch, mobile viewport, DPR 2.6).

Touch-only tests (touch pads, portrait pause) are skipped on desktop.

| Spec | Covers |
|---|---|
| `01-options` | Keyboard navigation and visible focus, validation messages, persistence after reload, options applied to the next match, corrupted storage. |
| `02-assets` | Loading progress, network failure and retry, corrupted atlas, assets reused by later matches. |
| `03-movement` | Match start, forward-only movement, rotation, arena borders, island collision. |
| `04-combat` | Bow cannon and broadsides (3 parallel balls), cooldowns, single damage per hit, score without duplicates. |
| `05-enemies` | Chaser pursuit and ram, shooter keeping its range and firing, spawn interval, safe distance and both enemy types. |
| `06-match-end` | End by time and by death, frozen simulation, clean "Play again" and restart. |
| `07-pause` | Manual pause, HUD button and `Esc`, blur and hidden-tab auto-pause, no timer advance on real time, keys captured only during gameplay. |
| `08-result` | Result screen and its persistence after refresh; reloading mid-match abandons it. |
| `09-navigation` | Abandoning records nothing, repeated navigation keeps a single canvas with a stable scene size, an empty stage after exit and a constant GPU texture count, touch controls, portrait pause. |
| `10-captains-log` | Ranking and history pagination, bracket filtering, keyboard tabs, loading, empty and error states, retry. |
| `11-submission` | Recording a match, both tabs refreshing, pending record recovered after refresh, in-flight record resent once, manual retry. |
| `12-resilience` | Resend after a timeout without duplicates, late responses never replacing current data, no retries on 4xx. |
| `13-visual` | Visual regression of the menu, a stable arena and the result screen. Baselines live in `tests/e2e/__screenshots__/<project>/`. |

Reproducibility comes from a test bridge enabled with `?e2e=1` (kept for the browser session). Options are `seed=<n>` (deterministic match) and `clock=manual`: the simulation advances only when the test calls `window.__pirate.advance(ms)`. The bridge can observe state, control the clock, spawn enemies at fixed positions and switch the mock scenario. Inputs, rules, collisions and rendering are the real ones; combat tests press the real keys and touch buttons. Every test starts in a fresh browser context (empty storage, service worker and mock server).

The HTML report is written to `reports/playwright/`. Failed tests keep a trace (`npx playwright show-trace <trace.zip>`) and a screenshot, and both are embedded in the report.

**Unit (Vitest):** `src/**/*.test.ts` covers the pure simulation (movement, island collision, weapons, cooldowns, scoring once, ramming, spawning rules, end conditions, determinism), the fixed-step clock, the `keepNewestRevision` cache guard and the retry policy.

## Performance

`npm run perf` drives a scripted bot in headed Chrome on the optimized build and records:

- frame times from `requestAnimationFrame`: average FPS, p50, p95, p99 and max;
- entity counts every second: enemies, projectiles, particles and scene objects;
- main-thread time;
- JS heap, DOM nodes, event listeners and GPU texture sources after each of 5 start → play → exit cycles, measured after forced garbage collection.

On a Ryzen 5 9600X with an RX 9060 XT at 1600×900, a 180 s match stayed locked to the display refresh rate. The p95 frame time was 11.1 ms, no frame went over 16.7 ms, and JavaScript took about 0.2 ms per frame. DOM nodes, listeners and GPU textures stayed constant across 5 cycles. The full results, with hardware, browser, match configuration, analysis and limitations, are in [reports/performance/README.md](reports/performance/README.md).

## Deploy

The app is a static site. Hash-based routes (`#/play`, `#/log/ranking`, …) mean any refresh or deep link works without server rewrites.

**Vercel (recommended):** import the repository. [`vercel.json`](vercel.json) already sets `npm ci`, `npm run build` and the `dist` output, serves `mockServiceWorker.js` with `no-cache`, and caches the hashed assets for a long time. With the CLI:

```bash
npx vercel           # preview
npx vercel --prod    # production
```

Then check the published build with `E2E_BASE_URL=https://<your-app>.vercel.app/ npm run test:e2e`. Against the live build, all 89 tests that ran passed, including the whole desktop project. After about 90 tests of headless traffic, Vercel's bot protection (*Security Checkpoint*, code 21) started blocking the IP, so the remaining mobile tests could not load the page. To run the full suite against a deployment, run one project at a time (`--project=mobile-chromium`) or add a firewall bypass rule for your IP in the Vercel dashboard.

## Project layout

```
src/
  app/          React shell: router, screens, HUD, dialogs, styles
  api/          Axios client, contracts, TanStack Query hooks, submission outbox
  mocks/        MSW handlers, scenarios, fixtures, persisted mock database
  game/
    core/       Pure simulation (World, collisions, RNG, fixed clock) — no PixiJS
    render/     PixiJS renderer, effects, health bars, shared Application
    assets/     Atlas loading with progress, texture registry
    input/      Keyboard + touch → logical controls
    GameSession.ts  Owns one match: world, renderer, input, timers
  audio/        Web Audio engine
  settings/     Options and player profile persistence
  testing/      E2E bridge (?e2e=1)
tests/e2e/      Playwright specs and visual baselines
scripts/        perf.mjs (profiling), probe.mjs (screenshots while developing)
reports/        Playwright HTML report and performance reports
```

## Assets and licenses

- **Sprites, tiles, UI and sounds** in [`assets/`](assets/) were provided with the challenge by Jungle Gaming and are used unchanged. The ship and tile sheets match Kenney's [Pirate Pack](https://kenney.nl/assets/pirate-pack), released under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/); the provided package did not include a license file, so this attribution is based on the sheet names and contents.
- **Derived resources** created for this project:
  - `public/favicon.png`, a copy of one of the provided ship sprites;
  - the particle texture, a soft disc generated at runtime with PixiJS;
  - the standalone repeating water texture, cut at runtime from the provided tile sheet.
- **Fonts:** the system UI font stack only; no web fonts are downloaded.
- **Code dependencies** are open-source packages under permissive licenses (React, PixiJS, TanStack Query, Axios and MSW are MIT).
