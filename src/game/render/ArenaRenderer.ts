import { Container, Sprite } from 'pixi.js';
import type { GameTextures, ShipColor } from '../assets/GameTextures';
import type { GameConfig } from '../config';
import type { GameEvent, Ship, ShipKind } from '../core/types';
import type { World } from '../core/World';
import { buildScenery, type Scenery } from './buildScenery';
import { Effects } from './Effects';
import type { PixiHost } from './pixiHost';
import { ShipView } from './ShipView';

const SHIP_COLORS: Record<ShipKind, ShipColor> = { player: 'red', chaser: 'black', shooter: 'yellow' };
const WAKE_SPACING = 9;

export interface RenderStats {
  ships: number;
  projectiles: number;
  particles: number;
  displayObjects: number;
}

/**
 * Projects a World onto a PixiJS scene graph. It only reads simulation state
 * and reacts to simulation events; it never changes gameplay.
 */
export class ArenaRenderer {
  readonly root = new Container({ label: 'arena' });
  private readonly host: PixiHost;
  private readonly world: World;
  private readonly textures: GameTextures;
  private readonly config: GameConfig;
  private readonly scenery: Scenery;
  private readonly effects: Effects;
  private readonly shipLayer = new Container({ label: 'ships' });
  private readonly projectileLayer = new Container({ label: 'projectiles' });
  private readonly barLayer = new Container({ label: 'bars' });
  private readonly ships = new Map<number, ShipView>();
  private readonly projectileSprites: Sprite[] = [];
  private basePosition = { x: 0, y: 0 };
  private time = 0;

  constructor(host: PixiHost, world: World, textures: GameTextures, seed: number) {
    this.host = host;
    this.world = world;
    this.textures = textures;
    this.config = world.config;
    this.scenery = buildScenery(world.arena, textures);
    this.effects = new Effects(textures, host.particleTexture, seed);
    this.root.addChild(
      this.scenery.container,
      this.effects.below,
      this.shipLayer,
      this.projectileLayer,
      this.effects.above,
      this.barLayer,
    );
    host.app.stage.addChild(this.root);
    this.sync(0);
  }

  /** Fits the fixed-size arena into the canvas while keeping its aspect ratio. */
  layout(viewWidth: number, viewHeight: number): void {
    const scale = Math.min(viewWidth / this.world.arena.width, viewHeight / this.world.arena.height);
    this.root.scale.set(scale);
    this.root.position.set(
      (viewWidth - this.world.arena.width * scale) / 2,
      (viewHeight - this.world.arena.height * scale) / 2,
    );
    this.basePosition = { x: this.root.position.x, y: this.root.position.y };
  }

  handleEvents(events: readonly GameEvent[]): void {
    const fx = this.effects;
    for (const event of events) {
      switch (event.type) {
        case 'shot': {
          const weapon =
            event.team === 'enemy'
              ? this.config.shooter.cannon
              : event.slot === 'front'
                ? this.config.player.frontCannon
                : this.config.player.broadside;
          fx.muzzle(event.x, event.y, event.angle, event.count, weapon.spacingUnits, event.slot === 'front' ? 'front' : 'side');
          break;
        }
        case 'projectileSplash':
          fx.splash(event.x, event.y, event.surface);
          break;
        case 'shipHit':
          this.ships.get(event.targetId)?.flashHit();
          fx.hit(event.x, event.y);
          if (event.targetKind === 'player') fx.shake(4);
          break;
        case 'ram':
          fx.explosion(event.x, event.y, 0.9);
          fx.shake(9);
          break;
        case 'shipDestroyed': {
          const view = this.ships.get(event.id);
          const scale = view?.spriteScale ?? 0.7;
          fx.explosion(event.x, event.y, event.kind === 'player' ? 1.3 : 1);
          fx.wreck(this.textures.ships[SHIP_COLORS[event.kind]][3], event.x, event.y, event.angle - Math.PI / 2, scale);
          this.removeShip(event.id);
          if (event.kind === 'player') fx.shake(12);
          break;
        }
        default:
          break;
      }
    }
  }

