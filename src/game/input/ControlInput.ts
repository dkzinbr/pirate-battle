import type { ControlState } from '../core/types';
import { IDLE_CONTROLS } from '../core/types';

export type ControlName = keyof ControlState;

export const CONTROL_NAMES: readonly ControlName[] = [
  'forward',
  'turnLeft',
  'turnRight',
  'fireFront',
  'fireLeft',
  'fireRight',
];

/** Physical keys (KeyboardEvent.code) bound to each logical control. */
export const KEY_BINDINGS: Readonly<Record<ControlName, readonly string[]>> = {
  forward: ['KeyW', 'ArrowUp'],
  turnLeft: ['KeyA', 'ArrowLeft'],
  turnRight: ['KeyD', 'ArrowRight'],
  fireFront: ['Space', 'KeyK'],
  fireLeft: ['KeyQ', 'KeyJ'],
  fireRight: ['KeyE', 'KeyL'],
};

export const PAUSE_KEYS: readonly string[] = ['Escape', 'KeyP'];

const CODE_TO_CONTROL = new Map<string, ControlName>(
  CONTROL_NAMES.flatMap((name) => KEY_BINDINGS[name].map((code) => [code, name] as const)),
);

export function controlForKey(code: string): ControlName | undefined {
  return CODE_TO_CONTROL.get(code);
}

/**
 * Aggregates every input device into a single logical ControlState.
 * Each device registers "holds" identified by a source key (a key code or a
 * pointer id), so releasing one key never cancels a touch on the same control.
 */
export class ControlInput {
  private readonly holds = new Map<string, ControlName>();
  private readonly state: ControlState = { ...IDLE_CONTROLS };
  private enabled = true;

  press(source: string, control: ControlName): void {
    if (!this.enabled) return;
    this.holds.set(source, control);
    this.state[control] = true;
  }

  release(source: string): void {
    const control = this.holds.get(source);
    if (!control) return;
    this.holds.delete(source);
    this.state[control] = [...this.holds.values()].includes(control);
  }

  /** Clears all holds; used on pause, blur and match end so nothing carries over. */
  reset(): void {
    this.holds.clear();
    Object.assign(this.state, IDLE_CONTROLS);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.reset();
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  get current(): Readonly<ControlState> {
    return this.state;
  }
}
