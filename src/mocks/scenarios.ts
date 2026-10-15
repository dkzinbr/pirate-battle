import { ExternalStore, shallowEqual } from '../shared/externalStore';
import { isRecord, readJson, storageKeys, writeJson } from '../shared/storage';

export const SCENARIO_IDS = [
  'normal',
  'instant',
  'empty',
  'slow',
  'variable-latency',
  'out-of-order',
  'timeout',
  'network-error',
  'server-error',
  'client-error',
  'ranking-error',
  'history-error',
  'submit-timeout-after-commit',
  'submit-unavailable',
] as const;

export type ScenarioId = (typeof SCENARIO_IDS)[number];

export interface ScenarioInfo {
  label: string;
  description: string;
}

export const SCENARIOS: Readonly<Record<ScenarioId, ScenarioInfo>> = {
  normal: { label: 'Normal', description: 'Successful responses with realistic latency (150–450 ms).' },
  instant: { label: 'Instant', description: 'Successful responses without latency (used by automated tests).' },
  empty: { label: 'Empty lists', description: 'Ranking and history return no entries.' },
  slow: { label: 'Slow network', description: 'Every response takes 2.5 seconds.' },
  'variable-latency': {
    label: 'Variable latency',
    description: 'Seeded random latency between 100 ms and 3 s; the same seed replays the same delays.',
  },
  'out-of-order': {
    label: 'Out-of-order responses',
    description: 'Odd requests take 2.5 s and even requests 150 ms, so older responses arrive after newer ones.',
  },
  timeout: { label: 'Timeout', description: 'Requests never answer; the client aborts after its timeout.' },
  'network-error': { label: 'Connection failure', description: 'Every request fails at the network level.' },
  'server-error': { label: 'Server error (500)', description: 'Every request answers HTTP 500.' },
  'client-error': { label: 'Bad request (400)', description: 'Every request answers HTTP 400; the client does not retry.' },
  'ranking-error': { label: 'Ranking unavailable', description: 'Only ranking queries fail (HTTP 503).' },
  'history-error': { label: 'History unavailable', description: 'Only match history queries fail (HTTP 500).' },
  'submit-timeout-after-commit': {
    label: 'Timeout after saving',
    description:
      'The first submission of a match is stored but its response never arrives; the retry returns the stored record without duplicating it.',
  },
  'submit-unavailable': {
    label: 'Saving unavailable',
    description: 'Match submissions fail with HTTP 503 while queries work. Switch back to Normal to recover pending records.',
  },
};

export interface MockSettings {
  scenario: ScenarioId;
  /** Seed for every random latency so runs are reproducible. */
  seed: number;
}

export const DEFAULT_MOCK_SETTINGS: MockSettings = { scenario: 'normal', seed: 1 };

export function isScenarioId(value: unknown): value is ScenarioId {
  return typeof value === 'string' && (SCENARIO_IDS as readonly string[]).includes(value);
}

function parseSettings(raw: unknown): MockSettings | null {
  if (!isRecord(raw)) return null;
  return {
    scenario: isScenarioId(raw.scenario) ? raw.scenario : DEFAULT_MOCK_SETTINGS.scenario,
    seed: typeof raw.seed === 'number' && Number.isFinite(raw.seed) ? raw.seed : DEFAULT_MOCK_SETTINGS.seed,
  };
}

export const mockSettingsStore = new ExternalStore<MockSettings>(
  readJson(storageKeys.mockSettings, parseSettings) ?? DEFAULT_MOCK_SETTINGS,
  shallowEqual,
);

export function updateMockSettings(patch: Partial<MockSettings>): void {
  const next = { ...mockSettingsStore.getSnapshot(), ...patch };
  writeJson(storageKeys.mockSettings, next);
  mockSettingsStore.set(next);
}

/** `?scenario=slow&mockSeed=7` lets demos and tests pick a scenario from the URL. */
export function applyScenarioFromUrl(search: string): void {
  const params = new URLSearchParams(search);
  const scenario = params.get('scenario');
  const seed = Number(params.get('mockSeed'));
  const patch: Partial<MockSettings> = {};
  if (isScenarioId(scenario)) patch.scenario = scenario;
  if (params.has('mockSeed') && Number.isFinite(seed)) patch.seed = seed;
  if (Object.keys(patch).length > 0) updateMockSettings(patch);
}
