/**
 * Single source of truth for gameplay tuning.
 *
 * Systems only read from a `GameConfig` snapshot; changing balance means
 * editing `BASE_GAME_CONFIG` (or passing overrides), never touching logic.
 * Distances are in arena units (1 unit = 1 logical pixel of the 1536x896 arena),
 * times in seconds, angles in radians.
 */

export type EnemyKind = 'chaser' | 'shooter';

export interface WeaponConfig {
  /** Minimum time between two shots of this weapon. */
  cooldownSec: number;
  /** Damage applied once per projectile. */
  damage: number;
  /** Projectile speed in units per second. */
  projectileSpeed: number;
  /** Maximum distance travelled before the projectile splashes. */
  rangeUnits: number;
  /** Hard lifetime cap; whichever of range/lifetime ends first removes the projectile. */
  lifetimeSec: number;
  /** Number of parallel projectiles per shot. */
  projectileCount: number;
  /** Distance between parallel projectiles along the hull. */
  spacingUnits: number;
}

export interface ShipConfig {
  maxHealth: number;
  /** Collision radius used against islands, ships and projectiles. */
  radius: number;
  maxSpeed: number;
  acceleration: number;
  deceleration: number;
  turnRate: number;
  /** Visual scale of the 66x113 ship sprites. */
  spriteScale: number;
}

export interface PlayerConfig extends ShipConfig {
  frontCannon: WeaponConfig;
  broadside: WeaponConfig;
}

export interface ChaserConfig extends ShipConfig {
  contactDamage: number;
  scoreValue: number;
}

export interface ShooterConfig extends ShipConfig {
  /** Distance at which the shooter is allowed to fire. */
  attackRange: number;
  /** Distance the shooter tries to keep once engaged. */
  preferredRange: number;
  /** Maximum heading error (radians) allowed to fire. */
  aimTolerance: number;
  cannon: WeaponConfig;
  scoreValue: number;
}

export interface SpawnConfig {
  intervalSec: number;
  initialDelaySec: number;
  /** Delay before trying again when no valid spawn point is available. */
  retryDelaySec: number;
  maxAlive: number;
  minDistanceFromPlayer: number;
  /** Minimum distance between a spawn point and any island. */
  islandClearance: number;
  /** Minimum distance between a spawn point and any other ship. */
  shipClearance: number;
  /** Relative spawn weights after the guaranteed order is exhausted. */
  weights: Record<EnemyKind, number>;
  /** First spawns follow this order so both enemy types always appear. */
  guaranteedOrder: readonly EnemyKind[];
}

export interface SteeringConfig {
  feelerLength: number;
  /** Candidate heading offsets tested (in order) when the direct path is blocked. */
  avoidanceOffsets: readonly number[];
}

export interface GameConfig {
  match: { durationSec: number };
  /** Health ratios below which ships switch to the next damage sprite. */
  damageStages: readonly [number, number];
  player: PlayerConfig;
  chaser: ChaserConfig;
  shooter: ShooterConfig;
  spawn: SpawnConfig;
  steering: SteeringConfig;
}

export const SESSION_DURATION_LIMITS = { min: 60, max: 180, step: 10, default: 120 } as const;
export const SPAWN_INTERVAL_LIMITS = { min: 1, max: 10, step: 0.5, default: 3 } as const;

export const BASE_GAME_CONFIG: GameConfig = {
  match: { durationSec: SESSION_DURATION_LIMITS.default },
  damageStages: [0.66, 0.33],
  player: {
    maxHealth: 100,
    radius: 28,
    maxSpeed: 175,
    acceleration: 240,
    deceleration: 150,
    turnRate: 2.6,
    spriteScale: 0.9,
    frontCannon: {
      cooldownSec: 0.45,
      damage: 15,
      projectileSpeed: 540,
      rangeUnits: 520,
      lifetimeSec: 1.2,
      projectileCount: 1,
      spacingUnits: 0,
    },
    broadside: {
      cooldownSec: 1.6,
      damage: 12,
      projectileSpeed: 430,
      rangeUnits: 300,
      lifetimeSec: 1,
      projectileCount: 3,
      spacingUnits: 22,
    },
  },
  chaser: {
    maxHealth: 30,
    radius: 23,
    maxSpeed: 135,
    acceleration: 160,
    deceleration: 120,
    turnRate: 2,
    spriteScale: 0.74,
    contactDamage: 20,
    scoreValue: 1,
  },
  shooter: {
    maxHealth: 45,
    radius: 26,
    maxSpeed: 95,
    acceleration: 120,
    deceleration: 140,
    turnRate: 1.6,
    spriteScale: 0.82,
    attackRange: 360,
    preferredRange: 250,
    aimTolerance: 0.18,
    scoreValue: 1,
    cannon: {
      cooldownSec: 1.8,
      damage: 10,
      projectileSpeed: 340,
      rangeUnits: 400,
      lifetimeSec: 1.4,
      projectileCount: 1,
      spacingUnits: 0,
    },
  },
  spawn: {
    intervalSec: SPAWN_INTERVAL_LIMITS.default,
    initialDelaySec: 1.5,
    retryDelaySec: 0.25,
    maxAlive: 10,
    minDistanceFromPlayer: 460,
    islandClearance: 40,
    shipClearance: 80,
    weights: { chaser: 0.55, shooter: 0.45 },
    guaranteedOrder: ['chaser', 'shooter'],
  },
  steering: {
    feelerLength: 110,
    avoidanceOffsets: [0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35, 1.8, -1.8],
  },
};

/** The subset of the configuration the player can tune; it identifies a ranking bracket. */
export interface MatchSettings {
  sessionDurationSec: number;
  spawnIntervalSec: number;
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[] ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(patch) || !isPlainObject(base)) return (patch ?? base) as T;
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    result[key] = isPlainObject(value) ? deepMerge(result[key], value) : value;
  }
  return result as T;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach((child) => {
      deepFreeze(child);
    });
    Object.freeze(value);
  }
  return value;
}

/**
 * Builds the immutable configuration snapshot used by one match.
 * Later option changes never mutate a running match.
 */
export function createMatchConfig(settings: MatchSettings, overrides?: DeepPartial<GameConfig>): GameConfig {
  const withSettings = deepMerge(BASE_GAME_CONFIG, {
    match: { durationSec: settings.sessionDurationSec },
    spawn: { intervalSec: settings.spawnIntervalSec },
  });
  return deepFreeze(deepMerge(structuredClone(withSettings), overrides ?? {}));
}
