import type { EndReason, MatchConfigSnapshot, MatchRecord } from '../api/contracts';

/** Rival captains used to populate the ranking. Fully deterministic. */
const RIVALS = [
  'Captain Flint',
  'Red Sparrow',
  'Storm Rider',
  'Sea Wolf',
  'Anne Bonny',
  'Black Barnacle',
  'Salty Meg',
  'Iron Hook',
  'Long John',
  'Mad Marlin',
  'Coral Queen',
  'Grim Gull',
  'Old Kraken',
] as const;

interface FixtureSpec {
  config: MatchConfigSnapshot;
  scores: readonly number[];
}

const SPECS: readonly FixtureSpec[] = [
  // Default bracket: 13 entries -> 3 pages of 5, including a score tie.
  { config: { sessionDurationSec: 120, spawnIntervalSec: 3 }, scores: [38, 32, 29, 27, 21, 21, 19, 16, 14, 12, 9, 7, 5] },
  { config: { sessionDurationSec: 60, spawnIntervalSec: 3 }, scores: [17, 14, 11, 8] },
  { config: { sessionDurationSec: 180, spawnIntervalSec: 2 }, scores: [61, 48, 40] },
  { config: { sessionDurationSec: 120, spawnIntervalSec: 5 }, scores: [20, 15, 13] },
];

const BASE_TIME = Date.UTC(2026, 8, 8, 21, 42);

export function createFixtureMatches(): MatchRecord[] {
  const records: MatchRecord[] = [];
  let sequence = 0;
  for (const spec of SPECS) {
    spec.scores.forEach((score, index) => {
      sequence += 1;
      const rival = RIVALS[(index + sequence) % RIVALS.length] ?? 'Captain Flint';
      const destroyed = index % 3 === 2;
      const durationMs = destroyed ? Math.round(spec.config.sessionDurationSec * 1000 * (0.55 + index * 0.02)) : spec.config.sessionDurationSec * 1000;
      const endReason: EndReason = destroyed ? 'destroyed' : 'time_up';
      records.push({
        matchId: `fixture-${String(sequence).padStart(3, '0')}`,
        playerId: `rival-${rival.toLowerCase().replace(/\s+/g, '-')}`,
        playerName: rival,
        playedAt: new Date(BASE_TIME - sequence * 26 * 60_000).toISOString(),
        score,
        durationMs,
        endReason,
        config: { ...spec.config },
      });
    });
  }
  return records;
}

/** Sample battles for the local player, used by the "seed my history" demo action. */
export function createPlayerHistoryFixtures(playerId: string, playerName: string, now: number): MatchRecord[] {
  const scores = [24, 18, 22, 11, 20, 9, 15, 26, 13, 17, 8, 19];
  return scores.map((score, index) => {
    const destroyed = index % 2 === 1;
    return {
      matchId: `history-fixture-${playerId}-${index}`,
      playerId,
      playerName,
      playedAt: new Date(now - (index + 1) * 8 * 60_000).toISOString(),
      score,
      durationMs: destroyed ? 60_000 + index * 3_500 : 120_000,
      endReason: destroyed ? 'destroyed' : 'time_up',
      config: { sessionDurationSec: 120, spawnIntervalSec: 3 },
    };
  });
}
