import {
  API_ROUTES,
  DEFAULT_PAGE_SIZE,
  isMatchRecord,
  type MatchConfigSnapshot,
  type MatchRecord,
  type Page,
  type RankingPage,
} from './contracts';
import { ApiError, http, toApiError } from './http';

function assertPage<T>(data: unknown, isItem: (item: unknown) => item is T): Page<T> {
  if (typeof data !== 'object' || data === null) throw new ApiError('invalid_response', 'Malformed page response.');
  const page = data as Page<unknown>;
  if (!Array.isArray(page.items) || typeof page.totalPages !== 'number' || typeof page.revision !== 'number') {
    throw new ApiError('invalid_response', 'Malformed page response.');
  }
  if (!page.items.every(isItem)) throw new ApiError('invalid_response', 'Malformed page items.');
  return page as Page<T>;
}

function isRankingEntry(value: unknown): value is RankingPage['items'][number] {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.rank === 'number' && typeof v.matchId === 'string' && typeof v.score === 'number';
}

export async function fetchRanking(
  config: MatchConfigSnapshot,
  page: number,
  signal?: AbortSignal,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<RankingPage> {
  try {
    const response = await http.get<unknown>(API_ROUTES.ranking, {
      params: { ...config, page, pageSize },
      ...(signal ? { signal } : {}),
    });
    const parsed = assertPage(response.data, isRankingEntry);
    return { ...parsed, config: (response.data as RankingPage).config };
  } catch (error) {
    throw toApiError(error);
  }
}

export async function fetchHistory(
  playerId: string,
  page: number,
  signal?: AbortSignal,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<Page<MatchRecord>> {
  try {
    const response = await http.get<unknown>(API_ROUTES.playerMatches(playerId), {
      params: { page, pageSize },
      ...(signal ? { signal } : {}),
    });
    return assertPage(response.data, isMatchRecord);
  } catch (error) {
    throw toApiError(error);
  }
}

/** Idempotent: sending the same matchId twice returns the stored record (HTTP 200). */
export async function submitMatch(record: MatchRecord): Promise<{ record: MatchRecord; created: boolean }> {
  try {
    const response = await http.post<unknown>(API_ROUTES.matches, record);
    if (!isMatchRecord(response.data)) throw new ApiError('invalid_response', 'Malformed match response.');
    return { record: response.data, created: response.status === 201 };
  } catch (error) {
    throw toApiError(error);
  }
}
