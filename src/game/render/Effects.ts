import { Container, Sprite, type Texture } from 'pixi.js';
import type { GameTextures } from '../assets/GameTextures';
import { Rng } from '../core/rng';

type Layer = 'below' | 'above';

interface Particle {
  sprite: Sprite;
  layer: Layer;
  active: boolean;
  age: number;
  life: number;
  vx: number;
  vy: number;
  drag: number;
  spin: number;
  scaleFrom: number;
  scaleTo: number;
  alphaFrom: number;
  alphaTo: number;
  frames: readonly Texture[] | null;
}

interface EmitOptions {
  texture: Texture;
  x: number;
  y: number;
  life: number;
  vx?: number;
  vy?: number;
  drag?: number;
  rotation?: number;
  spin?: number;
  scaleFrom?: number;
  scaleTo?: number;
  alphaFrom?: number;
  alphaTo?: number;
  tint?: number;
  frames?: readonly Texture[];
  /** `below` renders under ships (wakes, wrecks); defaults to `above`. */
  layer?: Layer;
}

const MAX_PARTICLES = 600;

/**
 * Pooled sprite particles for every transient effect (muzzle flashes, smoke,
 * splashes, debris, explosions, sinking wrecks). Sprites are recycled, so a
 * long match allocates no new display objects after warm-up.
 */
export class Effects {
  readonly below = new Container({ label: 'fx-below' });
  readonly above = new Container({ label: 'fx-above' });
  private readonly pool: Particle[] = [];
  private readonly free: Record<Layer, Particle[]> = { below: [], above: [] };
  private readonly textures: GameTextures;
  private readonly disc: Texture;
  private readonly rng: Rng;
  private shakeTime = 0;
  private shakeStrength = 0;

  constructor(textures: GameTextures, particleTexture: Texture, seed: number) {
    this.textures = textures;
    this.disc = particleTexture;
    this.rng = new Rng(seed ^ 0x5bd1e995);
  }

