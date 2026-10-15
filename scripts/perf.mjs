// Performance profiling for the optimized build.
//
//   npm run build && npm run perf                    # 3-minute match + 5 memory cycles
//   npm run perf -- --duration=60 --cycles=3          # shorter run
//   npm run perf -- --headless                        # CI-like (software WebGL, not representative)
//
// It starts `vite preview` when nothing is listening on the URL, opens a real
// Chrome window (GPU accelerated), plays with a scripted bot and writes
// reports/performance/perf-<timestamp>.json plus a Markdown summary.
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { chromium } from '@playwright/test';

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key, value ?? 'true'];
  }),
);
const DURATION_SEC = Number(args.duration ?? 180);
const SPAWN_SEC = Number(args.spawn ?? 2);
const CYCLES = Number(args.cycles ?? 5);
const CYCLE_PLAY_SEC = Number(args['cycle-seconds'] ?? 20);
const HEADLESS = args.headless === 'true';
const URL_BASE = args.url ?? 'http://127.0.0.1:4173/';
const VIEWPORT = { width: Number(args.width ?? 1600), height: Number(args.height ?? 900) };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function reachable(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await reachable(URL_BASE)) return null;
  const server = spawn('npx vite preview --host 127.0.0.1 --port 4173 --strictPort', { shell: true, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    if (await reachable(URL_BASE)) return server;
    await sleep(500);
  }
  server.kill();
  throw new Error('vite preview did not start; run `npm run build` first');
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function summarizeFrames(deltas) {
  const sorted = [...deltas].sort((a, b) => a - b);
  const total = deltas.reduce((sum, d) => sum + d, 0);
  return {
    frames: deltas.length,
    avgFps: deltas.length / (total / 1000),
    avgFrameMs: total / deltas.length,
    p50FrameMs: percentile(sorted, 50),
    p95FrameMs: percentile(sorted, 95),
    p99FrameMs: percentile(sorted, 99),
    maxFrameMs: sorted[sorted.length - 1] ?? 0,
    framesOver16_7ms: deltas.filter((d) => d > 1000 / 60 + 1).length,
    framesOver33ms: deltas.filter((d) => d > 33.4).length,
  };
}

const metricMap = (metrics) => Object.fromEntries(metrics.map((m) => [m.name, m.value]));

/** Simple scripted captain: always sailing, weaving and firing every weapon. */
function startBot(page) {
  let running = true;
  const loop = async () => {
    let tick = 0;
    await page.keyboard.down('KeyW');
    while (running) {
      tick += 1;
      try {
        await page.keyboard.press('Space');
        if (tick % 4 === 0) await page.keyboard.press('KeyQ');
        if (tick % 4 === 2) await page.keyboard.press('KeyE');
        const turn = tick % 10 < 4 ? 'KeyD' : tick % 10 < 6 ? null : 'KeyA';
        if (turn) await page.keyboard.down(turn);
        await sleep(450);
        if (turn) await page.keyboard.up(turn);
      } catch {
        break;
      }
    }
    await page.keyboard.up('KeyW').catch(() => undefined);
  };
  const done = loop();
  return async () => {
    running = false;
    await done;
  };
}

async function waitForSession(page) {
  await page.waitForFunction(() => window.__pirate?.hasSession(), undefined, { timeout: 30_000 });
}

/** Resumes automatically if the OS window loses focus during the run; counted in the report. */
async function keepRunning(page, counters) {
  const phase = await page.evaluate(() => window.__pirate.getState()?.phase ?? null);
  if (phase === 'paused') {
    counters.autoResumes += 1;
    await page.evaluate(() => document.querySelector('[data-testid="pause-resume"]')?.click());
  }
  return phase;
}

async function runMatch(page, cdp) {
  console.log(`\n▶ ${DURATION_SEC}s match (spawn every ${SPAWN_SEC}s)…`);
  await page.goto(`${URL_BASE}?e2e=1&scenario=instant&seed=2026&autopause=0#/`);
  await page.waitForFunction(() => '__pirate' in window);
  await page.evaluate(
    ({ duration, spawn }) => {
      localStorage.setItem(
        'pirate-battle.options.v1',
        JSON.stringify({ sessionDurationSec: duration, spawnIntervalSec: spawn, captainName: 'Perf Bot', soundEnabled: false }),
      );
      // Keep the bot alive for the whole match so the load stays representative.
      window.__pirate.setConfigOverrides({ player: { maxHealth: 1_000_000 } });
    },
    { duration: DURATION_SEC, spawn: SPAWN_SEC },
  );
  await page.reload();
  await page.waitForFunction(() => '__pirate' in window);
  await page.evaluate(() => window.__pirate.setConfigOverrides({ player: { maxHealth: 1_000_000 } }));
  await page.click('[data-testid="menu-play"]');
  await waitForSession(page);

  await page.evaluate(() => {
    const perf = { deltas: [], last: 0, running: true };
    window.__perf = perf;
    const loop = (t) => {
      if (perf.last) perf.deltas.push(t - perf.last);
      perf.last = t;
      if (perf.running) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  const before = metricMap((await cdp.send('Performance.getMetrics')).metrics);
  const stopBot = startBot(page);
  const counters = { autoResumes: 0 };
  const samples = [];
  const started = Date.now();
  for (;;) {
    await sleep(1000);
    const phase = await keepRunning(page, counters);
    const sample = await page.evaluate(() => {
      const s = window.__pirate.getState();
      const r = window.__pirate.renderStats();
      if (!s || !r) return null;
      return {
        t: s.elapsed,
        enemies: s.enemies.length,
        projectiles: s.projectiles.length,
        particles: r.particles,
        displayObjects: r.displayObjects,
        score: s.score,
      };
    });
    if (sample) samples.push(sample);
    if (!sample || phase === 'ending' || phase === 'ended' || (sample && sample.t >= DURATION_SEC)) break;
    if (Date.now() - started > (DURATION_SEC + 60) * 1000) throw new Error('Match did not finish in time');
    if (samples.length % 15 === 0) process.stdout.write(`  ${Math.round(sample.t)}s · ${sample.enemies} enemies · ${sample.particles} particles\n`);
  }
  await stopBot();
  const deltas = await page.evaluate(() => {
    window.__perf.running = false;
    return window.__perf.deltas;
  });
  const after = metricMap((await cdp.send('Performance.getMetrics')).metrics);
  const seconds = (Date.now() - started) / 1000;
  const entityStats = (key) => {
    const values = samples.map((s) => s[key]);
    return { avg: values.reduce((a, b) => a + b, 0) / values.length, max: Math.max(...values) };
  };
  return {
    frames: summarizeFrames(deltas.slice(30)), // skip the first half second of warm-up
    entities: {
      enemies: entityStats('enemies'),
      projectiles: entityStats('projectiles'),
      particles: entityStats('particles'),
      displayObjects: entityStats('displayObjects'),
      finalScore: samples.at(-1)?.score ?? 0,
    },
    mainThread: {
      scriptMsPerSecond: ((after.ScriptDuration - before.ScriptDuration) * 1000) / seconds,
      taskMsPerSecond: ((after.TaskDuration - before.TaskDuration) * 1000) / seconds,
      layoutCount: after.LayoutCount - before.LayoutCount,
      recalcStyleCount: after.RecalcStyleCount - before.RecalcStyleCount,
    },
    autoResumes: counters.autoResumes,
    wallSeconds: seconds,
    gameSeconds: samples.at(-1)?.t ?? 0,
    timeline: samples,
  };
}

async function snapshotMemory(page, cdp, label) {
  await cdp.send('HeapProfiler.collectGarbage');
  await sleep(300);
  await cdp.send('HeapProfiler.collectGarbage');
  const metrics = metricMap((await cdp.send('Performance.getMetrics')).metrics);
  const gpu = await page.evaluate(() => window.__pirate.gpuStats());
  return {
    label,
    jsHeapUsedMB: metrics.JSHeapUsedSize / 1024 / 1024,
    domNodes: metrics.Nodes,
    eventListeners: metrics.JSEventListeners,
    textureSources: gpu.textureSources,
    stageChildren: gpu.stageChildren,
  };
}

async function runCycles(page, cdp) {
  console.log(`\n▶ ${CYCLES} start → play ${CYCLE_PLAY_SEC}s → exit cycles…`);
  await page.goto(`${URL_BASE}?e2e=1&scenario=instant&seed=2026&autopause=0#/`);
  await page.waitForFunction(() => '__pirate' in window);
  const snapshots = [await snapshotMemory(page, cdp, 'menu (before any match)')];
  const counters = { autoResumes: 0 };
  for (let i = 1; i <= CYCLES; i++) {
    await page.evaluate(() => window.__pirate.setConfigOverrides({ player: { maxHealth: 1_000_000 } }));
    await page.click('[data-testid="menu-play"]');
    await waitForSession(page);
    const stopBot = startBot(page);
    for (let s = 0; s < CYCLE_PLAY_SEC; s++) {
      await sleep(1000);
      await keepRunning(page, counters);
    }
    await stopBot();
    await page.keyboard.press('Escape');
    await page.click('[data-testid="pause-exit"]');
    // A locator holds no element handle; `waitForSelector` would pin the old menu DOM.
    await page.getByTestId('menu-play').waitFor();
    await sleep(500);
    const snap = await snapshotMemory(page, cdp, `after cycle ${i}`);
    snapshots.push(snap);
    console.log(`  cycle ${i}: heap ${snap.jsHeapUsedMB.toFixed(1)} MB · ${snap.domNodes} nodes · ${snap.textureSources} GPU textures`);
  }
  return { snapshots, autoResumes: counters.autoResumes };
}

function markdown(report) {
  const f = report.match.frames;
  const e = report.match.entities;
  const fmt = (n, d = 1) => Number(n).toFixed(d);
  const memRows = report.memory.snapshots
    .map((s) => `| ${s.label} | ${fmt(s.jsHeapUsedMB)} | ${s.domNodes} | ${s.eventListeners} | ${s.textureSources ?? 'n/a'} | ${s.stageChildren} |`)
    .join('\n');
  const first = report.memory.snapshots[1];
  const last = report.memory.snapshots.at(-1);
  return `# Performance run — ${report.date}

## Environment

| | |
|---|---|
| CPU | ${report.environment.cpu} |
| RAM | ${report.environment.ramGB} GB |
| OS | ${report.environment.os} |
| Browser | ${report.environment.browser} (${report.environment.headless ? 'headless, software WebGL' : 'headed, GPU accelerated'}) |
| Viewport | ${report.environment.viewport.width}×${report.environment.viewport.height} @ DPR ${report.environment.devicePixelRatio} |
| Build | \`vite build\` served by \`vite preview\` |
| Match | ${report.config.durationSec} s, spawn every ${report.config.spawnIntervalSec} s, seed ${report.config.seed}, scripted bot, player health raised so it survives the whole match |

## ${report.config.durationSec} s match

| Metric | Value |
|---|---|
| Frames measured | ${f.frames} |
| Average FPS | ${fmt(f.avgFps)} |
| Frame time avg / p50 | ${fmt(f.avgFrameMs, 2)} ms / ${fmt(f.p50FrameMs, 2)} ms |
| **Frame time p95** | **${fmt(f.p95FrameMs, 2)} ms** |
| Frame time p99 / max | ${fmt(f.p99FrameMs, 2)} ms / ${fmt(f.maxFrameMs, 1)} ms |
| Frames over 16.7 ms / 33 ms | ${f.framesOver16_7ms} / ${f.framesOver33ms} |
| Enemies alive avg / max | ${fmt(e.enemies.avg)} / ${e.enemies.max} |
| Projectiles avg / max | ${fmt(e.projectiles.avg)} / ${e.projectiles.max} |
| Particles avg / max | ${fmt(e.particles.avg)} / ${e.particles.max} |
| Scene display objects avg / max | ${fmt(e.displayObjects.avg)} / ${e.displayObjects.max} |
| Main thread script / task time | ${fmt(report.match.mainThread.scriptMsPerSecond)} / ${fmt(report.match.mainThread.taskMsPerSecond)} ms per second |
| Layouts during the match | ${report.match.mainThread.layoutCount} |
| Final score of the bot | ${e.finalScore} |
| Game time / wall time | ${fmt(report.match.gameSeconds)} s / ${fmt(report.match.wallSeconds)} s |
| Automatic resumes (match found paused) | ${report.match.autoResumes} |

## Memory over ${report.memory.snapshots.length - 1} start → play → exit cycles

Each snapshot is taken on the main menu after two forced garbage collections.

| Snapshot | JS heap (MB) | DOM nodes | Listeners | GPU texture sources | Stage children |
|---|---|---|---|---|---|
${memRows}

Heap change from cycle 1 to cycle ${report.memory.snapshots.length - 1}: **${fmt(last.jsHeapUsedMB - first.jsHeapUsedMB, 2)} MB**; DOM nodes ${last.domNodes - first.domNodes >= 0 ? '+' : ''}${last.domNodes - first.domNodes}; GPU texture sources ${first.textureSources} → ${last.textureSources}.
`;
}

const server = await ensureServer();
const browser = await chromium.launch({
  headless: HEADLESS,
  channel: HEADLESS ? undefined : 'chrome',
  // Keep rendering at full rate even if the window is covered or unfocused.
  args: [
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--disable-features=CalculateNativeWinOcclusion',
  ],
});
try {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  const match = await runMatch(page, cdp);
  const memory = await runCycles(page, cdp);
  const report = {
    date: new Date().toISOString(),
    environment: {
      cpu: `${os.cpus()[0]?.model.trim()} (${os.cpus().length} threads)`,
      ramGB: Math.round(os.totalmem() / 1024 ** 3),
      os: `${os.type()} ${os.release()}`,
      browser: `Chrome ${browser.version()}`,
      headless: HEADLESS,
      viewport: VIEWPORT,
      devicePixelRatio: 1,
      gpuRenderer: await page.evaluate(() => {
        const gl = document.createElement('canvas').getContext('webgl');
        const ext = gl?.getExtension('WEBGL_debug_renderer_info');
        return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
      }),
    },
    config: { durationSec: DURATION_SEC, spawnIntervalSec: SPAWN_SEC, seed: 2026 },
    match,
    memory,
    pageErrors: errors,
  };
  await mkdir('reports/performance', { recursive: true });
  const stamp = report.date.replace(/[:.]/g, '-');
  await writeFile(`reports/performance/perf-${stamp}.json`, JSON.stringify(report, null, 2));
  const md = markdown(report).replace('| Browser |', `| GPU | ${report.environment.gpuRenderer} |\n| Browser |`);
  await writeFile(`reports/performance/perf-${stamp}.md`, md);
  await writeFile('reports/performance/latest.md', md);
  console.log(`\n${md}`);
  if (errors.length > 0) console.log('Page errors:', errors);
} finally {
  await browser.close();
  server?.kill();
}
