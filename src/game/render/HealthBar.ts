import { Container, Sprite, Texture } from 'pixi.js';
import type { HealthBarTextures } from '../assets/GameTextures';

const BAR_SCALE = 0.42;
const LOW_HEALTH_RATIO = 0.33;

/**
 * Floating health indicator built from the UI atlas frame and fill sprites.
 * The fill is clipped by shrinking a private texture frame, which keeps the
 * rounded art intact and costs nothing unless the value changes.
 */
export class HealthBar {
  readonly container = new Container({ label: 'health-bar' });
  private readonly fill: Sprite;
  private readonly fillTexture: Texture;
  private readonly textures: HealthBarTextures;
  private readonly friendly: boolean;
  private ratio = -1;

  constructor(textures: HealthBarTextures, friendly: boolean) {
    this.textures = textures;
    this.friendly = friendly;
    const base = friendly ? textures.fillGreen : textures.fillRed;
    // `orig` shares the frame rectangle, so the sprite size follows the clip.
    this.fillTexture = new Texture({ source: base.source, frame: base.frame.clone(), dynamic: true });
    this.fill = new Sprite(this.fillTexture);
    this.container.addChild(new Sprite(textures.frame), this.fill);
    this.container.scale.set(BAR_SCALE);
    this.container.pivot.set(textures.frame.frame.width / 2, textures.frame.frame.height / 2);
  }

  setRatio(ratio: number): void {
    const clamped = Math.max(0, Math.min(1, ratio));
    if (Math.abs(clamped - this.ratio) < 0.001) return;
    this.ratio = clamped;

    const useRed = !this.friendly || clamped <= LOW_HEALTH_RATIO;
    const base = useRed ? this.textures.fillRed : this.textures.fillGreen;
    const { x, w } = this.textures.fillRect;
    const visibleWidth = clamped <= 0 ? 0 : x + w * clamped;

    const frame = this.fillTexture.frame;
    frame.x = base.frame.x;
    frame.y = base.frame.y;
    frame.height = base.frame.height;
    frame.width = Math.max(0.01, visibleWidth);
    this.fill.visible = visibleWidth > 0;
    // Dynamic textures notify the sprites using them, which refresh their bounds.
    this.fillTexture.update();
  }

  destroy(): void {
    this.container.destroy({ children: true });
    this.fillTexture.destroy(false);
  }
}
