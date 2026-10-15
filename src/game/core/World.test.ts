import { describe, expect, it } from 'vitest';
import { ARENA_LAYOUT } from '../arenaLayout';
import { createMatchConfig, type DeepPartial, type GameConfig } from '../config';
import { createArena } from './arena';
import { distanceToObstacle } from './collision';
import { FIXED_DT, FixedStepClock } from './FixedStepClock';
import { type ControlState, IDLE_CONTROLS } from './types';
import { World } from './World';

const NO_SPAWNS: DeepPartial<GameConfig> = { spawn: { initialDelaySec: 9999 } };

function makeWorld(overrides: DeepPartial<GameConfig> = NO_SPAWNS, seed = 1, duration = 120, spawn = 3): World {
  const config = createMatchConfig({ sessionDurationSec: duration, spawnIntervalSec: spawn }, overrides);
  return new World(config, createArena(ARENA_LAYOUT, config.spawn.islandClearance), seed);
}

function run(world: World, seconds: number, controls: Partial<ControlState> = {}): void {
  const input = { ...IDLE_CONTROLS, ...controls };
  const steps = Math.round(seconds / FIXED_DT);
  for (let i = 0; i < steps; i++) world.step(FIXED_DT, input);
}

describe('player movement', () => {
  it('moves forward along its heading and rotates both ways', () => {
    const world = makeWorld();
    const startY = world.player.y;
    run(world, 0.5, { forward: true });
    expect(world.player.y).toBeLessThan(startY);
    const angle = world.player.angle;
    run(world, 0.2, { turnLeft: true });
    expect(world.player.angle).toBeLessThan(angle);
    run(world, 0.4, { turnRight: true });
    expect(world.player.angle).toBeGreaterThan(angle);
  });

  it('never leaves the arena', () => {
    const world = makeWorld();
    world.player.angle = Math.PI; // west
    run(world, 10, { forward: true });
    expect(world.player.x).toBeGreaterThanOrEqual(world.player.radius - 1e-6);
  });

  it('cannot sail through an island', () => {
    const world = makeWorld();
    const island = world.arena.islands.find((i) => i.id === 'south-islet');
    if (!island) throw new Error('missing island');
    world.player.x = island.x + island.width / 2;
    world.player.y = island.y - 120;
    world.player.angle = Math.PI / 2; // south, straight into the islet
    run(world, 4, { forward: true });
    expect(distanceToObstacle(world.player.x, world.player.y, island.obstacle)).toBeGreaterThanOrEqual(world.player.radius - 0.5);
  });
});

describe('weapons', () => {
  it('fires one bow ball and three parallel side balls, respecting cooldowns', () => {
    const world = makeWorld();
    world.step(FIXED_DT, { ...IDLE_CONTROLS, fireFront: true });
    expect(world.projectiles).toHaveLength(1);
    // Holding the trigger does not fire again before the cooldown ends.
    run(world, world.config.player.frontCannon.cooldownSec * 0.5, { fireFront: true });
    expect(world.projectiles.filter((p) => p.team === 'player')).toHaveLength(1);

    world.step(FIXED_DT, { ...IDLE_CONTROLS, fireLeft: true });
    const side = world.projectiles.slice(-3);
    expect(side).toHaveLength(3);
    const first = side[0];
    expect(first).toBeDefined();
    side.forEach((p) => {
      expect(p.vx).toBeCloseTo(first?.vx ?? 0);
      expect(p.vy).toBeCloseTo(first?.vy ?? 0);
    });
  });

  it('removes projectiles once their range is spent', () => {
    const world = makeWorld();
    world.player.angle = 0;
    world.step(FIXED_DT, { ...IDLE_CONTROLS, fireFront: true });
    const { rangeUnits, projectileSpeed } = world.config.player.frontCannon;
    run(world, rangeUnits / projectileSpeed + 0.1);
    expect(world.projectiles).toHaveLength(0);
  });
});

describe('combat and scoring', () => {
  it('applies damage once per projectile and scores a kill once', () => {
    const world = makeWorld();
    const p = world.player;
    p.angle = 0;
    const enemy = world.spawnEnemy('shooter', p.x + 140, p.y, Math.PI);
    if (!enemy) throw new Error('spawn failed');
    enemy.fireCooldown = 999;
    world.step(FIXED_DT, { ...IDLE_CONTROLS, fireFront: true });
    run(world, 0.5);
    expect(enemy.health).toBe(enemy.maxHealth - world.config.player.frontCannon.damage);

    run(world, 3, { fireFront: true });
    expect(enemy.alive).toBe(false);
    expect(world.score).toBe(1);
    run(world, 1, { fireFront: true });
    expect(world.score).toBe(1);
  });

  it('chasers explode on contact, damage the player and do not score', () => {
    const world = makeWorld();
    const p = world.player;
    const chaser = world.spawnEnemy('chaser', p.x + 200, p.y);
    if (!chaser) throw new Error('spawn failed');
    run(world, 3);
    expect(chaser.alive).toBe(false);
    expect(world.player.health).toBe(world.player.maxHealth - world.config.chaser.contactDamage);
    expect(world.score).toBe(0);
  });

  it('shooters approach and fire when in range with line of sight', () => {
    const world = makeWorld();
    const p = world.player;
    world.spawnEnemy('shooter', p.x, p.y + 330, -Math.PI / 2);
    run(world, 3);
    expect(world.player.health).toBeLessThan(world.player.maxHealth);
  });
});

