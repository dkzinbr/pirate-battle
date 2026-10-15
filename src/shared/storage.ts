/**
 * Thin, failure-tolerant wrapper around localStorage.
 * Private browsing modes or quota errors must never break the game, so every
 * access is guarded and falls back to the provided default.
 */

export const STORAGE_PREFIX = 'pirate-battle';

export const storageKeys = {
  options: `${STORAGE_PREFIX}.options.v1`,
  profile: `${STORAGE_PREFIX}.profile.v1`,
  lastResult: `${STORAGE_PREFIX}.last-result.v1`,
  submissions: `${STORAGE_PREFIX}.submissions.v1`,
  mockDb: `${STORAGE_PREFIX}.mock-db.v1`,
  mockSettings: `${STORAGE_PREFIX}.mock-settings.v1`,
} as const;

export function readJson<T>(key: string, parse: (raw: unknown) => T | null): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return null;
    return parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage unavailable: nothing to remove.
  }
}

export function clearAppStorage(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => {
      window.localStorage.removeItem(key);
    });
  } catch {
    // Storage unavailable.
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
