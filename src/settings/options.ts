import { SESSION_DURATION_LIMITS, SPAWN_INTERVAL_LIMITS, type MatchSettings } from '../game/config';
import { ExternalStore, shallowEqual } from '../shared/externalStore';
import { isRecord, readJson, storageKeys, writeJson } from '../shared/storage';

export interface PlayerOptions extends MatchSettings {
  captainName: string;
  soundEnabled: boolean;
}

export type OptionsErrors = Partial<Record<keyof PlayerOptions, string>>;

export const CAPTAIN_NAME_LIMITS = { min: 2, max: 18 } as const;

export const DEFAULT_OPTIONS: PlayerOptions = {
  sessionDurationSec: SESSION_DURATION_LIMITS.default,
  spawnIntervalSec: SPAWN_INTERVAL_LIMITS.default,
  captainName: 'Captain Jack',
  soundEnabled: true,
};

function isOnStep(value: number, min: number, step: number): boolean {
  const steps = (value - min) / step;
  return Math.abs(steps - Math.round(steps)) < 1e-6;
}

export function validateOptions(options: PlayerOptions): OptionsErrors {
  const errors: OptionsErrors = {};
  const d = SESSION_DURATION_LIMITS;
  const s = SPAWN_INTERVAL_LIMITS;

  if (!Number.isFinite(options.sessionDurationSec)) errors.sessionDurationSec = 'Enter a number of seconds.';
  else if (options.sessionDurationSec < d.min || options.sessionDurationSec > d.max)
    errors.sessionDurationSec = `Choose between ${d.min} and ${d.max} seconds.`;
  else if (!isOnStep(options.sessionDurationSec, d.min, d.step))
    errors.sessionDurationSec = `Use steps of ${d.step} seconds.`;

  if (!Number.isFinite(options.spawnIntervalSec)) errors.spawnIntervalSec = 'Enter a number of seconds.';
  else if (options.spawnIntervalSec <= 0) errors.spawnIntervalSec = 'The spawn interval must be positive.';
  else if (options.spawnIntervalSec < s.min || options.spawnIntervalSec > s.max)
    errors.spawnIntervalSec = `Choose between ${s.min} and ${s.max} seconds.`;
  else if (!isOnStep(options.spawnIntervalSec, s.min, s.step))
    errors.spawnIntervalSec = `Use steps of ${s.step} seconds.`;

  const name = options.captainName.trim();
  if (name.length < CAPTAIN_NAME_LIMITS.min || name.length > CAPTAIN_NAME_LIMITS.max)
    errors.captainName = `Use ${CAPTAIN_NAME_LIMITS.min} to ${CAPTAIN_NAME_LIMITS.max} characters.`;
  else if (!/^[\p{L}\p{N} .'_-]+$/u.test(name)) errors.captainName = 'Use letters, numbers, spaces and . \' _ - only.';

  return errors;
}

function parseOptions(raw: unknown): PlayerOptions | null {
  if (!isRecord(raw)) return null;
  const candidate: PlayerOptions = {
    sessionDurationSec: typeof raw.sessionDurationSec === 'number' ? raw.sessionDurationSec : DEFAULT_OPTIONS.sessionDurationSec,
    spawnIntervalSec: typeof raw.spawnIntervalSec === 'number' ? raw.spawnIntervalSec : DEFAULT_OPTIONS.spawnIntervalSec,
    captainName: typeof raw.captainName === 'string' ? raw.captainName : DEFAULT_OPTIONS.captainName,
    soundEnabled: typeof raw.soundEnabled === 'boolean' ? raw.soundEnabled : DEFAULT_OPTIONS.soundEnabled,
  };
  const errors = validateOptions(candidate);
  // Repair individual invalid fields instead of discarding everything.
  return {
    sessionDurationSec: errors.sessionDurationSec ? DEFAULT_OPTIONS.sessionDurationSec : candidate.sessionDurationSec,
    spawnIntervalSec: errors.spawnIntervalSec ? DEFAULT_OPTIONS.spawnIntervalSec : candidate.spawnIntervalSec,
    captainName: errors.captainName ? DEFAULT_OPTIONS.captainName : candidate.captainName.trim(),
    soundEnabled: candidate.soundEnabled,
  };
}

export const optionsStore = new ExternalStore<PlayerOptions>(
  readJson(storageKeys.options, parseOptions) ?? DEFAULT_OPTIONS,
  shallowEqual,
);

export function saveOptions(next: PlayerOptions): { ok: true } | { ok: false; errors: OptionsErrors } {
  const errors = validateOptions(next);
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const normalized = { ...next, captainName: next.captainName.trim() };
  writeJson(storageKeys.options, normalized);
  optionsStore.set(normalized);
  return { ok: true };
}

export function reloadOptionsFromStorage(): void {
  optionsStore.set(readJson(storageKeys.options, parseOptions) ?? DEFAULT_OPTIONS);
}
