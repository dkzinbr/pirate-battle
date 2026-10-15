import { ExternalStore } from '../shared/externalStore';
import { isRecord, readJson, storageKeys, writeJson } from '../shared/storage';
import { isMatchRecord, type MatchRecord } from './contracts';

export type SubmissionStatus = 'pending' | 'sending' | 'confirmed' | 'failed';

export interface SubmissionEntry {
  record: MatchRecord;
  status: SubmissionStatus;
  attempts: number;
  lastError: string | null;
  updatedAt: string;
}

export type SubmissionMap = Readonly<Record<string, SubmissionEntry>>;

const MAX_CONFIRMED_KEPT = 20;
const STATUSES: readonly SubmissionStatus[] = ['pending', 'sending', 'confirmed', 'failed'];

function parse(raw: unknown): SubmissionMap | null {
  if (!isRecord(raw)) return null;
  const result: Record<string, SubmissionEntry> = {};
  for (const [id, value] of Object.entries(raw)) {
    if (!isRecord(value) || !isMatchRecord(value.record)) continue;
    const status = STATUSES.includes(value.status as SubmissionStatus) ? (value.status as SubmissionStatus) : 'pending';
    result[id] = {
      record: value.record,
      // Anything not confirmed is retried after a reload.
      status: status === 'confirmed' ? 'confirmed' : 'pending',
      attempts: typeof value.attempts === 'number' ? value.attempts : 0,
      lastError: typeof value.lastError === 'string' ? value.lastError : null,
      updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
    };
  }
  return result;
}

/**
 * Durable outbox for finished matches. A record is written here *before* the
 * first network attempt and only leaves the pending state once the server
 * confirms it, so failures, timeouts and refreshes never lose a match.
 */
export const submissionStore = new ExternalStore<SubmissionMap>(readJson(storageKeys.submissions, parse) ?? {});

function commit(next: Record<string, SubmissionEntry>): void {
  const evicted = new Set(
    Object.values(next)
      .filter((e) => e.status === 'confirmed')
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(MAX_CONFIRMED_KEPT)
      .map((e) => e.record.matchId),
  );
  const kept = Object.fromEntries(Object.entries(next).filter(([id]) => !evicted.has(id)));
  writeJson(storageKeys.submissions, kept);
  submissionStore.set(kept);
}

function patch(matchId: string, changes: Partial<SubmissionEntry>): void {
  const current = submissionStore.getSnapshot()[matchId];
  if (!current) return;
  commit({
    ...submissionStore.getSnapshot(),
    [matchId]: { ...current, ...changes, updatedAt: new Date().toISOString() },
  });
}

export function enqueueSubmission(record: MatchRecord): void {
  if (submissionStore.getSnapshot()[record.matchId]) return;
  commit({
    ...submissionStore.getSnapshot(),
    [record.matchId]: { record, status: 'pending', attempts: 0, lastError: null, updatedAt: new Date().toISOString() },
  });
}

export function markSending(matchId: string): void {
  const current = submissionStore.getSnapshot()[matchId];
  if (current) patch(matchId, { status: 'sending', attempts: current.attempts + 1 });
}

export function markConfirmed(matchId: string): void {
  patch(matchId, { status: 'confirmed', lastError: null });
}

export function markFailed(matchId: string, message: string): void {
  patch(matchId, { status: 'failed', lastError: message });
}

/** Moves failed records back to pending so the sync loop sends them again. */
export function requeue(matchIds?: readonly string[]): void {
  const snapshot = submissionStore.getSnapshot();
  const ids = matchIds ?? Object.keys(snapshot);
  let changed = false;
  const next = { ...snapshot };
  for (const id of ids) {
    const entry = next[id];
    if (entry?.status === 'failed') {
      next[id] = { ...entry, status: 'pending', updatedAt: new Date().toISOString() };
      changed = true;
    }
  }
  if (changed) commit(next);
}

export function unsentEntries(map: SubmissionMap): SubmissionEntry[] {
  return Object.values(map)
    .filter((e) => e.status !== 'confirmed')
    .sort((a, b) => a.record.playedAt.localeCompare(b.record.playedAt));
}

export function reloadSubmissionsFromStorage(): void {
  submissionStore.set(readJson(storageKeys.submissions, parse) ?? {});
}