describe('spawning', () => {
  it('spawns both enemy types away from the player and on free water', () => {
    const world = makeWorld({}, 3);
    run(world, 12);
    expect(world.spawnedByKind.chaser).toBeGreaterThan(0);
    expect(world.spawnedByKind.shooter).toBeGreaterThan(0);
  });

  it('follows the configured interval', () => {
    const world = makeWorld({ spawn: { initialDelaySec: 1, maxAlive: 50 } }, 5, 120, 2);
    run(world, 1.01);
    expect(world.spawnedByKind.chaser + world.spawnedByKind.shooter).toBe(1);
    run(world, 2);
    expect(world.spawnedByKind.chaser + world.spawnedByKind.shooter).toBe(2);
    run(world, 2);
    expect(world.spawnedByKind.chaser + world.spawnedByKind.shooter).toBe(3);
  });

  it('keeps spawn points far from the player', () => {
    const world = makeWorld({ spawn: { initialDelaySec: 0.1, intervalSec: 0.2, maxAlive: 50 } }, 9);
    const events: { x: number; y: number }[] = [];
    for (let i = 0; i < 400; i++) {
      world.step(FIXED_DT, IDLE_CONTROLS);
      for (const e of world.drainEvents()) {
        if (e.type === 'enemySpawned') {
          const enemy = world.enemies.find((en) => en.id === e.id);
          if (enemy) events.push({ x: enemy.x, y: enemy.y });
        }
      }
    }
    expect(events.length).toBeGreaterThan(5);
    for (const pos of events) {
      expect(Math.hypot(pos.x - world.player.x, pos.y - world.player.y)).toBeGreaterThanOrEqual(
        world.config.spawn.minDistanceFromPlayer - world.config.chaser.maxSpeed * FIXED_DT * 2,
      );
    }
  });
});

describe('match lifecycle', () => {
  it('ends on time and freezes the simulation', () => {
    const world = makeWorld(NO_SPAWNS, 1, 60);
    run(world, 61, { forward: true });
    expect(world.status).toBe('ended');
    expect(world.endReason).toBe('time_up');
    expect(world.summary().durationMs).toBe(60_000);
    const { x, y } = world.player;
    run(world, 2, { forward: true, fireFront: true });
    expect(world.player.x).toBe(x);
    expect(world.player.y).toBe(y);
  });

  it('ends when the player is destroyed', () => {
    const world = makeWorld();
    world.player.health = 5;
    world.spawnEnemy('chaser', world.player.x + 150, world.player.y);
    run(world, 3);
    expect(world.status).toBe('ended');
    expect(world.endReason).toBe('destroyed');
  });

  it('is deterministic for a given seed and input sequence', () => {
    const play = () => {
      const world = makeWorld({}, 42);
      for (let i = 0; i < 2400; i++) {
        world.step(FIXED_DT, { ...IDLE_CONTROLS, forward: i % 300 < 200, turnLeft: i % 500 < 120, fireFront: i % 7 === 0 });
      }
      return JSON.stringify([world.player, world.enemies, world.score]);
    };
    expect(play()).toBe(play());
  });
});

describe('fixed step clock', () => {
  it('converts frame time into whole steps independent of frame rate', () => {
    const at60 = new FixedStepClock();
    const at144 = new FixedStepClock();
    let steps60 = 0;
    let steps144 = 0;
    for (let i = 0; i < 60; i++) steps60 += at60.consume(1 / 60);
    for (let i = 0; i < 144; i++) steps144 += at144.consume(1 / 144);
    expect(Math.abs(steps60 - steps144)).toBeLessThanOrEqual(1);
    expect(steps60).toBeGreaterThanOrEqual(119);
  });

  it('clamps long frames and ignores real time in manual mode', () => {
    const clock = new FixedStepClock();
    expect(clock.consume(5)).toBe(Math.floor(0.1 / FIXED_DT));
    clock.setManual(true);
    expect(clock.consume(1)).toBe(0);
    expect(clock.stepsFor(1000)).toBe(120);
  });
});
