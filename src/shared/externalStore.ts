export type Listener = () => void;

/**
 * Minimal observable value compatible with React's useSyncExternalStore.
 * Used to bridge non-React systems (simulation, persistence) into the UI
 * without re-rendering on every animation frame.
 */
export class ExternalStore<T> {
  private value: T;
  private readonly listeners = new Set<Listener>();
  private readonly isEqual: (a: T, b: T) => boolean;

  constructor(initial: T, isEqual: (a: T, b: T) => boolean = Object.is) {
    this.value = initial;
    this.isEqual = isEqual;
  }

  readonly getSnapshot = (): T => this.value;

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  set(next: T): void {
    if (this.isEqual(this.value, next)) return;
    this.value = next;
    this.listeners.forEach((listener) => {
      listener();
    });
  }

  update(updater: (current: T) => T): void {
    this.set(updater(this.value));
  }
}

export function shallowEqual<T extends object>(a: T, b: T): boolean {
  if (a === b) return true;
  const keysA = Object.keys(a) as (keyof T)[];
  if (keysA.length !== Object.keys(b).length) return false;
  return keysA.every((key) => Object.is(a[key], b[key]));
}
