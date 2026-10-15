import { ImageSource, Rectangle, Texture } from 'pixi.js';
import { ExternalStore, shallowEqual } from '../../shared/externalStore';
import { TILE_SIZE } from '../core/arena';
import type { DecorationKind } from '../core/arena';
import type { GameTextures, HealthBarTextures, NineSliceTiles, ShipStageTextures } from './GameTextures';
import { SHIP_COLORS } from './GameTextures';
import type { AtlasManifest } from './manifest';
import { pickManifest } from './manifest';

export type AssetLoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface AssetLoadState {
  status: AssetLoadStatus;
  /** 0..1 */
  progress: number;
  error: string | null;
}

export class AssetLoadError extends Error {
  readonly url: string;

  constructor(url: string, reason: string) {
    super(`Could not load ${url.split('/').pop() ?? url}: ${reason}`);
    this.name = 'AssetLoadError';
    this.url = url;
  }
}

type Frames = Map<string, Rectangle>;

interface UiAtlasFrame {
  frame: { x: number; y: number; w: number; h: number };
  ui?: { layout?: { fill_rect?: { x: number; y: number; w: number; h: number } } };
}

/**
 * Loads and decodes the gameplay atlases exactly once and shares the resulting
 * textures between matches. A failed load clears the cache so the next
 * attempt retries from the network instead of reusing a rejected promise.
 */
class AssetLoader {
  readonly state = new ExternalStore<AssetLoadState>({ status: 'idle', progress: 0, error: null }, shallowEqual);
  private pending: Promise<GameTextures> | null = null;
  private textures: GameTextures | null = null;

  load(): Promise<GameTextures> {
    if (this.textures) return Promise.resolve(this.textures);
    this.pending ??= this.loadAll(pickManifest(window.devicePixelRatio || 1))
      .then((textures) => {
        this.textures = textures;
        this.state.set({ status: 'ready', progress: 1, error: null });
        return textures;
      })
      .catch((error: unknown) => {
        this.pending = null;
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.state.set({ status: 'error', progress: this.state.getSnapshot().progress, error: message });
        throw error;
      });
    return this.pending;
  }

  private async loadAll(manifest: AtlasManifest): Promise<GameTextures> {
    this.state.set({ status: 'loading', progress: 0, error: null });
    const urls = [
      manifest.shipsImage,
      manifest.shipsAtlas,
      manifest.tilesImage,
      manifest.uiImage,
      manifest.uiAtlas,
    ];
    const fractions = urls.map(() => 0);
    const report = (index: number, fraction: number) => {
      fractions[index] = fraction;
      const total = fractions.reduce((sum, f) => sum + f, 0) / urls.length;
      // Keep the last 5% for GPU-side texture creation.
      this.state.set({ status: 'loading', progress: Math.min(0.95, total * 0.95), error: null });
    };

    const [shipsBlob, shipsXml, tilesBlob, uiBlob, uiJson] = await Promise.all(
      urls.map((url, index) => fetchWithProgress(url, (f) => report(index, f))),
    );
    if (!shipsBlob || !shipsXml || !tilesBlob || !uiBlob || !uiJson) throw new Error('Incomplete asset download');

    const [shipsBitmap, tilesBitmap, uiBitmap] = await Promise.all([
      decodeImage(shipsBlob, manifest.shipsImage),
      decodeImage(tilesBlob, manifest.tilesImage),
      decodeImage(uiBlob, manifest.uiImage),
    ]);
    const res = manifest.resolution;
    const shipFrames = parseStarlingXml(await shipsXml.text(), res, manifest.shipsAtlas);
    const uiFrames = parseUiAtlas(await uiJson.text(), res, manifest.uiAtlas);

    const shipsSource = new ImageSource({ resource: shipsBitmap, resolution: res, alphaMode: 'premultiply-alpha-on-upload' });
    const tilesSource = new ImageSource({ resource: tilesBitmap, resolution: res, alphaMode: 'premultiply-alpha-on-upload' });
    const uiSource = new ImageSource({ resource: uiBitmap, resolution: res, alphaMode: 'premultiply-alpha-on-upload' });

    const ship = (name: string) => frameTexture(shipsSource, shipFrames, name, manifest.shipsAtlas);
    const tile = (col: number, row: number) =>
      new Texture({ source: tilesSource, frame: new Rectangle(col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE) });
    const nineSlice = (cols: [number, number, number], rows: [number, number, number]): NineSliceTiles => [
      [tile(cols[0], rows[0]), tile(cols[1], rows[0]), tile(cols[2], rows[0])],
      [tile(cols[0], rows[1]), tile(cols[1], rows[1]), tile(cols[2], rows[1])],
      [tile(cols[0], rows[2]), tile(cols[1], rows[2]), tile(cols[2], rows[2])],
    ];

    const ships = Object.fromEntries(
      SHIP_COLORS.map((color, index) => {
        const stages = [0, 1, 2, 3].map((stage) => ship(`ship_${index + 1 + stage * 6}`)) as unknown as ShipStageTextures;
        return [color, stages];
      }),
    ) as GameTextures['ships'];

    const decorations: Record<DecorationKind, Texture> = {
      rock: tile(0, 3),
      rockLarge: tile(1, 3),
      rockSmall: tile(2, 3),
      mossyRock: tile(0, 4),
      mossyRockLarge: tile(1, 4),
      plant: tile(5, 4),
      palm: tile(6, 4),
      fern: tile(7, 4),
      sprouts: tile(7, 5),
      tower: tile(13, 0),
    };

    const textures: GameTextures = {
      ships,
      cannonBall: ship('cannon_ball'),
      explosions: [ship('explosion_3'), ship('explosion_2'), ship('explosion_1')],
      fires: [ship('fire_1'), ship('fire_2')],
      wood: [ship('wood_1'), ship('wood_2'), ship('wood_3'), ship('wood_4')],
      water: await createStandaloneTile(tilesBitmap, 8, 4, res),
      sandIsland: nineSlice([0, 1, 2], [0, 1, 2]),
      grassIsland: nineSlice([5, 6, 8], [0, 1, 3]),
      shallowWater: nineSlice([9, 10, 11], [0, 1, 2]),
      decorations,
      healthBar: createHealthBar(uiSource, uiFrames, manifest.uiAtlas),
    };
    return textures;
  }
}

