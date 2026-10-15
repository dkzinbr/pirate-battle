# Performance report

The game stays locked to the display refresh rate for a full 180 s match with constant enemy pressure: **p95 frame time 11.1 ms**, no frame over 16.7 ms, and about 0.2 ms of JavaScript per frame. Memory is flat across 5 start → play → exit cycles: DOM nodes, event listeners, GPU textures and stage children do not grow, and the JS heap stays around 8 MB.

- Raw data: [`perf-2026-10-15T01-17-13-932Z.json`](perf-2026-10-15T01-17-13-932Z.json) (includes a per-second timeline of entities and particles)
- Generated summary: [`latest.md`](latest.md)

## How it was measured

```bash
npm run build
npm run perf            # = node scripts/perf.mjs  (starts `vite preview` if nothing is listening on :4173)
# options: --duration=180 --spawn=2 --cycles=5 --cycle-seconds=20 --width=1600 --height=900 --headless --url=<url>
```

`scripts/perf.mjs` drives the **production build** in headed Chrome with GPU acceleration:

1. **Match.** A 180 s match at the highest pressure the options allow for a long run (spawn every 2 s, up to 10 enemies alive). A scripted bot sails forward, alternates turns, and fires the bow cannon and both broadsides. Its health is raised so it survives the whole match, keeping the load representative until the end; the enemies, AI, projectiles and effects are all real. The script records:
   - every `requestAnimationFrame` delta (the first half second is skipped as warm-up);
   - entity and particle counts every second;
   - Chrome DevTools Protocol `Performance.getMetrics` before and after (script time, task time, layouts).
2. **Memory.** 5 cycles of *Play → 20 s of bot play → Pause → Exit to menu*. After each cycle, on the main menu, it forces two garbage collections (`HeapProfiler.collectGarbage`) and records JS heap, DOM nodes, event listeners, GPU texture sources (`renderer.texture.managedTextures`) and Pixi stage children.

Auto-pause on blur is turned off for the run (`?autopause=0`, a test-only flag). Chrome is also started with occlusion detection and background throttling disabled. Otherwise Windows marks a covered window as hidden, and the game, correctly, pauses itself. The report includes *game time vs wall time* (180.0 s vs 181.1 s) and *automatic resumes* (0) to prove the match ran uninterrupted.

## Environment

| | |
|---|---|
| CPU | AMD Ryzen 5 9600X, 6 cores / 12 threads |
| RAM | 31 GB |
| GPU | AMD Radeon RX 9060 XT (ANGLE, Direct3D 11) |
| OS | Windows 11 Pro (10.0.26200) |
| Browser | Chrome 155.0.8059.79, headed, hardware accelerated |
| Display | Variable refresh rate monitor; Chrome ran it at about 94–100 Hz |
| Viewport | 1600×900, DPR 1 |
| Build | `vite build` + `vite preview` (minified production bundle) |
| Match | 180 s, spawn interval 2 s, seed 2026 |

## Results: 180 s match

| Metric | Value |
|---|---|
| Frames measured | 17 038 |
| Average FPS | 94.2 (display-bound, see below) |
| Frame time p50 / avg | 10.60 ms / 10.61 ms |
| **Frame time p95** | **11.10 ms** |
| Frame time p99 / max | 11.60 ms / 12.0 ms |
| Frames over 16.7 ms (a dropped 60 Hz frame) | 0 |
| Frames over 33 ms | 0 |
| Enemies alive avg / max | 7.1 / 10 (the cap) |
| Projectiles avg / max | 3.0 / 8 |
| Particles avg / max | 103 / 170 (pool limit 600) |
| Scene display objects avg / max | 524 / 558 |
| Main thread JavaScript | 18.4 ms per second ≈ **0.2 ms per frame** |
| Main thread tasks (all work) | 32.0 ms per second ≈ 0.34 ms per frame |
| Game time / wall time | 180.0 s / 181.1 s |
| Automatic resumes | 0 |

