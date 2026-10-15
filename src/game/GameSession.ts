import type { Ticker } from 'pixi.js';
import { ExternalStore, shallowEqual } from '../shared/externalStore';
import type { GameTextures } from './assets/GameTextures';
import type { EnemyKind, GameConfig } from './config';
import { createArena } from './core/arena';
import { FIXED_DT, FixedStepClock } from './core/FixedStepClock';
import type { EndReason, MatchSummary } from './core/types';
import { World } from './core/World';
import { ARENA_LAYOUT } from './arenaLayout';
import { GameAudio } from './GameAudio';
import { ControlInput } from './input/ControlInput';
import { KeyboardController } from './input/KeyboardController';
import { ArenaRenderer, type RenderStats } from './render/ArenaRenderer';
import type { PixiHost } from './render/pixiHost';

export type PauseReason = 'manual' | 'blur' | 'hidden' | 'orientation';
export type SessionPhase = 'running' | 'paused' | 'ending' | 'ended';

/** Coarse, UI-facing state. Only changes a few times per second at most. */
export interface HudState {
  phase: SessionPhase;
  pauseReason: PauseReason | null;
  score: number;
  health: number;
  maxHealth: number;
  timeLeftSec: number;
  durationSec: number;
  endReason: EndReason | null;
}

export interface GameSessionOptions {
  host: PixiHost;
  textures: GameTextures;
  config: GameConfig;
  seed: number;
  manualClock?: boolean;
  /** Real time to let the final explosion play before reporting the result. */
  endDelayMs?: number;
  onEnded: (summary: MatchSummary) => void;
}

/** Steps per render batch when advancing a manual clock (one 60 Hz frame). */
const MANUAL_BATCH = 2;

/**
 * Owns one match: the World, its renderer, input devices and timers.
 * React only creates/destroys it and reads `hud`; continuous combat state
 * never leaves the simulation.
 */
export class GameSession {
  readonly hud: ExternalStore<HudState>;
  readonly input = new ControlInput();
  readonly config: GameConfig;
  readonly seed: number;

  private readonly host: PixiHost;
  private readonly world: World;
  private readonly renderer: ArenaRenderer;
  private readonly clock: FixedStepClock;
  private readonly keyboard: KeyboardController;
  private readonly sound = new GameAudio();
  private readonly onEnded: (summary: MatchSummary) => void;
  private readonly endDelayMs: number;
  private phase: SessionPhase = 'running';
  private pauseReason: PauseReason | null = null;
  private container: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private endingLeftMs = 0;
  private destroyed = false;

  constructor(options: GameSessionOptions) {
    this.host = options.host;
    this.config = options.config;
    this.seed = options.seed;
    this.onEnded = options.onEnded;
    this.endDelayMs = options.endDelayMs ?? 1400;
    this.clock = new FixedStepClock({ manual: options.manualClock ?? false });
    this.world = new World(options.config, createArena(ARENA_LAYOUT, options.config.spawn.islandClearance), options.seed);
    this.renderer = new ArenaRenderer(options.host, this.world, options.textures, options.seed);
    this.keyboard = new KeyboardController(this.input, () => {
      this.pause('manual');
    });
    this.hud = new ExternalStore<HudState>(this.computeHud(), shallowEqual);
  }

