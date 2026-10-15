import { Application, Graphics, type Texture } from 'pixi.js';

export interface PixiHost {
  app: Application;
  /** Soft white disc used by every particle effect. */
  particleTexture: Texture;
}

let hostPromise: Promise<PixiHost> | null = null;

/**
 * One PixiJS Application (and one WebGL context) lives for the whole page.
 * Matches attach their scene to it and remove it on exit; recreating the
 * renderer per match would leak GPU contexts after a few restarts and force
 * texture re-uploads. The ticker only runs while a match is mounted.
 */
export function acquirePixiHost(): Promise<PixiHost> {
  hostPromise ??= createHost().catch((error: unknown) => {
    hostPromise = null;
    throw error;
  });
  return hostPromise;
}

async function createHost(): Promise<PixiHost> {
  const app = new Application();
  await app.init({
    preference: 'webgl',
    width: 1536,
    height: 896,
    backgroundColor: 0x2a8fc4,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoStart: false,
    sharedTicker: false,
    preserveDrawingBuffer: false,
  });
  app.ticker.stop();
  app.canvas.classList.add('arena-canvas');
  app.canvas.setAttribute('aria-hidden', 'true');

  const disc = new Graphics();
  for (let i = 8; i >= 1; i--) disc.circle(16, 16, i * 2).fill({ color: 0xffffff, alpha: 0.16 });
  const particleTexture = app.renderer.generateTexture({ target: disc, resolution: 2 });
  disc.destroy();

  return { app, particleTexture };
}