**Reading the numbers.** p50, p95 and p99 sit within 1 ms of each other, at the refresh interval of the display. Frame pacing is therefore set by vsync, not by the game: the browser waited for the screen on almost every frame. The CPU cost shows the headroom. The simulation, rendering commands and React HUD together use about 0.34 ms of a 10.6 ms frame, roughly 3%. An earlier run of the same script, with the display at 100 Hz, measured 100.0 FPS and p95 10.1 ms, with the same conclusion.

## Results: memory over 5 cycles

| Snapshot (main menu, after GC) | JS heap (MB) | DOM nodes | Listeners | GPU texture sources | Stage children |
|---|---|---|---|---|---|
| before any match | 7.8 | 203 | 205 | 7 | 0 |
| after cycle 1 | 7.9 | 159 | 343 | 7 | 0 |
| after cycle 2 | 7.9 | 159 | 343 | 7 | 0 |
| after cycle 3 | 8.0 | 159 | 343 | 7 | 0 |
| after cycle 4 | 8.2 | 159 | 343 | 7 | 0 |
| after cycle 5 | 8.2 | 159 | 343 | 7 | 0 |

- **DOM nodes, listeners, GPU textures and stage children are constant** from cycle 1 to cycle 5. Every match removes its canvas content, ship views, health bars, particles and listeners, and the shared atlases are uploaded once.
- **Cycle 1 differs from the baseline** because of one-time initialisation on the first match. The PixiJS renderer and its event system (which adds pointer listeners), the decoded atlases and the audio engine are all created lazily on the first match and reused afterwards. DOM nodes on the menu drop after the first-load state is collected. Neither count changes after that.
- **JS heap +0.33 MB over 4 cycles, flattening out.** A separate headless 16-cycle run measured +140 KB per cycle at first, falling to about 20–30 KB per cycle. A heap-snapshot diff over 9 cycles found about 70 KB in total, almost all V8 and browser internals: hidden-class shapes and `WeakArrayList`s from JIT warm-up, `NavigationHistoryEntry` objects from hash navigation, Performance Timeline entries, and finished `AudioBufferSourceNode`s waiting for collection. No game objects are retained.
- **One bounded retention inside PixiJS.** The stage's render group reuses an internal `childrenToUpdate` array, and its unused slots keep pointing at the last match's sprites until they are overwritten. Exactly 23 sprites were retained after 4, 12 and 24 cycles, so it does not grow, and the textures they point to are the shared atlases.

### A measurement pitfall worth knowing

The first full run showed DOM nodes growing by exactly 87 per cycle. That was the profiling script, not the game. Playwright's `page.waitForSelector()` returns an `ElementHandle`, and the script never disposed it. Each handle pinned the previous main-menu tree through DevTools. A heap snapshot showed the only strong path to those nodes went through `DevTools console` handles, and the growth disappeared once the script waited with a locator (`getByTestId(...).waitFor()`), which holds no handle.

## Limitations

- **One machine, a fast one.** These numbers show the game is far from any limit on a modern desktop. They don't prove the same on a low-end phone. The 0.34 ms of main-thread work per frame leaves a large margin, but mobile GPUs at DPR 2–3 are mostly fill-rate bound. The renderer caps resolution at DPR 2 for that reason.
- **The frame rate is display-bound.** `requestAnimationFrame` cannot exceed the refresh rate, so average FPS reflects the monitor (94–100 Hz here), not the game. p95 and the CPU cost per frame are the meaningful figures.
- **Scripted bot, raised health.** The bot is not a human, but it keeps all weapons firing and the enemy cap saturated, which is the worst realistic load. Raising the player's health only prevents an early end; it changes no other system.
- **Headless runs are not representative.** Headless Chromium renders WebGL with SwiftShader on the CPU, so `--headless` results mostly measure software rasterisation. The E2E suite therefore uses a manual clock and never asserts frame rates.
- **Heap numbers are `JSHeapUsedSize`.** That excludes GPU memory, which is tracked through the texture count instead. The texture count includes only textures managed by the Pixi renderer, which is all of them in this game.
