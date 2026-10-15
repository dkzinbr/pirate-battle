import type { ArenaLayout } from './core/arena';

/**
 * Hand-made arena: 24x14 tiles (1536x896 units) with an open central lake for
 * the player spawn and islands spread around it to create cover and chokepoints.
 */
export const ARENA_LAYOUT: ArenaLayout = {
  columns: 24,
  rows: 14,
  collisionInset: 6,
  collisionCornerRadius: 26,
  playerSpawn: { x: 768, y: 448, angle: -Math.PI / 2 },
  spawnBandInset: 52,
  spawnSpacing: 96,
  islands: [
    {
      id: 'north-west-fort',
      style: 'grass',
      tileX: 1,
      tileY: 1,
      tilesWide: 5,
      tilesHigh: 4,
      decorations: [
        { kind: 'tower', x: 64, y: 70 },
        { kind: 'palm', x: 210, y: 150 },
        { kind: 'fern', x: 120, y: 190 },
        { kind: 'sprouts', x: 250, y: 70 },
        { kind: 'mossyRock', x: 270, y: 210 },
      ],
    },
    {
      id: 'north-sandbar',
      style: 'sand',
      tileX: 14,
      tileY: 1,
      tilesWide: 3,
      tilesHigh: 3,
      decorations: [
        { kind: 'rockLarge', x: 96, y: 96 },
        { kind: 'plant', x: 54, y: 140 },
      ],
    },
    {
      id: 'east-rock',
      style: 'sand',
      tileX: 20,
      tileY: 3,
      tilesWide: 2,
      tilesHigh: 2,
      decorations: [{ kind: 'rock', x: 64, y: 60 }],
    },
    {
      id: 'south-east-jungle',
      style: 'grass',
      tileX: 16,
      tileY: 8,
      tilesWide: 6,
      tilesHigh: 4,
      decorations: [
        { kind: 'palm', x: 130, y: 110 },
        { kind: 'palm', x: 270, y: 170 },
        { kind: 'fern', x: 210, y: 90 },
        { kind: 'mossyRockLarge', x: 300, y: 80 },
        { kind: 'sprouts', x: 100, y: 190 },
      ],
    },
    {
      id: 'south-west-beach',
      style: 'sand',
      tileX: 3,
      tileY: 9,
      tilesWide: 4,
      tilesHigh: 3,
      decorations: [
        { kind: 'palm', x: 80, y: 90 },
        { kind: 'rockSmall', x: 180, y: 120 },
        { kind: 'plant', x: 170, y: 60 },
      ],
    },
    {
      id: 'south-islet',
      style: 'sand',
      tileX: 10,
      tileY: 10,
      tilesWide: 2,
      tilesHigh: 2,
      decorations: [{ kind: 'mossyRock', x: 64, y: 64 }],
    },
  ],
};
