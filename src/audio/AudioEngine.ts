const SOUND_URLS = import.meta.glob<string>('../../assets/sounds/*.wav', {
  query: '?url',
  import: 'default',
  eager: true,
});

export type SoundName =
  | 'cannonball_water_hit_1'
  | 'cannonball_water_hit_2'
  | 'cannon_broadside'
  | 'cannon_fire_1'
  | 'cannon_fire_2'
  | 'cannon_fire_3'
  | 'game_complete'
  | 'game_over'
  | 'game_pause'
  | 'game_resume'
  | 'game_start'
  | 'health_low'
  | 'ocean_ambience_loop'
  | 'score_point'
  | 'ship_collision'
  | 'ship_explosion_1'
  | 'ship_explosion_2'
  | 'ship_sailing_loop'
  | 'ship_sinking'
  | 'ship_wood_hit_1'
  | 'ship_wood_hit_2'
  | 'time_warning'
  | 'ui_back'
  | 'ui_click'
  | 'ui_close'
  | 'ui_hover'
  | 'ui_open';

function urlFor(name: SoundName): string | undefined {
  return SOUND_URLS[`../../assets/sounds/${name}.wav`];
}

export interface LoopHandle {
  setVolume(volume: number): void;
  stop(): void;
}

const MIN_REPEAT_MS = 45;

/**
 * Small Web Audio wrapper. Audio is purely cosmetic: decoding or playback
 * failures are swallowed so they can never block menus or combat.
 * The context is created lazily on the first user gesture (autoplay policy).
 */
class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buffers = new Map<SoundName, AudioBuffer>();
  private readonly loading = new Map<SoundName, Promise<AudioBuffer | null>>();
  private readonly lastPlayed = new Map<SoundName, number>();
  private enabled = true;
  private warned = false;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (this.master) this.master.gain.value = enabled ? 0.8 : 0;
  }

  /** Must be called from a user gesture handler at least once. */
  unlock(): void {
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = this.enabled ? 0.8 : 0;
        this.master.connect(this.context.destination);
      }
      if (this.context.state === 'suspended') void this.context.resume().catch(() => undefined);
    } catch {
      this.context = null;
    }
  }

  preload(names: readonly SoundName[]): void {
    names.forEach((name) => void this.load(name));
  }

  play(name: SoundName, options: { volume?: number; rate?: number } = {}): void {
    if (!this.enabled || !this.context || !this.master || this.context.state !== 'running') return;
    const now = performance.now();
    if (now - (this.lastPlayed.get(name) ?? -Infinity) < MIN_REPEAT_MS) return;
    const buffer = this.buffers.get(name);
    if (!buffer) {
      void this.load(name);
      return;
    }
    this.lastPlayed.set(name, now);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = options.rate ?? 1;
    const gain = this.context.createGain();
    gain.gain.value = options.volume ?? 1;
    source.connect(gain).connect(this.master);
    source.start();
  }

  loop(name: SoundName, volume: number): LoopHandle {
    let source: AudioBufferSourceNode | null = null;
    let gain: GainNode | null = null;
    let stopped = false;
    let currentVolume = volume;
    void this.load(name).then((buffer) => {
      if (stopped || !buffer || !this.context || !this.master) return;
      source = this.context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      gain = this.context.createGain();
      gain.gain.value = currentVolume;
      source.connect(gain).connect(this.master);
      source.start();
    });
    return {
      setVolume: (next) => {
        currentVolume = next;
        if (gain && this.context) gain.gain.setTargetAtTime(next, this.context.currentTime, 0.1);
      },
      stop: () => {
        stopped = true;
        try {
          source?.stop();
        } catch {
          // Already stopped.
        }
        source?.disconnect();
        gain?.disconnect();
      },
    };
  }

  private load(name: SoundName): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(name);
    if (cached) return Promise.resolve(cached);
    const pending = this.loading.get(name);
    if (pending) return pending;
    const url = urlFor(name);
    const context = this.context;
    if (!url || !context) return Promise.resolve(null);
    const promise = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then((data) => context.decodeAudioData(data))
      .then((buffer) => {
        this.buffers.set(name, buffer);
        return buffer;
      })
      .catch((error: unknown) => {
        this.loading.delete(name);
        if (!this.warned) {
          this.warned = true;
          console.warn('[audio] sound effects unavailable:', error);
        }
        return null;
      });
    this.loading.set(name, promise);
    return promise;
  }
}

export const audio = new AudioEngine();
