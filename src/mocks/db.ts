import {
  compareRanking,
  isMatchRecord,
  type MatchConfigSnapshot,
  type MatchRecord,
  type Page,
  type RankingPage,
  sameConfig,
} from '../api/contracts';
import { isRecord, readJson, storageKeys, writeJson } from '../shared/storage';
import { createFixtureMatches } from './fixtures';

interface DbState {
  revision: number;
  matches: MatchRecord[];
}

function parseDb(raw: unknown): DbState | null {
  if (!isRecord(raw) || typeof raw.revision !== 'number' || !Array.isArray(raw.matches)) return null;
  return { revision: raw.revision, matches: raw.matches.filter(isMatchRecord) };
}

function seedState(revision = 1): DbState {
  return { revision, matches: createFixtureMatches() };
}

function paginate<T>(items: readonly T[], page: number, pageSize: number, revision: number): Page<T> {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page: safePage, pageSize, totalItems, totalPages, revision };
}

/**
 * In-browser "server" storage for the mocked API. Confirmed records are
 * persisted in localStorage so they survive refreshes, exactly like a real
 * backend would from the client's point of view.
 */
class MockDatabase {
  private state: DbState;

  constructor() {
    this.state = readJson(storageKeys.mockDb, parseDb) ?? seedState();
  }

  private persist(): void {
    writeJson(storageKeys.mockDb, this.state);
  }

  /** Re-reads storage; another tab (or a test) may have changed it. */
  refresh(): void {
    this.state = readJson(storageKeys.mockDb, parseDb) ?? this.state;
  }

  get revision(): number {
    return this.state.revision;
  }

  /** Idempotent insert keyed by matchId. */
  insert(record: MatchRecord): { record: MatchRecord; created: boolean } {
    this.refresh();
    const existing = this.state.matches.find((m) => m.matchId === record.matchId);
    if (existing) return { record: existing, created: false };
    const stored = structuredClone(record);
    this.state = { revision: this.state.revision + 1, matches: [...this.state.matches, stored] };
    this.persist();
    return { record: stored, created: true };
  }

  all(): MatchRecord[] {
    this.refresh();
    return structuredClone(this.state.matches);
  }

  find(matchId: string): MatchRecord | undefined {
    this.refresh();
    return this.state.matches.find((m) => m.matchId === matchId);
  }

  ranking(config: MatchConfigSnapshot, page: number, pageSize: number): RankingPage {
    this.refresh();
    const ordered = this.state.matches.filter((m) => sameConfig(m.config, config)).sort(compareRanking);
    const ranked = ordered.map((m, index) => ({
      rank: index + 1,
      matchId: m.matchId,
      playerId: m.playerId,
      playerName: m.playerName,
      score: m.score,
      durationMs: m.durationMs,
      playedAt: m.playedAt,
    }));
    return { ...paginate(ranked, page, pageSize, this.state.revision), config };
  }

  history(playerId: string, page: number, pageSize: number): Page<MatchRecord> {
    this.refresh();
    const ordered = this.state.matches
      .filter((m) => m.playerId === playerId)
      .sort((a, b) => b.playedAt.localeCompare(a.playedAt) || a.matchId.localeCompare(b.matchId));
    return paginate(ordered, page, pageSize, this.state.revision);
  }

  insertMany(records: readonly MatchRecord[]): void {
    this.refresh();
    const known = new Set(this.state.matches.map((m) => m.matchId));
    const fresh = records.filter((r) => !known.has(r.matchId));
    if (fresh.length === 0) return;
    this.state = { revision: this.state.revision + 1, matches: [...this.state.matches, ...fresh] };
    this.persist();
  }

  /** Restores the initial fixtures. The revision keeps growing so caches never go backwards. */
  reset(): void {
    this.state = seedState(this.state.revision + 1);
    this.persist();
  }
}

export const mockDb = new MockDatabase();
