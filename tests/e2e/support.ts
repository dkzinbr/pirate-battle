import { expect, type Page } from '@playwright/test';

/** Shapes returned by the in-page test bridge (`window.__pirate`). */
export interface Obstacle {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  cornerRadius: number;
}

export interface DebugState {
  phase: 'running' | 'paused' | 'ending' | 'ended';
  pauseReason: string | null;
  status: 'running' | 'ended';
  endReason: 'time_up' | 'destroyed' | null;
  elapsed: number;
  timeLeft: number;
  score: number;
  seed: number;
  config: { durationSec: number; spawnIntervalSec: number };
  player: {
    x: number;
    y: number;
    angle: number;
    speed: number;
    health: number;
    alive: boolean;
    radius: number;
    cooldowns: Record<string, number>;
  };
  enemies: { id: number; kind: 'chaser' | 'shooter'; x: number; y: number; angle: number; health: number; alive: boolean }[];
  projectiles: { id: number; team: 'player' | 'enemy'; x: number; y: number }[];
  spawned: { chaser: number; shooter: number };
  obstacles: Obstacle[];
  arena: { width: number; height: number };
}

export interface RenderStats {
  ships: number;
  projectiles: number;
  particles: number;
  displayObjects: number;
}

export interface ServerMatch {
  matchId: string;
  playerId: string;
  score: number;
}

interface PirateBridge {
  getState(): DebugState | null;
  renderStats(): RenderStats | null;
  setManualClock(manual: boolean): void;
  advance(ms: number): number;
  setSeed(seed: number | null): void;
  setConfigOverrides(overrides: unknown): void;
  spawnEnemy(kind: 'chaser' | 'shooter', x: number, y: number, angle?: number): number | null;
  hasSession(): boolean;
  setScenario(scenario: string, seed?: number): void;
  serverMatches(): ServerMatch[];
  outbox(): Record<string, { status: string; record: { matchId: string } }>;
  gpuStats(): Promise<{ textureSources: number | null; stageChildren: number }>;
}

declare global {
  interface Window {
    __pirate: PirateBridge;
  }
}

/** Disables natural spawning so a test fully controls which enemies exist. */
export const NO_SPAWNS = { spawn: { initialDelaySec: 100_000 } } as const;

export interface OpenOptions {
  /** Route hash, defaults to the main menu. */
  hash?: string;
  /** Mock network scenario; `instant` keeps tests fast. Pass null to keep the stored one. */
  scenario?: string | null;
  seed?: number;
  /** Drive the simulation from the test instead of real time (default). */
  manualClock?: boolean;
  /** Gameplay config overrides applied to the next match. */
  overrides?: unknown;
}

export async function openApp(page: Page, options: OpenOptions = {}): Promise<void> {
  const params = new URLSearchParams({ e2e: '1', mockSeed: '1', seed: String(options.seed ?? 7) });
  const scenario = options.scenario === undefined ? 'instant' : options.scenario;
  if (scenario) params.set('scenario', scenario);
  if (options.manualClock ?? true) params.set('clock', 'manual');
  await page.goto(`/?${params.toString()}${options.hash ?? '#/'}`);
  await page.waitForFunction(() => '__pirate' in window);
  await expect(page.locator('#main')).toBeVisible();
  if (options.overrides !== undefined) {
    await page.evaluate((overrides) => {
      window.__pirate.setConfigOverrides(overrides);
    }, options.overrides);
  }
}

export async function startMatch(page: Page): Promise<void> {
  await page.getByTestId('menu-play').click();
  await waitForSession(page);
}

export async function waitForSession(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__pirate.hasSession(), undefined, { timeout: 20_000 });
  await expect(page.getByTestId('hud')).toBeVisible();
}

export async function state(page: Page): Promise<DebugState> {
  const current = await page.evaluate(() => window.__pirate.getState());
  if (!current) throw new Error('No active match');
  return current;
}

/** Advances the real simulation by `ms` of game time and returns the time actually simulated. */
export async function advance(page: Page, ms: number): Promise<number> {
  return page.evaluate((duration) => window.__pirate.advance(duration), ms);
}

/** Holds a key while the simulation advances, like a player keeping it pressed. */
export async function hold(page: Page, key: string, ms: number): Promise<void> {
  await page.keyboard.down(key);
  await advance(page, ms);
  await page.keyboard.up(key);
}

