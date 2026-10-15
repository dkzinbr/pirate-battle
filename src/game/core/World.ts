import type { EnemyKind, GameConfig, ShipConfig, WeaponConfig } from '../config';
import type { Arena } from './arena';
import {
  circlesOverlap,
  clampCircleToBounds,
  isOutsideBounds,
  pointInsideAnyObstacle,
  resolveCircleVsObstacles,
  segmentBlocked,
} from './collision';
import { angleBetween, approach, approachAngle, distance, distanceSq, wrapAngle } from './math';
import { Rng } from './rng';
import type {
  ControlState,
  EndReason,
  EnemyShip,
  GameEvent,
  MatchStatus,
  MatchSummary,
  PlayerShip,
  Projectile,
  Ship,
  Team,
  WeaponSlot,
} from './types';

const PROJECTILE_RADIUS = 4;
const MUZZLE_GAP = 6;

interface ProjectileWithOwner extends Projectile {
  readonly ownerId: number;
}

/**
 * Pure, renderer-agnostic simulation of one match.
 *
 * Everything is advanced by `step(dt)` with a fixed dt supplied by the
 * caller, so gameplay is independent from the display frame rate and fully
 * reproducible for a given seed and input sequence.
 */
export class World {
  readonly config: GameConfig;
  readonly arena: Arena;
  readonly player: PlayerShip;
  readonly enemies: EnemyShip[] = [];
  readonly projectiles: ProjectileWithOwner[] = [];

  status: MatchStatus = 'running';
  endReason: EndReason | null = null;
  elapsed = 0;
  score = 0;
  readonly spawnedByKind: Record<EnemyKind, number> = { chaser: 0, shooter: 0 };

  private readonly rng: Rng;
  private nextId = 1;
  private spawnTimer: number;
  private spawnCount = 0;
  /** Weighted kind already rolled for a spawn that could not be placed yet. */
  private pendingKind: EnemyKind | null = null;
  private events: GameEvent[] = [];
  private readonly contacts = new Set<number>();

  constructor(config: GameConfig, arena: Arena, seed: number) {
    this.config = config;
    this.arena = arena;
    this.rng = new Rng(seed);
    this.spawnTimer = config.spawn.initialDelaySec;
    const p = config.player;
    this.player = {
      id: this.nextId++,
      kind: 'player',
      x: arena.playerSpawn.x,
      y: arena.playerSpawn.y,
      angle: arena.playerSpawn.angle,
      speed: 0,
      health: p.maxHealth,
      maxHealth: p.maxHealth,
      radius: p.radius,
      alive: true,
      cooldowns: { front: 0, left: 0, right: 0 },
    };
  }

  get timeLeft(): number {
    return Math.max(0, this.config.match.durationSec - this.elapsed);
  }

  /** Returns and clears the events produced since the last call. */
  drainEvents(): GameEvent[] {
    const drained = this.events;
    this.events = [];
    return drained;
  }

  step(dt: number, controls: Readonly<ControlState>): void {
    if (this.status !== 'running') return;
    this.elapsed = Math.min(this.elapsed + dt, this.config.match.durationSec);

    this.updatePlayer(dt, controls);
    this.updateSpawner(dt);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.resolveShipContacts();
    this.removeDead();

    if (!this.player.alive) this.end('destroyed');
    else if (this.elapsed >= this.config.match.durationSec) this.end('time_up');
  }

  summary(): MatchSummary {
    return {
      score: this.score,
      durationMs: Math.round(this.elapsed * 1000),
      endReason: this.endReason ?? 'time_up',
      enemiesSpawned: { ...this.spawnedByKind },
    };
  }

  /** Spawns an enemy at an explicit position. Returns null when the spot is blocked. */
  spawnEnemy(kind: EnemyKind, x: number, y: number, angle?: number): EnemyShip | null {
    const cfg = this.shipConfig(kind);
    if (pointInsideAnyObstacle(x, y, this.arena.obstacles, cfg.radius)) return null;
    if (isOutsideBounds(x, y, this.arena, -cfg.radius)) return null;
    const enemy: EnemyShip = {
      id: this.nextId++,
      kind,
      x,
      y,
      angle: angle ?? angleBetween(x, y, this.player.x, this.player.y),
      speed: 0,
      health: cfg.maxHealth,
      maxHealth: cfg.maxHealth,
      radius: cfg.radius,
      alive: true,
      fireCooldown: kind === 'shooter' ? this.config.shooter.cannon.cooldownSec * 0.5 : 0,
    };
    this.enemies.push(enemy);
    this.spawnedByKind[kind] += 1;
    this.events.push({ type: 'enemySpawned', id: enemy.id, kind });
    return enemy;
  }