  mount(container: HTMLElement): void {
    if (this.destroyed || this.container) return;
    this.container = container;
    const { app } = this.host;
    container.appendChild(app.canvas);
    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
    });
    this.resizeObserver.observe(container);
    this.resize();

    app.ticker.add(this.tick);
    this.syncTicker();
    this.keyboard.attach();
    document.addEventListener('visibilitychange', this.handleVisibility);
    window.addEventListener('blur', this.handleBlur);
    this.sound.start();
  }

  pause(reason: PauseReason): void {
    if (this.phase !== 'running') return;
    this.phase = 'paused';
    this.pauseReason = reason;
    this.input.setEnabled(false);
    this.sound.pause();
    this.publishHud();
  }

  /** Resuming always requires an explicit player action. */
  resume(): void {
    if (this.phase !== 'paused') return;
    this.clock.reset();
    this.input.setEnabled(true);
    this.phase = 'running';
    this.pauseReason = null;
    this.sound.resume();
    this.publishHud();
  }

  // ------------------------------------------------------------ test hooks

  get isManualClock(): boolean {
    return this.clock.isManual;
  }

  setManualClock(manual: boolean): void {
    this.clock.setManual(manual);
    if (this.container) this.syncTicker();
  }

  /** A manual clock renders only when advanced, so idle test pages cost nothing. */
  private syncTicker(): void {
    const { app } = this.host;
    if (this.clock.isManual) {
      app.ticker.stop();
      app.render();
    } else {
      app.ticker.start();
    }
  }

  /**
   * Advances the real simulation by `ms` of game time (manual clock only).
   * Time left over after the match ends plays the final explosion and, once
   * the end delay is spent, reports the result. Returns simulated match time.
   */
  advance(ms: number): number {
    if (!this.clock.isManual || this.destroyed) return 0;
    let remaining = this.clock.stepsFor(ms);
    let taken = 0;
    while (remaining > 0 && this.phase === 'running') {
      const batch = Math.min(MANUAL_BATCH, remaining);
      taken += this.simulate(batch);
      remaining -= batch;
    }
    const simulatedMs = taken * FIXED_DT * 1000;
    if (this.phase === 'ending') this.playEnding(ms - simulatedMs);
    this.host.app.render();
    return simulatedMs;
  }

  spawnEnemy(kind: EnemyKind, x: number, y: number, angle?: number): number | null {
    const enemy = this.world.spawnEnemy(kind, x, y, angle);
    this.renderer.update(0);
    return enemy?.id ?? null;
  }

  debugState() {
    const w = this.world;
    const p = w.player;
    return {
      phase: this.phase,
      pauseReason: this.pauseReason,
      status: w.status,
      endReason: w.endReason,
      elapsed: w.elapsed,
      timeLeft: w.timeLeft,
      score: w.score,
      seed: this.seed,
      config: { durationSec: w.config.match.durationSec, spawnIntervalSec: w.config.spawn.intervalSec },
      player: {
        x: p.x,
        y: p.y,
        angle: p.angle,
        speed: p.speed,
        health: p.health,
        alive: p.alive,
        radius: p.radius,
        cooldowns: { ...p.cooldowns },
      },
      enemies: w.enemies.map((e) => ({
        id: e.id,
        kind: e.kind,
        x: e.x,
        y: e.y,
        angle: e.angle,
        speed: e.speed,
        health: e.health,
        alive: e.alive,
      })),
      projectiles: w.projectiles.map((pr) => ({ id: pr.id, team: pr.team, x: pr.x, y: pr.y })),
      spawned: { ...w.spawnedByKind },
      obstacles: w.arena.obstacles.map((o) => ({ ...o })),
      arena: { width: w.arena.width, height: w.arena.height },
    };
  }

  renderStats(): RenderStats {
    return this.renderer.stats();
  }

  // -------------------------------------------------------------- internals

  private readonly tick = (ticker: Ticker): void => {
    if (this.phase === 'running') {
      const steps = this.clock.consume(ticker.deltaMS / 1000);
      if (steps > 0) this.simulate(steps);
    } else if (this.phase === 'ending' && !this.clock.isManual) {
      this.playEnding(ticker.deltaMS);
    }
  };

  /** The world is frozen; only the final explosion animates until the result is reported. */
  private playEnding(ms: number): void {
    let left = Math.max(0, ms);
    while (left > 0 && this.phase === 'ending') {
      const slice = Math.min(left, 1000 / 60, this.endingLeftMs);
      this.renderer.update(slice / 1000);
      this.endingLeftMs -= slice;
      left -= slice;
      if (this.endingLeftMs <= 0) this.complete();
    }
  }

  private complete(): void {
    if (this.phase !== 'ending' || this.destroyed) return;
    this.phase = 'ended';
    this.publishHud();
    this.onEnded(this.world.summary());
  }

  private simulate(steps: number): number {
    let taken = 0;
    for (; taken < steps; taken++) {
      this.world.step(FIXED_DT, this.input.sample());
      if (this.world.status !== 'running') {
        taken++;
        break;
      }
    }
    const events = this.world.drainEvents();
    this.renderer.handleEvents(events);
    this.sound.handle(events, this.world);
    this.renderer.update(taken * FIXED_DT);
    if (this.world.status === 'ended') this.finish();
    this.publishHud();
    return taken;
  }

  private finish(): void {
    if (this.phase !== 'running') return;
    this.phase = 'ending';
    this.endingLeftMs = this.endDelayMs;
    this.input.setEnabled(false);
  }

  private resize(): void {
    const container = this.container;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const resolution = Math.min(window.devicePixelRatio || 1, 2);
    this.host.app.renderer.resize(width, height, resolution);
    this.renderer.layout(width, height);
    this.host.app.render();
  }

  private computeHud(): HudState {
    const w = this.world;
    return {
      phase: this.phase,
      pauseReason: this.pauseReason,
      score: w.score,
      health: Math.ceil(w.player.health),
      maxHealth: w.player.maxHealth,
      timeLeftSec: Math.ceil(w.timeLeft - 1e-9),
      durationSec: w.config.match.durationSec,
      endReason: w.endReason,
    };
  }

  private publishHud(): void {
    this.hud.set(this.computeHud());
  }

  private readonly handleVisibility = (): void => {
    if (document.visibilityState === 'hidden') this.pause('hidden');
  };

  private readonly handleBlur = (): void => {
    this.pause('blur');
  };

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    const { app } = this.host;
    app.ticker.remove(this.tick);
    app.ticker.stop();
    this.keyboard.detach();
    this.input.reset();
    document.removeEventListener('visibilitychange', this.handleVisibility);
    window.removeEventListener('blur', this.handleBlur);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.sound.stop();
    this.renderer.destroy();
    if (this.container && app.canvas.parentElement === this.container) this.container.removeChild(app.canvas);
    this.container = null;
  }
}