async function fetchWithProgress(url: string, onProgress: (fraction: number) => void): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new AssetLoadError(url, 'network unavailable');
  }
  if (!response.ok) throw new AssetLoadError(url, `HTTP ${response.status}`);
  const total = Number(response.headers.get('content-length')) || 0;
  const type = response.headers.get('content-type') ?? '';
  if (!response.body || total === 0) {
    const blob = await response.blob();
    onProgress(1);
    return blob;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await reader.read();
    } catch {
      throw new AssetLoadError(url, 'download interrupted');
    }
    if (chunk.done) break;
    chunks.push(chunk.value);
    received += chunk.value.byteLength;
    onProgress(Math.min(1, received / total));
  }
  onProgress(1);
  return new Blob(chunks as BlobPart[], { type });
}

async function decodeImage(blob: Blob, url: string): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob);
  } catch {
    throw new AssetLoadError(url, 'invalid image data');
  }
}

function parseStarlingXml(xml: string, resolution: number, url: string): Frames {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const nodes = doc.getElementsByTagName('SubTexture');
  if (doc.getElementsByTagName('parsererror').length > 0 || nodes.length === 0) {
    throw new AssetLoadError(url, 'invalid atlas');
  }
  const frames: Frames = new Map();
  for (const node of Array.from(nodes)) {
    const name = (node.getAttribute('name') ?? '').replace(/\.png$/, '');
    const n = (attr: string) => Number(node.getAttribute(attr) ?? 0) / resolution;
    frames.set(name, new Rectangle(n('x'), n('y'), n('width'), n('height')));
  }
  return frames;
}

function parseUiAtlas(json: string, resolution: number, url: string): Map<string, UiAtlasFrame> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new AssetLoadError(url, 'invalid atlas');
  }
  const frames = (parsed as { frames?: Record<string, UiAtlasFrame> } | null)?.frames;
  if (!frames) throw new AssetLoadError(url, 'invalid atlas');
  const result = new Map<string, UiAtlasFrame>();
  for (const [name, data] of Object.entries(frames)) {
    const f = data.frame;
    result.set(name, {
      frame: { x: f.x / resolution, y: f.y / resolution, w: f.w / resolution, h: f.h / resolution },
      ...(data.ui ? { ui: data.ui } : {}),
    });
  }
  return result;
}

function frameTexture(source: ImageSource, frames: Frames, name: string, url: string): Texture {
  const frame = frames.get(name);
  if (!frame) throw new AssetLoadError(url, `missing frame ${name}`);
  return new Texture({ source, frame, label: name });
}

function createHealthBar(source: ImageSource, frames: Map<string, UiAtlasFrame>, url: string): HealthBarTextures {
  const get = (name: string) => {
    const data = frames.get(name);
    if (!data) throw new AssetLoadError(url, `missing frame ${name}`);
    const { x, y, w, h } = data.frame;
    return { texture: new Texture({ source, frame: new Rectangle(x, y, w, h), label: name }), data };
  };
  const frame = get('enemy_health_frame');
  const green = get('enemy_health_fill_green');
  const red = get('enemy_health_fill_red');
  // Layout metadata is expressed in logical (1x) units in both atlases.
  const fillRect = green.data.ui?.layout?.fill_rect ?? { x: 24, y: 12, w: 112, h: 15 };
  return { frame: frame.texture, fillGreen: green.texture, fillRed: red.texture, fillRect };
}

/** Repeating textures need their own source; atlas sub-frames would bleed neighbours. */
async function createStandaloneTile(bitmap: ImageBitmap, col: number, row: number, resolution: number): Promise<Texture> {
  const size = TILE_SIZE * resolution;
  const cropped = await createImageBitmap(bitmap, col * size, row * size, size, size);
  const source = new ImageSource({
    resource: cropped,
    resolution,
    alphaMode: 'premultiply-alpha-on-upload',
    addressMode: 'repeat',
  });
  return new Texture({ source, label: 'water' });
}

export const assetLoader = new AssetLoader();
