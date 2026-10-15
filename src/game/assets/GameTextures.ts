import type { Texture } from 'pixi.js';
import type { DecorationKind } from '../core/arena';

/** Sail colours in the order used by the ship_N sprite numbering. */
export const SHIP_COLORS = ['white', 'black', 'red', 'green', 'blue', 'yellow'] as const;
export type ShipColor = (typeof SHIP_COLORS)[number];

/** Four damage stages: intact, damaged, heavily damaged, wreck. */
export type ShipStageTextures = readonly [Texture, Texture, Texture, Texture];

export interface HealthBarTextures {
  frame: Texture;
  fillGreen: Texture;
  fillRed: Texture;
  /** Visible part of the fill sprite in logical units, relative to its top-left. */
  fillRect: { x: number; y: number; w: number; h: number };
}

/** 9-slice tile set: [row][column] with rows/columns = start, middle, end. */
export type NineSliceTiles = readonly [
  readonly [Texture, Texture, Texture],
  readonly [Texture, Texture, Texture],
  readonly [Texture, Texture, Texture],
];

export interface GameTextures {
  ships: Readonly<Record<ShipColor, ShipStageTextures>>;
  cannonBall: Texture;
  explosions: readonly [Texture, Texture, Texture];
  fires: readonly [Texture, Texture];
  wood: readonly Texture[];
  water: Texture;
  sandIsland: NineSliceTiles;
  grassIsland: NineSliceTiles;
  shallowWater: NineSliceTiles;
  decorations: Readonly<Record<DecorationKind, Texture>>;
  healthBar: HealthBarTextures;
}