  // ---------------------------------------------------------------- player

  private updatePlayer(dt: number, controls: Readonly<ControlState>): void {
    const ship = this.player;
    const cfg = this.config.player;
    const cd = ship.cooldowns;
    cd.front = Math.max(0, cd.front - dt);
    cd.left = Math.max(0, cd.left - dt);
    cd.right = Math.max(0, cd.right - dt);

    const turn = (controls.turnRight ? 1 : 0) - (controls.turnLeft ? 1 : 0);
    ship.angle = wrapAngle(ship.angle + turn * cfg.turnRate * dt);
    const targetSpeed = controls.forward ? cfg.maxSpeed : 0;
    const rate = targetSpeed > ship.speed ? cfg.acceleration : cfg.deceleration;
    ship.speed = approach(ship.speed, targetSpeed, rate * dt);
    this.moveShip(ship, dt);

    if (controls.fireFront && cd.front <= 0) {
      this.fire(ship, 'player', cfg.frontCannon, 'front');
      cd.front = cfg.frontCannon.cooldownSec;
    }
    if (controls.fireLeft && cd.left <= 0) {
      this.fire(ship, 'player', cfg.broadside, 'left');
      cd.left = cfg.broadside.cooldownSec;
    }
    if (controls.fireRight && cd.right <= 0) {
      this.fire(ship, 'player', cfg.broadside, 'right');
      cd.right = cfg.broadside.cooldownSec;
    }
  }

  // --------------------------------------------------------------- enemies

  private updateSpawner(dt: number): void {
    const spawn = this.config.spawn;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;

    const alive = this.enemies.reduce((count, e) => count + (e.alive ? 1 : 0), 0);
    const kind = this.nextSpawnKind();
    const point = alive < spawn.maxAlive ? this.pickSpawnPoint(kind) : null;
    if (!point) {
      this.spawnTimer = spawn.retryDelaySec;
      return;
    }
    if (this.spawnEnemy(kind, point.x, point.y)) {
      this.spawnCount += 1;
      this.spawnTimer += spawn.intervalSec;
    } else {
      this.spawnTimer = spawn.retryDelaySec;
    }
  }

  private nextSpawnKind(): EnemyKind {
    const order = this.config.spawn.guaranteedOrder;
    const guaranteed = order[this.spawnCount];
    if (guaranteed) return guaranteed;
    if (this.pendingKind) return this.pendingKind;
    const { chaser, shooter } = this.config.spawn.weights;
    const total = chaser + shooter;
    const kind: EnemyKind = total <= 0 || this.rng.next() * total < chaser ? 'chaser' : 'shooter';
    this.pendingKind = kind;
    return kind;
  }

  private pickSpawnPoint(kind: EnemyKind): { x: number; y: number } | null {
    const spawn = this.config.spawn;
    const radius = this.shipConfig(kind).radius;
    const minPlayerSq = spawn.minDistanceFromPlayer ** 2;
    const valid = this.arena.spawnCandidates.filter((c) => {
      if (distanceSq(c.x, c.y, this.player.x, this.player.y) < minPlayerSq) return false;
      if (pointInsideAnyObstacle(c.x, c.y, this.arena.obstacles, radius)) return false;
      return this.enemies.every(
        (e) => !e.alive || distanceSq(c.x, c.y, e.x, e.y) >= (spawn.shipClearance + e.radius) ** 2,
      );
    });
    const choice = this.rng.pick(valid);
    if (choice) this.pendingKind = null;
    return choice ?? null;
  }

