import type { LoopHandle, SoundName } from '../audio/AudioEngine';
import { audio } from '../audio/AudioEngine';
import type { GameEvent } from './core/types';
import type { World } from './core/World';

const COMBAT_SOUNDS: readonly SoundName[] = [
  'cannon_fire_1',
  'cannon_fire_2',
  'cannon_fire_3',
  'cannon_broadside',
  'cannonball_water_hit_1',
  'cannonball_water_hit_2',
  'ship_wood_hit_1',
  'ship_wood_hit_2',
  'ship_explosion_1',
  'ship_explosion_2',
  'ship_collision',
  'ship_sinking',
  'score_point',
  'health_low',
  'time_warning',
  'game_complete',
  'game_over',
  'game_pause',
  'game_resume',
];

function variant<T>(options: readonly T[]): T {
  return options[Math.floor(Math.random() * options.length)] as T;
}

/** Maps simulation events to sound effects; cosmetic only. */
export class GameAudio {
  private ambience: LoopHandle | null = null;
  private sailing: LoopHandle | null = null;
  private lowHealthPlayed = false;
  private warnedAt = new Set<number>();

  start(): void {
    audio.preload(COMBAT_SOUNDS);
    audio.play('game_start', { volume: 0.7 });
    this.ambience = audio.loop('ocean_ambience_loop', 0.25);
    this.sailing = audio.loop('ship_sailing_loop', 0);
  }

  handle(events: readonly GameEvent[], world: World): void {
    for (const event of events) {
      switch (event.type) {
        case 'shot':
          if (event.team === 'enemy') audio.play(variant(['cannon_fire_1', 'cannon_fire_2'] as const), { volume: 0.35, rate: 1.1 });
          else if (event.slot === 'front') audio.play(variant(['cannon_fire_1', 'cannon_fire_2', 'cannon_fire_3'] as const), { volume: 0.6 });
          else audio.play('cannon_broadside', { volume: 0.7 });
          break;
        case 'projectileSplash':
          audio.play(variant(['cannonball_water_hit_1', 'cannonball_water_hit_2'] as const), { volume: 0.25 });
          break;
        case 'shipHit':
          audio.play(variant(['ship_wood_hit_1', 'ship_wood_hit_2'] as const), { volume: event.targetKind === 'player' ? 0.8 : 0.5 });
          break;
        case 'shipDestroyed':
          if (event.kind === 'player') audio.play('ship_sinking', { volume: 0.9 });
          else audio.play(variant(['ship_explosion_1', 'ship_explosion_2'] as const), { volume: 0.7 });
          break;
        case 'ram':
        case 'shipCollision':
          audio.play('ship_collision', { volume: 0.7 });
          break;
        case 'scoreChanged':
          audio.play('score_point', { volume: 0.5 });
          break;
        case 'matchEnded':
          audio.play(event.reason === 'time_up' ? 'game_complete' : 'game_over', { volume: 0.8 });
          this.sailing?.setVolume(0);
          break;
        default:
          break;
      }
    }

    const player = world.player;
    if (!this.lowHealthPlayed && player.alive && player.health / player.maxHealth <= 0.33) {
      this.lowHealthPlayed = true;
      audio.play('health_low', { volume: 0.7 });
    }
    const secondsLeft = Math.ceil(world.timeLeft);
    if ((secondsLeft === 10 || secondsLeft === 30) && !this.warnedAt.has(secondsLeft) && world.status === 'running') {
      this.warnedAt.add(secondsLeft);
      audio.play('time_warning', { volume: 0.7 });
    }
    this.sailing?.setVolume(world.status === 'running' ? (player.speed / world.config.player.maxSpeed) * 0.35 : 0);
  }

  pause(): void {
    audio.play('game_pause', { volume: 0.6 });
    this.ambience?.setVolume(0.08);
    this.sailing?.setVolume(0);
  }

  resume(): void {
    audio.play('game_resume', { volume: 0.6 });
    this.ambience?.setVolume(0.25);
  }

  stop(): void {
    this.ambience?.stop();
    this.sailing?.stop();
    this.ambience = null;
    this.sailing = null;
  }
}
