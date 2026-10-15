import type { EnemyKind } from '../config';

export type ShipKind = 'player' | EnemyKind;
export type Team = 'player' | 'enemy';
export type WeaponSlot = 'front' | 'left' | 'right';
export type EndReason = 'time_up' | 'destroyed';
export type MatchStatus = 'running' | 'ended';

/** Logical input consumed by the simulation; devices only toggle these flags. */
export interface ControlState {
  forward: boolean;
  turnLeft: boolean;
  turnRight: boolean;
  fireFront: boolean;
  fireLeft: boolean;
  fireRight: boolean;
}

export const IDLE_CONTROLS: Readonly<ControlState> = Object.freeze({
  forward: false,
  turnLeft: false,
  turnRight: false,
  fireFront: false,
  fireLeft: false,
  fireRight: false,
});

export interface Ship {
  readonly id: number;
  readonly kind: ShipKind;
  x: number;
  y: number;
  /** Heading in radians, 0 = east, clockwise positive (screen space). */
  angle: number;
  speed: number;
  health: number;
  readonly maxHealth: number;
  readonly radius: number;
  alive: boolean;
}

export interface PlayerShip extends Ship {
  readonly kind: 'player';
  cooldowns: Record<WeaponSlot, number>;
}

export interface EnemyShip extends Ship {
  readonly kind: EnemyKind;
  fireCooldown: number;
}

export interface Projectile {
  readonly id: number;
  readonly team: Team;
  x: number;
  y: number;
  readonly vx: number;
  readonly vy: number;
  readonly damage: number;
  readonly speed: number;
  distanceLeft: number;
  lifeLeft: number;
  alive: boolean;
}

export type GameEvent =
  | { type: 'shot'; team: Team; slot: WeaponSlot; x: number; y: number; angle: number; count: number }
  | { type: 'shipHit'; targetId: number; targetKind: ShipKind; x: number; y: number; damage: number }
  | { type: 'projectileSplash'; x: number; y: number; surface: 'water' | 'island' }
  | {
      type: 'shipDestroyed';
      id: number;
      kind: ShipKind;
      x: number;
      y: number;
      angle: number;
      cause: 'projectile' | 'ram';
      scored: boolean;
    }
  | { type: 'ram'; x: number; y: number; damage: number }
  | { type: 'shipCollision'; x: number; y: number }
  | { type: 'enemySpawned'; id: number; kind: EnemyKind }
  | { type: 'scoreChanged'; score: number }
  | { type: 'matchEnded'; reason: EndReason };

export interface MatchSummary {
  score: number;
  /** Active (unpaused) play time, clamped to the session duration. */
  durationMs: number;
  endReason: EndReason;
  enemiesSpawned: Record<EnemyKind, number>;
}
