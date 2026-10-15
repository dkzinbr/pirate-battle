import { delay, http, HttpResponse } from 'msw';
import {
  API_ROUTES,
  type ApiErrorBody,
  DEFAULT_PAGE_SIZE,
  isMatchRecord,
  MAX_PAGE_SIZE,
  type MatchRecord,
  type Page,
  type RankingPage,
} from '../api/contracts';
import { Rng } from '../game/core/rng';
import { mockDb } from './db';
import { mockSettingsStore, type ScenarioId } from './scenarios';

type Operation = 'ranking' | 'history' | 'submit';

let requestCounter = 0;
let counterSeed = mockSettingsStore.getSnapshot().seed;

/** Restarts the deterministic latency sequence (used when scenarios change). */
export function resetRequestSequence(): void {
  requestCounter = 0;
  counterSeed = mockSettingsStore.getSnapshot().seed;
}

mockSettingsStore.subscribe(resetRequestSequence);

function errorBody(code: string, message: string): ApiErrorBody {
  return { error: { code, message } };
}

function latencyFor(scenario: ScenarioId, index: number): number {
  const rng = new Rng((counterSeed * 7919 + index * 104729) >>> 0);
  switch (scenario) {
    case 'instant':
      return 0;
    case 'slow':
      return 2500;
    case 'variable-latency':
      return Math.round(rng.range(100, 3000));
    case 'out-of-order':
      return index % 2 === 1 ? 2500 : 150;
    case 'normal':
    case 'empty':
      return Math.round(rng.range(150, 450));
    default:
      return 60;
  }
}

/** Returns a failure response for the scenario, or null to continue normally. */
async function failureFor(scenario: ScenarioId, operation: Operation): Promise<Response | null> {
  switch (scenario) {
    case 'timeout':
      await delay('infinite');
      return null;
    case 'network-error':
      return HttpResponse.error();
    case 'server-error':
      return HttpResponse.json(errorBody('internal', 'The harbour master is out to lunch.'), { status: 500 });
    case 'client-error':
      return HttpResponse.json(errorBody('bad_request', 'The request was rejected.'), { status: 400 });
    case 'ranking-error':
      return operation === 'ranking'
        ? HttpResponse.json(errorBody('unavailable', 'Ranking is temporarily unavailable.'), { status: 503 })
        : null;
    case 'history-error':
      return operation === 'history'
        ? HttpResponse.json(errorBody('internal', 'Match history could not be read.'), { status: 500 })
        : null;
    case 'submit-unavailable':
      return operation === 'submit'
        ? HttpResponse.json(errorBody('unavailable', 'Saving is temporarily unavailable.'), { status: 503 })
        : null;
    default:
      return null;
  }
}

async function prelude(operation: Operation): Promise<{ scenario: ScenarioId; failure: Response | null }> {
  const { scenario } = mockSettingsStore.getSnapshot();
  requestCounter += 1;
  const latency = latencyFor(scenario, requestCounter);
  if (latency > 0) await delay(latency);
  return { scenario, failure: await failureFor(scenario, operation) };
}

function readPaging(url: URL): { page: number; pageSize: number } | null {
  const page = Number(url.searchParams.get('page') ?? '1');
  const pageSize = Number(url.searchParams.get('pageSize') ?? String(DEFAULT_PAGE_SIZE));
  if (!Number.isInteger(page) || page < 1) return null;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) return null;
  return { page, pageSize };
}

function emptyPage(page: number, pageSize: number): Page<never> {
  return { items: [], page, pageSize, totalItems: 0, totalPages: 1, revision: mockDb.revision };
}

export const handlers = [
  http.get(API_ROUTES.ranking, async ({ request }) => {
    const { scenario, failure } = await prelude('ranking');
    if (failure) return failure;
    const url = new URL(request.url);
    const paging = readPaging(url);
    const sessionDurationSec = Number(url.searchParams.get('sessionDurationSec'));
    const spawnIntervalSec = Number(url.searchParams.get('spawnIntervalSec'));
    if (!paging || !(sessionDurationSec > 0) || !(spawnIntervalSec > 0)) {
      return HttpResponse.json(errorBody('bad_request', 'Invalid ranking query.'), { status: 400 });
    }
    const config = { sessionDurationSec, spawnIntervalSec };
    const body: RankingPage =
      scenario === 'empty'
        ? { ...emptyPage(paging.page, paging.pageSize), config }
        : mockDb.ranking(config, paging.page, paging.pageSize);
    return HttpResponse.json(body);
  }),

  http.get('/api/players/:playerId/matches', async ({ request, params }) => {
    const { scenario, failure } = await prelude('history');
    if (failure) return failure;
    const paging = readPaging(new URL(request.url));
    const playerId = typeof params.playerId === 'string' ? params.playerId : '';
    if (!paging || !playerId) {
      return HttpResponse.json(errorBody('bad_request', 'Invalid history query.'), { status: 400 });
    }
    const body: Page<MatchRecord> =
      scenario === 'empty' ? emptyPage(paging.page, paging.pageSize) : mockDb.history(playerId, paging.page, paging.pageSize);
    return HttpResponse.json(body);
  }),

  http.post(API_ROUTES.matches, async ({ request }) => {
    const { scenario, failure } = await prelude('submit');
    if (failure) return failure;
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      payload = null;
    }
    if (!isMatchRecord(payload)) {
      return HttpResponse.json(errorBody('invalid_match', 'The match record is invalid.'), { status: 422 });
    }
    const { record, created } = mockDb.insert(payload);
    if (created && scenario === 'submit-timeout-after-commit') {
      // Stored, but the acknowledgement is lost: the client will time out and retry.
      await delay('infinite');
    }
    return HttpResponse.json(record, { status: created ? 201 : 200 });
  }),
];
