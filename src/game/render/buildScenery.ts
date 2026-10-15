import { Container, Sprite, type Texture, TilingSprite } from 'pixi.js';
import type { GameTextures, NineSliceTiles } from '../assets/GameTextures';
import type { Arena, Island } from '../core/arena';
import { TILE_SIZE } from '../core/arena';

export interface Scenery {
  container: Container;
  /** Animates the water using simulation time so paused frames stay still. */
  update(time: number): void;
}

function sliceIndex(i: number, count: number): 0 | 1 | 2 {
  if (i === 0) return 0;
  if (i === count - 1) return 2;
  return 1;
}

function addNineSlice(parent: Container, tiles: NineSliceTiles, tileX: number, tileY: number, cols: number, rows: number) {
  for (let r = 0; r < rows; r++) {
    const row = tiles[sliceIndex(r, rows)];
    for (let c = 0; c < cols; c++) {
      const sprite = new Sprite(row[sliceIndex(c, cols)]);
      sprite.position.set((tileX + c) * TILE_SIZE, (tileY + r) * TILE_SIZE);
      parent.addChild(sprite);
    }
  }
}

function addIsland(parent: Container, island: Island, textures: GameTextures) {
  const tiles = island.style === 'grass' ? textures.grassIsland : textures.sandIsland;
  addNineSlice(parent, tiles, island.tileX, island.tileY, island.tilesWide, island.tilesHigh);
  for (const deco of island.decorations) {
    const texture: Texture = textures.decorations[deco.kind];
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.position.set(island.x + deco.x, island.y + deco.y);
    sprite.rotation = deco.rotation ?? 0;
    parent.addChild(sprite);
  }
}

/** Static arena art: animated water, shallow rims, islands and decorations. */
export function buildScenery(arena: Arena, textures: GameTextures): Scenery {
  const container = new Container({ label: 'scenery' });

  const water = new TilingSprite({ texture: textures.water, width: arena.width, height: arena.height });
  const shimmer = new TilingSprite({ texture: textures.water, width: arena.width, height: arena.height });
  shimmer.alpha = 0.22;
  shimmer.tileScale.set(1.6);
  container.addChild(water, shimmer);

  const shallow = new Container({ label: 'shallow' });
  shallow.alpha = 0.85;
  for (const island of arena.islands) {
    addNineSlice(shallow, textures.shallowWater, island.tileX - 1, island.tileY - 1, island.tilesWide + 2, island.tilesHigh + 2);
  }
  container.addChild(shallow);

  const land = new Container({ label: 'islands' });
  for (const island of arena.islands) addIsland(land, island, textures);
  // All tiles share one atlas source, so these ~300 sprites render in a single batch.
  container.addChild(land);

  return {
    container,
    update(time: number) {
      water.tilePosition.set(Math.sin(time * 0.25) * 10, time * 7);
      shimmer.tilePosition.set(-time * 5, Math.cos(time * 0.2) * 12);
    },
  };
}