/** Taps a key and lets one frame of simulation run so the press is applied. */
export async function tap(page: Page, key: string, frameMs = 1000 / 60): Promise<void> {
  await page.keyboard.press(key);
  await advance(page, frameMs);
}

export async function spawnEnemy(page: Page, kind: 'chaser' | 'shooter', x: number, y: number, angle?: number): Promise<number> {
  const id = await page.evaluate(({ k, px, py, a }) => window.__pirate.spawnEnemy(k, px, py, a), { k: kind, px: x, py: y, a: angle });
  if (id === null) throw new Error(`Could not spawn ${kind} at ${x},${y}`);
  return id;
}

export function wrapAngle(angle: number): number {
  let a = angle % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Steers with the real turn keys until the bow points at `target` (radians). */
export async function turnTo(page: Page, target: number, tolerance = 0.03): Promise<void> {
  for (let i = 0; i < 40; i++) {
    const { player } = await state(page);
    const diff = wrapAngle(target - player.angle);
    if (Math.abs(diff) <= tolerance) return;
    const ms = Math.max(1000 / 120, (Math.abs(diff) / 2.6) * 1000 * 0.8);
    await hold(page, diff > 0 ? 'KeyD' : 'KeyA', ms);
  }
  throw new Error(`Could not turn to ${target}`);
}

export function distanceToObstacle(x: number, y: number, rect: Obstacle): number {
  const cx = Math.min(Math.max(x, rect.minX), rect.maxX);
  const cy = Math.min(Math.max(y, rect.minY), rect.maxY);
  const dist = Math.hypot(x - cx, y - cy);
  if (dist > 0) return dist - rect.cornerRadius;
  return -Math.min(x - rect.minX, rect.maxX - x, y - rect.minY, rect.maxY - y) - rect.cornerRadius;
}

export async function setOptions(page: Page, values: { duration?: number; spawn?: number; name?: string }): Promise<void> {
  await page.getByTestId('menu-options').click();
  if (values.duration !== undefined) await page.getByTestId('option-session-time').fill(String(values.duration));
  if (values.spawn !== undefined) await page.getByTestId('option-spawn-time').fill(String(values.spawn));
  if (values.name !== undefined) await page.getByTestId('option-captain-name').fill(values.name);
  await page.getByTestId('options-save').click();
  await expect(page.getByTestId('options-status')).toHaveText('Options saved.');
  await page.getByRole('button', { name: 'Main Menu' }).click();
  await expect(page.getByTestId('menu-play')).toBeVisible();
}

/** Plays a full match that ends on time; optionally sinks one shooter first to score a point. */
export async function playTimedMatch(page: Page, opts: { scoreOne?: boolean } = {}): Promise<void> {
  await startMatch(page);
  if (opts.scoreOne) await sinkShooterAhead(page);
  const { timeLeft } = await state(page);
  // The extra time plays the final explosion before the result is reported.
  await advance(page, timeLeft * 1000 + END_DELAY_MS);
  await expect(page.getByTestId('result-panel')).toBeVisible({ timeout: 15_000 });
}

/** Game time between the end of a match and the result screen. */
export const END_DELAY_MS = 1500;

/** Advances in small slices until the match ends (the final explosion is still playing). */
export async function advanceUntilEnded(page: Page, maxMs: number): Promise<DebugState> {
  for (let spent = 0; spent < maxMs; spent += 100) {
    await advance(page, 100);
    const s = await state(page);
    if (s.status === 'ended') return s;
  }
  throw new Error('Match did not end');
}

/** Spawns a shooter right in front of the bow and sinks it with the bow cannon. */
export async function sinkShooterAhead(page: Page): Promise<void> {
  const { player, score } = await state(page);
  const distance = 200;
  await spawnEnemy(page, 'shooter', player.x + Math.cos(player.angle) * distance, player.y + Math.sin(player.angle) * distance, player.angle + Math.PI);
  for (let i = 0; i < 12; i++) {
    await tap(page, 'Space');
    await advance(page, 500);
    if ((await state(page)).score > score) return;
  }
  throw new Error('Shooter was not sunk');
}

export async function serverMatches(page: Page): Promise<ServerMatch[]> {
  return page.evaluate(() => window.__pirate.serverMatches());
}
