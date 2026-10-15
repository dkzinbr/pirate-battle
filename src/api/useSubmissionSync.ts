import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import type { MatchRecord } from './contracts';
import { describeApiError } from './http';
import { submitMatch } from './matchesApi';
import { queryKeys } from './queries';
import { markConfirmed, markFailed, markSending, requeue, submissionStore, unsentEntries } from './submissionStore';

export const SUBMIT_MUTATION_KEY = ['matches', 'submit'] as const;

/** Guards against double sends when effects re-run (e.g. React Strict Mode). */
const inFlight = new Set<string>();

/**
 * Background outbox worker, mounted once at the app root so it keeps running
 * across screens (the player can start another match while a record is
 * pending). Records are sent one at a time through a mutation scope.
 */
export function useSubmissionSync(): void {
  const queryClient = useQueryClient();
  const entries = useSyncExternalStore(submissionStore.subscribe, submissionStore.getSnapshot);

  const { mutate } = useMutation({
    mutationKey: SUBMIT_MUTATION_KEY,
    mutationFn: (record: MatchRecord) => submitMatch(record),
    scope: { id: 'match-submission' },
    onSuccess: (_result, record) => {
      markConfirmed(record.matchId);
      void queryClient.invalidateQueries({ queryKey: queryKeys.rankingAll });
      void queryClient.invalidateQueries({ queryKey: queryKeys.historyAll });
    },
    onError: (error, record) => {
      markFailed(record.matchId, describeApiError(error));
    },
    onSettled: (_data, _error, record) => {
      inFlight.delete(record.matchId);
    },
  });

  useEffect(() => {
    for (const entry of unsentEntries(entries)) {
      if (entry.status !== 'pending' || inFlight.has(entry.record.matchId)) continue;
      inFlight.add(entry.record.matchId);
      markSending(entry.record.matchId);
      mutate(entry.record);
    }
  }, [entries, mutate]);

  useEffect(() => {
    const retryAll = () => {
      requeue();
    };
    window.addEventListener('online', retryAll);
    return () => {
      window.removeEventListener('online', retryAll);
    };
  }, []);
}
