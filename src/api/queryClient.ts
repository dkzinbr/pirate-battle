import { QueryClient } from '@tanstack/react-query';
import { toApiError } from './http';

export const QUERY_RETRY_LIMIT = 2;

export function shouldRetry(failureCount: number, error: unknown, limit = QUERY_RETRY_LIMIT): boolean {
  return failureCount < limit && toApiError(error).retryable;
}

export function retryDelay(attempt: number): number {
  return Math.min(4000, 400 * 2 ** attempt);
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        gcTime: 5 * 60_000,
        retry: (count, error) => shouldRetry(count, error),
        retryDelay,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: (count, error) => shouldRetry(count, error, 3),
        retryDelay,
      },
    },
  });
}
