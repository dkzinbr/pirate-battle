import { createId } from '../shared/id';
import { isRecord, readJson, storageKeys, writeJson } from '../shared/storage';

export interface PlayerProfile {
  playerId: string;
}

function parseProfile(raw: unknown): PlayerProfile | null {
  if (!isRecord(raw) || typeof raw.playerId !== 'string' || raw.playerId.length < 8) return null;
  return { playerId: raw.playerId };
}

let cached: PlayerProfile | null = null;

/** Stable anonymous identity of this browser, used by ranking and history. */
export function getProfile(): PlayerProfile {
  if (cached) return cached;
  const stored = readJson(storageKeys.profile, parseProfile);
  if (stored) {
    cached = stored;
    return stored;
  }
  const profile: PlayerProfile = { playerId: `player-${createId()}` };
  writeJson(storageKeys.profile, profile);
  cached = profile;
  return profile;
}

export function resetProfileCache(): void {
  cached = null;
}
