import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { keepNewestRevision } from './queries';
import { retryDelay, shouldRetry } from './queryClient';
import { ApiError } from './http';

const page = (revision: number, items: string[]) => ({ items, page: 1, pageSize: 5, totalItems: items.length, totalPages: 1, revision });

describe('keepNewestRevision', () => {
  it('ignores a response computed from older server data', async () => {
    const client = new QueryClient();
    const key = ['history', 'p1', 1];
    const options = { queryKey: key, structuralSharing: keepNewestRevision, staleTime: 0 };
    await client.query({ ...options, queryFn: () => Promise.resolve(page(5, ['new'])) });
    await client.query({ ...options, queryFn: () => Promise.resolve(page(3, ['old'])) });
    expect(client.getQueryData(key)).toEqual(page(5, ['new']));
  });

  it('accepts newer data and keeps references for identical data', () => {
    const current = page(2, ['a']);
    expect(keepNewestRevision(current, page(3, ['b']))).toEqual(page(3, ['b']));
    expect(keepNewestRevision(current, page(2, ['a']))).toBe(current);
    expect(keepNewestRevision(undefined, current)).toBe(current);
  });
});

describe('retry policy', () => {
  it('retries transient failures only', () => {
    expect(shouldRetry(0, new ApiError('timeout', 'x'))).toBe(true);
    expect(shouldRetry(0, new ApiError('network', 'x'))).toBe(true);
    expect(shouldRetry(0, new ApiError('http', 'x', 503))).toBe(true);
    expect(shouldRetry(0, new ApiError('http', 'x', 429))).toBe(true);
    expect(shouldRetry(0, new ApiError('http', 'x', 400))).toBe(false);
    expect(shouldRetry(0, new ApiError('http', 'x', 422))).toBe(false);
    expect(shouldRetry(2, new ApiError('timeout', 'x'))).toBe(false);
  });

  it('backs off exponentially with a cap', () => {
    expect(retryDelay(0)).toBe(400);
    expect(retryDelay(1)).toBe(800);
    expect(retryDelay(10)).toBe(4000);
  });
});