  private updateEnemies(dt: number): void {
    const player = this.player;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const cfg = this.shipConfig(enemy.kind);
      const toPlayer = angleBetween(enemy.x, enemy.y, player.x, player.y);
      const dist = distance(enemy.x, enemy.y, player.x, player.y);
      let targetSpeed = cfg.maxSpeed;
      let desired = toPlayer;
      let engaged = false;

      if (enemy.kind === 'shooter') {
        const shooter = this.config.shooter;
        enemy.fireCooldown = Math.max(0, enemy.fireCooldown - dt);
        const clearShot = !segmentBlocked(enemy.x, enemy.y, player.x, player.y, this.arena.obstacles);
        // Engaged: in range with a clear shot. Aim at the player and creep closer
        // (collisions still slide it along islands) instead of steering away.
        engaged = clearShot && dist <= shooter.attackRange;
        if (engaged) targetSpeed = dist <= shooter.preferredRange ? 0 : cfg.maxSpeed * 0.4;

        const aimError = Math.abs(wrapAngle(toPlayer - enemy.angle));
        if (engaged && enemy.fireCooldown <= 0 && aimError <= shooter.aimTolerance) {
          this.fire(enemy, 'enemy', shooter.cannon, 'front');
          enemy.fireCooldown = shooter.cannon.cooldownSec;
        }
      }

      if (!engaged && targetSpeed > 0) {
        desired = this.avoidObstacles(enemy, desired, Math.min(dist, this.config.steering.feelerLength));
      }
      enemy.angle = approachAngle(enemy.angle, desired, cfg.turnRate * dt);
      const rate = targetSpeed > enemy.speed ? cfg.acceleration : cfg.deceleration;
      enemy.speed = approach(enemy.speed, targetSpeed, rate * dt);
      this.moveShip(enemy, dt);
    }
  }

  /** Picks the heading closest to `desired` whose short look-ahead path is free. */
  private avoidObstacles(ship: Ship, desired: number, lookAhead: number): number {
    const length = Math.max(lookAhead, ship.radius * 2);
    for (const offset of this.config.steering.avoidanceOffsets) {
      const heading = desired + offset;
      if (this.pathClear(ship, heading, length)) return heading;
    }
    return ship.angle + Math.PI / 2;
  }

  private pathClear(ship: Ship, heading: number, length: number): boolean {
    const cos = Math.cos(heading);
    const sin = Math.sin(heading);
    for (const t of [0.35, 0.7, 1]) {
      const px = ship.x + cos * length * t;
      const py = ship.y + sin * length * t;
      if (isOutsideBounds(px, py, this.arena, -ship.radius)) return false;
      if (pointInsideAnyObstacle(px, py, this.arena.obstacles, ship.radius)) return false;
    }
    return true;
  }

  // ------------------------------------------------------------ projectiles

  private fire(ship: Ship, team: Team, weapon: WeaponConfig, slot: WeaponSlot): void {
    const forwardX = Math.cos(ship.angle);
    const forwardY = Math.sin(ship.angle);
    const direction = slot === 'front' ? ship.angle : ship.angle + (slot === 'left' ? -Math.PI / 2 : Math.PI / 2);
    const dirX = Math.cos(direction);
    const dirY = Math.sin(direction);
    const muzzle = slot === 'front' ? ship.radius + MUZZLE_GAP : ship.radius * 0.7;

    for (let i = 0; i < weapon.projectileCount; i++) {
      const along = (i - (weapon.projectileCount - 1) / 2) * weapon.spacingUnits;
      this.projectiles.push({
        id: this.nextId++,
        ownerId: ship.id,
        team,
        x: ship.x + forwardX * along + dirX * muzzle,
        y: ship.y + forwardY * along + dirY * muzzle,
        vx: dirX * weapon.projectileSpeed,
        vy: dirY * weapon.projectileSpeed,
        speed: weapon.projectileSpeed,
        damage: weapon.damage,
        distanceLeft: weapon.rangeUnits,
        lifeLeft: weapon.lifetimeSec,
        alive: true,
      });
    }
    this.events.push({
      type: 'shot',
      team,
      slot,
      x: ship.x + dirX * muzzle,
      y: ship.y + dirY * muzzle,
      angle: direction,
      count: weapon.projectileCount,
    });
  }

  private updateProjectiles(dt: number): void {
    const obstacles = this.arena.obstacles;
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.distanceLeft -= p.speed * dt;
      p.lifeLeft -= dt;

      if (isOutsideBounds(p.x, p.y, this.arena)) {
        p.alive = false;
        continue;
      }
      if (pointInsideAnyObstacle(p.x, p.y, obstacles)) {
        p.alive = false;
        this.events.push({ type: 'projectileSplash', x: p.x, y: p.y, surface: 'island' });
        continue;
      }
      const target = this.findProjectileTarget(p);
      if (target) {
        p.alive = false;
        this.applyDamage(target, p.damage, 'projectile', p.team === 'player');
        continue;
      }
      if (p.distanceLeft <= 0 || p.lifeLeft <= 0) {
        p.alive = false;
        this.events.push({ type: 'projectileSplash', x: p.x, y: p.y, surface: 'water' });
      }
    }
  }

  private findProjectileTarget(p: Projectile): Ship | null {
    if (p.team === 'enemy') {
      const pl = this.player;
      return pl.alive && circlesOverlap(p.x, p.y, PROJECTILE_RADIUS, pl.x, pl.y, pl.radius) ? pl : null;
    }
    for (const enemy of this.enemies) {
      if (enemy.alive && circlesOverlap(p.x, p.y, PROJECTILE_RADIUS, enemy.x, enemy.y, enemy.radius)) return enemy;
    }
    return null;
  }

  // ----------------------------------------------------------------- damage

  private applyDamage(ship: Ship, damage: number, cause: 'projectile' | 'ram', byPlayer: boolean): void {
    if (!ship.alive || this.status !== 'running') return;
    ship.health = Math.max(0, ship.health - damage);
    this.events.push({ type: 'shipHit', targetId: ship.id, targetKind: ship.kind, x: ship.x, y: ship.y, damage });
    if (ship.health > 0) return;
    const scored = ship.kind !== 'player' && byPlayer;
    this.destroyShip(ship, cause, scored);
  }

  private destroyShip(ship: Ship, cause: 'projectile' | 'ram', scored: boolean): void {
    ship.alive = false;
    ship.speed = 0;
    this.events.push({ type: 'shipDestroyed', id: ship.id, kind: ship.kind, x: ship.x, y: ship.y, angle: ship.angle, cause, scored });
    if (scored) {
      this.score += ship.kind === 'chaser' ? this.config.chaser.scoreValue : this.config.shooter.scoreValue;
      this.events.push({ type: 'scoreChanged', score: this.score });
    }
    // Destroyed ships stop dealing damage, including cannonballs still in flight.
    for (const p of this.projectiles) {
      if (p.alive && p.ownerId === ship.id) {
        p.alive = false;
        this.events.push({ type: 'projectileSplash', x: p.x, y: p.y, surface: 'water' });
      }
    }
  }

  private resolveShipContacts(): void {
    const player = this.player;
    const chaser = this.config.chaser;
    for (const enemy of this.enemies) {
      if (!enemy.alive || !player.alive) continue;
      if (!circlesOverlap(player.x, player.y, player.radius, enemy.x, enemy.y, enemy.radius)) {
        this.contacts.delete(enemy.id);
        continue;
      }
      if (enemy.kind === 'chaser') {
        this.events.push({ type: 'ram', x: (player.x + enemy.x) / 2, y: (player.y + enemy.y) / 2, damage: chaser.contactDamage });
        this.destroyShip(enemy, 'ram', false);
        this.applyDamage(player, chaser.contactDamage, 'ram', false);
        continue;
      }
      this.separate(player, enemy);
      if (!this.contacts.has(enemy.id)) {
        this.contacts.add(enemy.id);
        this.events.push({ type: 'shipCollision', x: (player.x + enemy.x) / 2, y: (player.y + enemy.y) / 2 });
      }
    }

    for (let i = 0; i < this.enemies.length; i++) {
      const a = this.enemies[i];
      if (!a?.alive) continue;
      for (let j = i + 1; j < this.enemies.length; j++) {
        const b = this.enemies[j];
        if (b?.alive && circlesOverlap(a.x, a.y, a.radius, b.x, b.y, b.radius)) this.separate(a, b);
      }
    }
  }

  private separate(a: Ship, b: Ship): void {
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    let dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1e-6) {
      dx = 1;
      dy = 0;
      dist = 1;
    }
    const overlap = a.radius + b.radius - dist;
    if (overlap <= 0) return;
    const nx = dx / dist;
    const ny = dy / dist;
    a.x -= nx * overlap * 0.5;
    a.y -= ny * overlap * 0.5;
    b.x += nx * overlap * 0.5;
    b.y += ny * overlap * 0.5;
    this.constrain(a);
    this.constrain(b);
  }

  // --------------------------------------------------------------- helpers

  private moveShip(ship: Ship, dt: number): void {
    ship.x += Math.cos(ship.angle) * ship.speed * dt;
    ship.y += Math.sin(ship.angle) * ship.speed * dt;
    this.constrain(ship);
  }

  private constrain(ship: Ship): void {
    resolveCircleVsObstacles(ship, ship.radius, this.arena.obstacles);
    clampCircleToBounds(ship, ship.radius, this.arena);
  }

  private removeDead(): void {
    compactInPlace(this.projectiles, (p) => p.alive);
    compactInPlace(this.enemies, (e) => e.alive);
  }

  private end(reason: EndReason): void {
    this.status = 'ended';
    this.endReason = reason;
    this.player.speed = 0;
    this.events.push({ type: 'matchEnded', reason });
  }

  private shipConfig(kind: EnemyKind): ShipConfig {
    return kind === 'chaser' ? this.config.chaser : this.config.shooter;
  }
}

function compactInPlace<T>(items: T[], keep: (item: T) => boolean): void {
  let write = 0;
  for (const item of items) {
    if (keep(item)) items[write++] = item;
  }
  items.length = write;
}
