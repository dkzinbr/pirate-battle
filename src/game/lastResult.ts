import { isMatchRecord, type MatchRecord } from '../api/contracts';
import { ExternalStore } from '../shared/externalStore';
import { isRecord, readJson, storageKeys, writeJson } from '../shared/storage';

export interface LastResult {
  record: MatchRecord;
  enemiesSpawned: { chaser: number; shooter: number };
}

function parse(raw: unknown): LastResult | null {
  if (!isRecord(raw) || !isMatchRecord(raw.record)) return null;
  const spawned = isRecord(raw.enemiesSpawned) ? raw.enemiesSpawned : {};
  return {
    record: raw.record,
    enemiesSpawned: {
      chaser: typeof spawned.chaser === 'number' ? spawned.chaser : 0,
      shooter: typeof spawned.shooter === 'number' ? spawned.shooter : 0,
    },
  };
}

/** The last completed match, persisted so the result screen survives a refresh. */
export const lastResultStore = new ExternalStore<LastResult | null>(readJson(storageKeys.lastResult, parse));

export function saveLastResult(result: LastResult): void {
  writeJson(storageKeys.lastResult, result);
  lastResultStore.set(result);
}
