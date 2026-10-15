import type { DeepPartial, EnemyKind, GameConfig } from '../game/config';
import type { GameSession } from '../game/GameSession';
import { submissionStore } from '../api/submissionStore';
import { acquirePixiHost } from '../game/render/pixiHost';
import { mockDb } from '../mocks/db';
import { type ScenarioId, updateMockSettings } from '../mocks/scenarios';

/**
 * Test instrumentation, enabled with `?e2e=1` (kept for the browser session).
 * It can observe state, control the simulation clock and set up scenarios,
 * but all gameplay still runs through the real input, rules and renderer.
 * Production users never get it unless they opt in through the URL.
 */
const FLAG_KEY = 'pirate-battle.e2e';

interface E2EOptions {
  seed: number | null;
  manualClock: boolean;
  /** `autopause=0` keeps OS focus changes from pausing long profiling runs. */
  autoPause: boolean;
  overrides: DeepPartial<GameConfig> | null;
}

const options: E2EOptions = { seed: null, manualClock: false, autoPause: true, overrides: null };
let activeSession: GameSession | null = null;
let enabled = false;

function readSessionFlag(): boolean {
  try {
    return window.sessionStorage.getItem(FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

export function initE2EBridge(search: string): void {
  const params = new URLSearchParams(search);
  if (params.get('e2e') === '1') {
    try {
      window.sessionStorage.setItem(FLAG_KEY, '1');
    } catch {
      // ignore
    }
  }
  enabled = readSessionFlag();
  if (!enabled) return;

  const seed = Number(params.get('seed'));
  if (params.has('seed') && Number.isFinite(seed)) options.seed = seed;
  if (params.get('clock') === 'manual') options.manualClock = true;
  if (params.get('autopause') === '0') options.autoPause = false;

  const bridge = {
    getState: () => activeSession?.debugState() ?? null,
    renderStats: () => activeSession?.renderStats() ?? null,
    setManualClock: (manual: boolean) => {
      options.manualClock = manual;
      activeSession?.setManualClock(manual);
    },
    advance: (ms: number) => activeSession?.advance(ms) ?? 0,
    setSeed: (next: number | null) => {
      options.seed = next;
    },
    setConfigOverrides: (overrides: DeepPartial<GameConfig> | null) => {
      options.overrides = overrides;
    },
    spawnEnemy: (kind: EnemyKind, x: number, y: number, angle?: number) =>
      activeSession?.spawnEnemy(kind, x, y, angle) ?? null,
    hasSession: () => activeSession !== null,
    /** Switches the mocked network scenario (also restarts its latency sequence). */
    setScenario: (scenario: ScenarioId, seed?: number) => {
      updateMockSettings(seed === undefined ? { scenario } : { scenario, seed });
    },
    /** Server-side view of stored matches, to assert idempotency. */
    serverMatches: () => mockDb.all(),
    /** GPU-side resources of the shared renderer, used by the memory profiling script. */
    gpuStats: async () => {
      const { app } = await acquirePixiHost();
      const renderer = app.renderer;
      // Deprecated without a public replacement (the GC system keeps its list private); diagnostics only.
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const managed = 'managedTextures' in renderer.texture ? renderer.texture.managedTextures.length : null;
      return { textureSources: managed, stageChildren: app.stage.children.length };
    },
    outbox: () => submissionStore.getSnapshot(),
  };
  Object.defineProperty(window, '__pirate', { value: bridge, configurable: true });
}

export function isE2EEnabled(): boolean {
  return enabled;
}

export function getE2EOptions(): Readonly<E2EOptions> {
  return options;
}

export function registerSession(session: GameSession | null): void {
  if (enabled) activeSession = session;
}