  /** Advances visual-only animation by `dt` seconds and mirrors the world. */
  update(dt: number): void {
    this.time += dt;
    this.effects.update(dt);
    this.sync(dt);
    const shake = this.effects.shakeOffset();
    this.root.position.set(this.basePosition.x + shake.x * this.root.scale.x, this.basePosition.y + shake.y * this.root.scale.y);
  }

  stats(): RenderStats {
    let displayObjects = 0;
    const count = (node: Container) => {
      displayObjects += 1;
      node.children.forEach(count);
    };
    count(this.root);
    return {
      ships: this.ships.size,
      projectiles: this.world.projectiles.length,
      particles: this.effects.activeCount,
      displayObjects,
    };
  }

  private sync(dt: number): void {
    this.scenery.update(this.time);
    const world = this.world;
    if (world.player.alive) this.syncShip(world.player, dt);
    for (const enemy of world.enemies) {
      if (enemy.alive) this.syncShip(enemy, dt);
    }
    if (this.ships.size > world.enemies.length + 1) this.pruneShips();
    this.syncProjectiles();
  }

  /** Safety net: drops views whose ship left the world without an event. */
  private pruneShips(): void {
    const alive = new Set<number>(this.world.enemies.filter((e) => e.alive).map((e) => e.id));
    if (this.world.player.alive) alive.add(this.world.player.id);
    for (const id of [...this.ships.keys()]) {
      if (!alive.has(id)) this.removeShip(id);
    }
  }

  private syncShip(ship: Ship, dt: number): void {
    let view = this.ships.get(ship.id);
    if (!view) {
      const cfg = ship.kind === 'player' ? this.config.player : ship.kind === 'chaser' ? this.config.chaser : this.config.shooter;
      view = new ShipView(this.textures, SHIP_COLORS[ship.kind], cfg.spriteScale, ship.kind === 'player', this.config.damageStages, ship);
      this.ships.set(ship.id, view);
      this.shipLayer.addChild(view.body);
      this.barLayer.addChild(view.bar.container);
    }
    const { travelled, damageStage } = view.sync(ship, dt, this.time);
    if (dt <= 0) return;

    const puffs = view.consumeWake(travelled, WAKE_SPACING);
    const sternX = ship.x - Math.cos(ship.angle) * ship.radius * 1.3;
    const sternY = ship.y - Math.sin(ship.angle) * ship.radius * 1.3;
    for (let i = 0; i < Math.min(puffs, 3); i++) this.effects.wake(sternX, sternY, ship.angle);
    if (damageStage >= 1 && view.consumeSmoke(dt, damageStage >= 2 ? 0.09 : 0.25)) {
      this.effects.smoke(ship.x, ship.y, damageStage >= 2);
    }
  }

  private syncProjectiles(): void {
    const projectiles = this.world.projectiles;
    while (this.projectileSprites.length < projectiles.length) {
      const sprite = new Sprite(this.textures.cannonBall);
      sprite.anchor.set(0.5);
      this.projectileLayer.addChild(sprite);
      this.projectileSprites.push(sprite);
    }
    for (let i = 0; i < this.projectileSprites.length; i++) {
      const sprite = this.projectileSprites[i];
      if (!sprite) continue;
      const projectile = projectiles[i];
      if (!projectile) {
        sprite.visible = false;
        continue;
      }
      sprite.visible = true;
      sprite.position.set(projectile.x, projectile.y);
      sprite.tint = projectile.team === 'enemy' ? 0xffd6c2 : 0xffffff;
    }
  }

  private removeShip(id: number): void {
    const view = this.ships.get(id);
    if (!view) return;
    this.ships.delete(id);
    view.destroy();
  }

  destroy(): void {
    this.ships.forEach((view) => {
      view.destroy();
    });
    this.ships.clear();
    this.projectileSprites.length = 0;
    this.effects.destroy();
    this.host.app.stage.removeChild(this.root);
    // Textures belong to the shared asset cache and are reused by the next match.
    this.root.destroy({ children: true, texture: false, textureSource: false });
  }
}
