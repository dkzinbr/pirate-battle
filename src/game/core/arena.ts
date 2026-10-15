import type { RoundedRect } from './collision';
import { distanceToObstacle } from './collision';
import type { Vec2 } from './math';

export const TILE_SIZE = 64;

export type IslandStyle = 'sand' | 'grass';

export type DecorationKind =
  | 'rock'
  | 'rockLarge'
  | 'rockSmall'
  | 'mossyRock'
  | 'mossyRockLarge'
  | 'palm'
  | 'plant'
  | 'fern'
  | 'sprouts'
  | 'tower';

export interface Decoration {
  kind: DecorationKind;
  /** Offset from the island top-left corner, in arena units. */
  x: number;
  y: number;
  rotation?: number;
}

export interface IslandLayout {
  id: string;
  style: IslandStyle;
  /** Position and size in tiles. Minimum size is 2x2 (four corner tiles). */
  tileX: number;
  tileY: number;
  tilesWide: number;
  tilesHigh: number;
  decorations: readonly Decoration[];
}

export interface ArenaLayout {
  columns: number;
  rows: number;
  /** Transparent margin of the island art that ships may overlap. */
  collisionInset: number;
  collisionCornerRadius: number;
  playerSpawn: { x: number; y: number; angle: number };
  spawnBandInset: number;
  spawnSpacing: number;
  islands: readonly IslandLayout[];
}

export interface Island extends IslandLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  obstacle: RoundedRect;
}

export interface Arena {
  width: number;
  height: number;
  islands: readonly Island[];
  obstacles: readonly RoundedRect[];
  playerSpawn: { x: number; y: number; angle: number };
  /** Water positions near the arena borders where enemies may enter. */
  spawnCandidates: readonly Vec2[];
}

export function createArena(layout: ArenaLayout, spawnClearance: number): Arena {
  const width = layout.columns * TILE_SIZE;
  const height = layout.rows * TILE_SIZE;
  const inset = layout.collisionInset;
  const r = layout.collisionCornerRadius;

  const islands: Island[] = layout.islands.map((island) => {
    const x = island.tileX * TILE_SIZE;
    const y = island.tileY * TILE_SIZE;
    const w = island.tilesWide * TILE_SIZE;
    const h = island.tilesHigh * TILE_SIZE;
    return {
      ...island,
      x,
      y,
      width: w,
      height: h,
      obstacle: {
        minX: x + inset + r,
        minY: y + inset + r,
        maxX: x + w - inset - r,
        maxY: y + h - inset - r,
        cornerRadius: r,
      },
    };
  });
  const obstacles = islands.map((island) => island.obstacle);

  const spawnCandidates: Vec2[] = [];
  const band = layout.spawnBandInset;
  const pushIfFree = (x: number, y: number) => {
    if (obstacles.every((o) => distanceToObstacle(x, y, o) >= spawnClearance)) spawnCandidates.push({ x, y });
  };
  for (let x = band; x <= width - band; x += layout.spawnSpacing) {
    pushIfFree(x, band);
    pushIfFree(x, height - band);
  }
  for (let y = band + layout.spawnSpacing; y < height - band; y += layout.spawnSpacing) {
    pushIfFree(band, y);
    pushIfFree(width - band, y);
  }

  return { width, height, islands, obstacles, playerSpawn: layout.playerSpawn, spawnCandidates };
}
