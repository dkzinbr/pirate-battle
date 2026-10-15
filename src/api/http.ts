import axios, { AxiosError } from 'axios';
import { readJson, STORAGE_PREFIX, writeJson } from '../shared/storage';
import type { ApiErrorBody } from './contracts';

const TIMEOUT_KEY = `${STORAGE_PREFIX}.api-timeout-ms`;
export const DEFAULT_TIMEOUT_MS = 5000;
export const TIMEOUT_LIMITS = { min: 500, max: 30000 } as const;

export function getApiTimeoutMs(): number {
  const stored = readJson(TIMEOUT_KEY, (raw) => (typeof raw === 'number' ? raw : null));
  if (stored === null) return DEFAULT_TIMEOUT_MS;
  return Math.min(TIMEOUT_LIMITS.max, Math.max(TIMEOUT_LIMITS.min, stored));
}

export function setApiTimeoutMs(ms: number): void {
  writeJson(TIMEOUT_KEY, Math.min(TIMEOUT_LIMITS.max, Math.max(TIMEOUT_LIMITS.min, Math.round(ms))));
}

export const http = axios.create({
  baseURL: '/',
  headers: { Accept: 'application/json' },
  transitional: { clarifyTimeoutError: true },
});

// The timeout is read per request so the network lab can change it at runtime.
http.interceptors.request.use((config) => {
  config.timeout = getApiTimeoutMs();
  return config;
});

export type ApiErrorKind = 'timeout' | 'network' | 'http' | 'canceled' | 'invalid_response';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly code: string | null;

  constructor(kind: ApiErrorKind, message: string, status: number | null = null, code: string | null = null) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.code = code;
  }

  /** Transient failures worth retrying; 4xx validation errors are not. */
  get retryable(): boolean {
    if (this.kind === 'timeout' || this.kind === 'network') return true;
    if (this.kind === 'http' && this.status !== null) return this.status >= 500 || this.status === 408 || this.status === 429;
    return false;
  }
}

function isErrorBody(value: unknown): value is ApiErrorBody {
  return typeof value === 'object' && value !== null && 'error' in value;
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (axios.isCancel(error)) return new ApiError('canceled', 'The request was cancelled.');
  if (error instanceof AxiosError) {
    if (error.code === AxiosError.ETIMEDOUT || error.code === AxiosError.ECONNABORTED) {
      return new ApiError('timeout', 'The server took too long to answer.');
    }
    if (error.response) {
      const body: unknown = error.response.data;
      const message = isErrorBody(body) ? body.error.message : `The server answered with HTTP ${error.response.status}.`;
      const code = isErrorBody(body) ? body.error.code : null;
      return new ApiError('http', message, error.response.status, code);
    }
    return new ApiError('network', 'Could not reach the server. Check your connection.');
  }
  return new ApiError('invalid_response', error instanceof Error ? error.message : 'Unexpected error.');
}

export function describeApiError(error: unknown): string {
  return toApiError(error).message;
}
