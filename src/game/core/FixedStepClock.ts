/** Simulation step: 120 Hz keeps fast projectiles from tunnelling and stays cheap. */
export const FIXED_DT = 1 / 120;

/**
 * Converts variable frame times into a whole number of fixed simulation steps
 * (classic accumulator). Frame spikes are clamped so a long hitch cannot make
 * the simulation "jump" or spiral.
 *
 * In manual mode real time is ignored and only `advance()` produces steps;
 * end-to-end tests use it to drive the real simulation deterministically.
 */
export class FixedStepClock {
  private accumulator = 0;
  private manual: boolean;
  private readonly maxFrameSec: number;

  constructor(options: { manual?: boolean; maxFrameSec?: number } = {}) {
    this.manual = options.manual ?? false;
    this.maxFrameSec = options.maxFrameSec ?? 0.1;
  }

  get isManual(): boolean {
    return this.manual;
  }

  setManual(manual: boolean): void {
    this.manual = manual;
    this.accumulator = 0;
  }

  /** Number of fixed steps owed for a real frame of `deltaSec`. */
  consume(deltaSec: number): number {
    if (this.manual) return 0;
    this.accumulator += Math.min(Math.max(deltaSec, 0), this.maxFrameSec);
    const steps = Math.floor(this.accumulator / FIXED_DT);
    this.accumulator -= steps * FIXED_DT;
    return steps;
  }

  /** Number of fixed steps that make up `ms` of simulated time (manual mode). */
  stepsFor(ms: number): number {
    return Math.max(0, Math.round(ms / 1000 / FIXED_DT));
  }

  /** Drops partial time, e.g. when resuming from pause. */
  reset(): void {
    this.accumulator = 0;
  }
}