  get activeCount(): number {
    return this.pool.reduce((count, p) => count + (p.active ? 1 : 0), 0);
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.active = false;
        p.sprite.visible = false;
        this.free[p.layer].push(p);
        continue;
      }
      const t = p.age / p.life;
      const damping = Math.max(0, 1 - p.drag * dt);
      p.vx *= damping;
      p.vy *= damping;
      p.sprite.x += p.vx * dt;
      p.sprite.y += p.vy * dt;
      p.sprite.rotation += p.spin * dt;
      p.sprite.scale.set(p.scaleFrom + (p.scaleTo - p.scaleFrom) * t);
      p.sprite.alpha = p.alphaFrom + (p.alphaTo - p.alphaFrom) * t;
      if (p.frames) {
        const frame = p.frames[Math.min(p.frames.length - 1, Math.floor(t * p.frames.length))];
        if (frame && p.sprite.texture !== frame) p.sprite.texture = frame;
      }
    }
    if (this.shakeTime > 0) this.shakeTime = Math.max(0, this.shakeTime - dt);
  }

  /** Current camera shake offset, decaying over time. */
  shakeOffset(): { x: number; y: number } {
    if (this.shakeTime <= 0) return { x: 0, y: 0 };
    const s = this.shakeStrength * (this.shakeTime / 0.35);
    return { x: this.rng.range(-s, s), y: this.rng.range(-s, s) };
  }

  shake(strength: number): void {
    this.shakeStrength = Math.max(strength, this.shakeTime > 0 ? this.shakeStrength : 0);
    this.shakeTime = 0.35;
  }

  // ---------------------------------------------------------------- presets

  wake(x: number, y: number, angle: number): void {
    const side = this.rng.range(-6, 6);
    this.emit({
      texture: this.disc,
      x: x + Math.cos(angle + Math.PI / 2) * side,
      y: y + Math.sin(angle + Math.PI / 2) * side,
      life: 0.9,
      scaleFrom: 0.28,
      scaleTo: 0.75,
      alphaFrom: 0.45,
      alphaTo: 0,
      layer: 'below',
    });
  }

  muzzle(x: number, y: number, angle: number, count: number, spacing: number, slot: 'front' | 'side'): void {
    const forward = slot === 'side' ? angle - Math.PI / 2 : angle;
    for (let i = 0; i < count; i++) {
      const along = (i - (count - 1) / 2) * spacing;
      const mx = x + Math.cos(forward) * along;
      const my = y + Math.sin(forward) * along;
      this.emit({
        texture: this.textures.explosions[0],
        x: mx,
        y: my,
        life: 0.14,
        rotation: this.rng.range(0, Math.PI * 2),
        scaleFrom: 0.32,
        scaleTo: 0.5,
        alphaFrom: 1,
        alphaTo: 0.2,
      });
      for (let s = 0; s < 3; s++) {
        const speed = this.rng.range(25, 60);
        const spread = angle + this.rng.range(-0.5, 0.5);
        this.emit({
          texture: this.disc,
          x: mx,
          y: my,
          life: this.rng.range(0.5, 0.8),
          vx: Math.cos(spread) * speed,
          vy: Math.sin(spread) * speed,
          drag: 2.5,
          scaleFrom: 0.35,
          scaleTo: 1,
          alphaFrom: 0.55,
          alphaTo: 0,
          tint: 0xd9d4cc,
        });
      }
    }
  }

  splash(x: number, y: number, surface: 'water' | 'island'): void {
    const tint = surface === 'water' ? 0xffffff : 0xe8c994;
    this.emit({ texture: this.disc, x, y, life: 0.5, scaleFrom: 0.2, scaleTo: 0.9, alphaFrom: 0.8, alphaTo: 0, tint });
    for (let i = 0; i < 5; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const speed = this.rng.range(30, 70);
      this.emit({
        texture: this.disc,
        x,
        y,
        life: 0.4,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        drag: 4,
        scaleFrom: 0.18,
        scaleTo: 0.05,
        alphaFrom: 0.9,
        alphaTo: 0,
        tint,
      });
    }
  }

  hit(x: number, y: number): void {
    this.emit({
      texture: this.textures.explosions[0],
      x,
      y,
      life: 0.25,
      rotation: this.rng.range(0, Math.PI * 2),
      scaleFrom: 0.45,
      scaleTo: 0.8,
      alphaFrom: 1,
      alphaTo: 0,
    });
    this.debris(x, y, 3, 90);
  }

  explosion(x: number, y: number, size: number): void {
    this.emit({
      texture: this.textures.explosions[0],
      frames: this.textures.explosions,
      x,
      y,
      life: 0.6,
      rotation: this.rng.range(0, Math.PI * 2),
      scaleFrom: 0.6 * size,
      scaleTo: 1.25 * size,
      alphaFrom: 1,
      alphaTo: 0,
    });
    for (let i = 0; i < 6; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const speed = this.rng.range(20, 50);
      this.emit({
        texture: this.disc,
        x,
        y,
        life: this.rng.range(0.9, 1.4),
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        drag: 1.5,
        scaleFrom: 0.6 * size,
        scaleTo: 1.8 * size,
        alphaFrom: 0.5,
        alphaTo: 0,
        tint: 0x5a5148,
      });
    }
    this.debris(x, y, 6, 140);
  }

  wreck(texture: Texture, x: number, y: number, rotation: number, scale: number): void {
    this.emit({
      texture,
      x,
      y,
      life: 2.2,
      rotation,
      spin: this.rng.range(-0.25, 0.25),
      scaleFrom: scale,
      scaleTo: scale * 0.8,
      alphaFrom: 1,
      alphaTo: 0,
      layer: 'below',
    });
  }

  smoke(x: number, y: number, heavy: boolean): void {
    this.emit({
      texture: this.disc,
      x: x + this.rng.range(-6, 6),
      y: y + this.rng.range(-6, 6),
      life: heavy ? 1.1 : 0.8,
      vx: this.rng.range(-10, 10),
      vy: this.rng.range(-18, -6),
      drag: 0.5,
      scaleFrom: 0.3,
      scaleTo: heavy ? 1.1 : 0.7,
      alphaFrom: heavy ? 0.55 : 0.35,
      alphaTo: 0,
      tint: heavy ? 0x3d3833 : 0x8a847c,
    });
  }

  private debris(x: number, y: number, count: number, maxSpeed: number): void {
    for (let i = 0; i < count; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const speed = this.rng.range(maxSpeed * 0.4, maxSpeed);
      const texture = this.textures.wood[this.rng.int(0, this.textures.wood.length)] ?? this.disc;
      this.emit({
        texture,
        x,
        y,
        life: this.rng.range(0.6, 1.1),
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        drag: 3,
        rotation: a,
        spin: this.rng.range(-6, 6),
        scaleFrom: 0.8,
        scaleTo: 0.5,
        alphaFrom: 1,
        alphaTo: 0,
      });
    }
  }

  private emit(options: EmitOptions): void {
    const particle = this.acquire(options.layer ?? 'above');
    if (!particle) return;
    const s = particle.sprite;
    s.texture = options.texture;
    s.position.set(options.x, options.y);
    s.rotation = options.rotation ?? 0;
    s.tint = options.tint ?? 0xffffff;
    s.scale.set(options.scaleFrom ?? 1);
    s.alpha = options.alphaFrom ?? 1;
    s.visible = true;
    particle.active = true;
    particle.age = 0;
    particle.life = options.life;
    particle.vx = options.vx ?? 0;
    particle.vy = options.vy ?? 0;
    particle.drag = options.drag ?? 0;
    particle.spin = options.spin ?? 0;
    particle.scaleFrom = options.scaleFrom ?? 1;
    particle.scaleTo = options.scaleTo ?? particle.scaleFrom;
    particle.alphaFrom = options.alphaFrom ?? 1;
    particle.alphaTo = options.alphaTo ?? particle.alphaFrom;
    particle.frames = options.frames ?? null;
  }

  private acquire(layer: Layer): Particle | null {
    let particle = this.free[layer].pop();
    if (!particle) {
      if (this.pool.length >= MAX_PARTICLES) return null;
      const sprite = new Sprite(this.disc);
      sprite.anchor.set(0.5);
      sprite.visible = false;
      (layer === 'below' ? this.below : this.above).addChild(sprite);
      particle = {
        sprite,
        layer,
        active: false,
        age: 0,
        life: 0,
        vx: 0,
        vy: 0,
        drag: 0,
        spin: 0,
        scaleFrom: 1,
        scaleTo: 1,
        alphaFrom: 1,
        alphaTo: 1,
        frames: null,
      };
      this.pool.push(particle);
    }
    return particle;
  }

  destroy(): void {
    this.pool.length = 0;
    this.free.below.length = 0;
    this.free.above.length = 0;
    this.below.destroy({ children: true });
    this.above.destroy({ children: true });
  }
}
