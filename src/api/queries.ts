import { keepPreviousData, replaceEqualDeep, useQuery } from '@tanstack/react-query';
import type { MatchConfigSnapshot, PageMeta } from './contracts';
import { fetchHistory, fetchRanking } from './matchesApi';

export const queryKeys = {
  rankingAll: ['ranking'] as const,
  historyAll: ['history'] as const,
  ranking: (config: MatchConfigSnapshot, page: number) =>
    ['ranking', config.sessionDurationSec, config.spawnIntervalSec, page] as const,
  history: (playerId: string, page: number) => ['history', playerId, page] as const,
};

function isPageMeta(value: unknown): value is PageMeta {
  return typeof value === 'object' && value !== null && typeof (value as PageMeta).revision === 'number';
}

/**
 * Never let a response computed from older server data replace newer cached
 * data, even if it arrives later (slow request, retries, out-of-order replies).
 * Equal revisions still go through structural sharing to keep references stable.
 */
export function keepNewestRevision(oldData: unknown, newData: unknown): unknown {
  if (isPageMeta(oldData) && isPageMeta(newData) && newData.revision < oldData.revision) return oldData;
  return replaceEqualDeep(oldData, newData);
}

export function useRankingQuery(config: MatchConfigSnapshot, page: number) {
  return useQuery({
    queryKey: queryKeys.ranking(config, page),
    queryFn: ({ signal }) => fetchRanking(config, page, signal),
    placeholderData: keepPreviousData,
    structuralSharing: keepNewestRevision,
    refetchOnMount: 'always',
  });
}

export function useHistoryQuery(playerId: string, page: number) {
  return useQuery({
    queryKey: queryKeys.history(playerId, page),
    queryFn: ({ signal }) => fetchHistory(playerId, page, signal),
    placeholderData: keepPreviousData,
    structuralSharing: keepNewestRevision,
    refetchOnMount: 'always',
  });
}
