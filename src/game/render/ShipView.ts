import { Container, Sprite } from 'pixi.js';
import type { GameTextures, ShipColor, ShipStageTextures } from '../assets/GameTextures';
import type { Ship } from '../core/types';
import { HealthBar } from './HealthBar';

const HIT_FLASH_SEC = 0.12;
/** Ship art points its bow towards +Y; simulation heading 0 points towards +X. */
const SPRITE_ROTATION_OFFSET = -Math.PI / 2;

export class ShipView {
  readonly body = new Container({ label: 'ship' });
  readonly bar: HealthBar;
  private readonly hull: Sprite;
  private readonly fire: Sprite;
  private readonly stages: ShipStageTextures;
  private readonly fireFrames: GameTextures['fires'];
  private readonly scale: number;
  private readonly barOffset: number;
  private readonly thresholds: readonly [number, number];
  private stage = -1;
  private flash = 0;
  private wakeDistance = 0;
  private smokeTimer = 0;
  private lastX: number;
  private lastY: number;

  constructor(
    textures: GameTextures,
    color: ShipColor,
    scale: number,
    friendly: boolean,
    thresholds: readonly [number, number],
    ship: Ship,
  ) {
    this.stages = textures.ships[color];
    this.fireFrames = textures.fires;
    this.scale = scale;
    this.thresholds = thresholds;
    this.hull = new Sprite(this.stages[0]);
    this.hull.anchor.set(0.5);
    this.fire = new Sprite(textures.fires[0]);
    this.fire.anchor.set(0.5, 0.9);
    this.fire.visible = false;
    this.body.addChild(this.hull, this.fire);
    this.body.scale.set(scale);
    this.bar = new HealthBar(textures.healthBar, friendly);
    this.barOffset = (this.stages[0].frame.height / 2) * scale + 10;
    this.lastX = ship.x;
    this.lastY = ship.y;
    this.sync(ship, 0, 0);
  }

  get spriteScale(): number {
    return this.scale;
  }

  flashHit(): void {
    this.flash = HIT_FLASH_SEC;
  }

  /**
   * Mirrors the simulation state. Returns how far the ship travelled this
   * frame and its stern position so the renderer can spawn wake foam.
   */
  sync(ship: Ship, dt: number, time: number): { travelled: number; damageStage: number } {
    this.body.position.set(ship.x, ship.y);
    this.body.rotation = ship.angle + SPRITE_ROTATION_OFFSET;

    const ratio = ship.health / ship.maxHealth;
    const stage = ratio > this.thresholds[0] ? 0 : ratio > this.thresholds[1] ? 1 : 2;
    if (stage !== this.stage) {
      this.stage = stage;
      this.hull.texture = this.stages[stage];
      this.fire.visible = stage >= 2;
    }
    if (this.fire.visible) {
      const frame = Math.floor(time * 10) % 2 === 0 ? this.fireFrames[0] : this.fireFrames[1];
      if (this.fire.texture !== frame) this.fire.texture = frame;
      this.fire.position.set(6, -10);
      this.fire.scale.set(1 + Math.sin(time * 18) * 0.12);
    }

    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt);
      this.hull.tint = this.flash > 0 ? 0xff9a8a : 0xffffff;
    }

    this.bar.container.position.set(ship.x, ship.y - this.barOffset);
    this.bar.setRatio(ratio);

    const dx = ship.x - this.lastX;
    const dy = ship.y - this.lastY;
    this.lastX = ship.x;
    this.lastY = ship.y;
    return { travelled: Math.sqrt(dx * dx + dy * dy), damageStage: stage };
  }

  /** Accumulates travelled distance and reports how many wake puffs to emit. */
  consumeWake(travelled: number, spacing: number): number {
    this.wakeDistance += travelled;
    const puffs = Math.floor(this.wakeDistance / spacing);
    this.wakeDistance -= puffs * spacing;
    return puffs;
  }

  /** Damaged ships trail smoke at a fixed simulated cadence. */
  consumeSmoke(dt: number, interval: number): boolean {
    this.smokeTimer += dt;
    if (this.smokeTimer < interval) return false;
    this.smokeTimer = 0;
    return true;
  }

  destroy(): void {
    this.body.destroy({ children: true });
    this.bar.destroy();
  }
}
