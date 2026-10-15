# Performance run — 2026-10-15T01:17:13.932Z

## Environment

| | |
|---|---|
| CPU | AMD Ryzen 5 9600X 6-Core Processor (12 threads) |
| RAM | 31 GB |
| OS | Windows_NT 10.0.26200 |
| GPU | ANGLE (AMD, AMD Radeon RX 9060 XT (0x00007590) Direct3D11 vs_5_0 ps_5_0, D3D11) |
| Browser | Chrome 155.0.8059.79 (headed, GPU accelerated) |
| Viewport | 1600×900 @ DPR 1 |
| Build | `vite build` served by `vite preview` |
| Match | 180 s, spawn every 2 s, seed 2026, scripted bot, player health raised so it survives the whole match |

## 180 s match

| Metric | Value |
|---|---|
| Frames measured | 17038 |
| Average FPS | 94.2 |
| Frame time avg / p50 | 10.61 ms / 10.60 ms |
| **Frame time p95** | **11.10 ms** |
| Frame time p99 / max | 11.60 ms / 12.0 ms |
| Frames over 16.7 ms / 33 ms | 0 / 0 |
| Enemies alive avg / max | 7.1 / 10 |
| Projectiles avg / max | 3.0 / 8 |
| Particles avg / max | 103.0 / 170 |
| Scene display objects avg / max | 523.7 / 558 |
| Main thread script / task time | 18.4 / 32.0 ms per second |
| Layouts during the match | 456 |
| Final score of the bot | 39 |
| Game time / wall time | 180.0 s / 181.1 s |
| Automatic resumes (match found paused) | 0 |

## Memory over 5 start → play → exit cycles

Each snapshot is taken on the main menu after two forced garbage collections.

| Snapshot | JS heap (MB) | DOM nodes | Listeners | GPU texture sources | Stage children |
|---|---|---|---|---|---|
| menu (before any match) | 7.8 | 203 | 205 | 7 | 0 |
| after cycle 1 | 7.9 | 159 | 343 | 7 | 0 |
| after cycle 2 | 7.9 | 159 | 343 | 7 | 0 |
| after cycle 3 | 8.0 | 159 | 343 | 7 | 0 |
| after cycle 4 | 8.2 | 159 | 343 | 7 | 0 |
| after cycle 5 | 8.2 | 159 | 343 | 7 | 0 |

Heap change from cycle 1 to cycle 5: **0.33 MB**; DOM nodes +0; GPU texture sources 7 → 7.
