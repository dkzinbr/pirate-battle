import { type KeyboardEvent, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { MatchConfigSnapshot } from '../../api/contracts';
import { describeApiError } from '../../api/http';
import { useHistoryQuery, useRankingQuery } from '../../api/queries';
import { requeue, submissionStore, unsentEntries } from '../../api/submissionStore';
import { SESSION_DURATION_LIMITS, SPAWN_INTERVAL_LIMITS } from '../../game/config';
import { optionsStore } from '../../settings/options';
import { getProfile } from '../../settings/profile';
import { formatDurationMs, formatPlayedAt, formatRank } from '../../shared/format';
import { GameButton, IconButton } from '../components/Buttons';
import { Panel } from '../components/Panel';
import { ScreenHeading } from '../components/ScreenHeading';
import { type LogTab, navigate } from '../router';

const TABS: readonly { id: LogTab; label: string }[] = [
  { id: 'ranking', label: 'Ranking' },
  { id: 'history', label: 'Match History' },
];

function range(min: number, max: number, step: number): number[] {
  const values: number[] = [];
  for (let v = min; v <= max + 1e-9; v += step) values.push(Math.round(v * 10) / 10);
  return values;
}

interface QueryViewProps {
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  isPlaceholderData: boolean;
  error: unknown;
  hasData: boolean;
  onRetry: () => void;
}

function QueryState({ isPending, isError, isFetching, isPlaceholderData, error, hasData, onRetry }: QueryViewProps) {
  if (isPending && !hasData) {
    return (
      <p className="log-state" role="status" data-testid="log-loading">
        Loading…
      </p>
    );
  }
  if (isError && !hasData) {
    return (
      <div className="log-state log-state--error" role="alert" data-testid="log-error">
        <p>{describeApiError(error)}</p>
        <GameButton size="small" variant="secondary" onClick={onRetry} data-testid="log-retry">
          Try again
        </GameButton>
      </div>
    );
  }
  return (
    <p className="log-refresh" role="status" data-testid="log-refreshing">
      {isError ? `Showing saved data — ${describeApiError(error)}` : isFetching || isPlaceholderData ? 'Updating…' : ''}
    </p>
  );
}

function Pagination({ page, totalPages, onChange, busy }: { page: number; totalPages: number; onChange: (page: number) => void; busy: boolean }) {
  return (
    <nav className="pagination" aria-label="Pages">
      <IconButton icon="turn_left" label="Previous page" disabled={page <= 1} onClick={() => onChange(page - 1)} data-testid="page-prev" />
      <span aria-live="polite" aria-busy={busy} data-testid="page-label">
        Page {page} of {totalPages}
      </span>
      <IconButton
        icon="turn_right"
        label="Next page"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        data-testid="page-next"
      />
    </nav>
  );
}

function RankingTab({ initialConfig }: { initialConfig: MatchConfigSnapshot }) {
  const [config, setConfig] = useState(initialConfig);
  const [page, setPage] = useState(1);
  const query = useRankingQuery(config, page);
  const playerId = getProfile().playerId;
  const data = query.data;
  // The server may clamp the page (e.g. after a reset); follow it.
  const shownPage = data?.page ?? page;

  return (
    <div className="log-tab" data-testid="ranking-tab">
      <div className="bracket">
        <label>
          <span className="visually-hidden">Battle length</span>
          <select
            className="select"
            value={config.sessionDurationSec}
            data-testid="bracket-duration"
            onChange={(event) => {
              setConfig({ ...config, sessionDurationSec: Number(event.target.value) });
              setPage(1);
            }}
          >
            {range(SESSION_DURATION_LIMITS.min, SESSION_DURATION_LIMITS.max, SESSION_DURATION_LIMITS.step).map((v) => (
              <option key={v} value={v}>
                {v} second battles
              </option>
            ))}
          </select>
        </label>
        <span aria-hidden="true">·</span>
        <label>
          <span className="visually-hidden">Spawn interval</span>
          <select
            className="select"
            value={config.spawnIntervalSec}
            data-testid="bracket-spawn"
            onChange={(event) => {
              setConfig({ ...config, spawnIntervalSec: Number(event.target.value) });
              setPage(1);
            }}
          >
            {range(SPAWN_INTERVAL_LIMITS.min, SPAWN_INTERVAL_LIMITS.max, SPAWN_INTERVAL_LIMITS.step).map((v) => (
              <option key={v} value={v}>
                {v} second spawn interval
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="visually-hidden">Only battles played with the same settings are compared.</p>

      <QueryState
        isPending={query.isPending}
        isError={query.isError}
        isFetching={query.isFetching}
        isPlaceholderData={query.isPlaceholderData}
        error={query.error}
        hasData={data !== undefined}
        onRetry={() => void query.refetch()}
      />

      {data ? (
        data.items.length === 0 ? (
          <p className="log-state" data-testid="log-empty">
            No battles recorded for these settings yet. Be the first captain on the board!
          </p>
        ) : (
          <table className="log-table" data-testid="ranking-table" aria-busy={query.isFetching}>
            <caption className="visually-hidden">
              Ranking for {config.sessionDurationSec} second battles with a {config.spawnIntervalSec} second spawn interval
            </caption>
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Captain</th>
                <th scope="col">Points</th>
                <th scope="col">Played</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((entry) => {
                const mine = entry.playerId === playerId;
                const played = formatPlayedAt(entry.playedAt);
                return (
                  <tr key={entry.matchId} className={mine ? 'is-mine' : undefined} data-testid="ranking-row">
                    <td>{formatRank(entry.rank)}</td>
                    <th scope="row" className="captain">
                      {entry.rank === 1 ? <span aria-label="Top captain">★ </span> : null}
                      {entry.playerName}
                      {mine ? <span className="you-badge">You</span> : null}
                    </th>
                    <td className="points">{entry.score}</td>
                    <td className="played">
                      {played.day} · {played.time}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )
      ) : null}
      {data && data.items.length > 0 ? (
        <Pagination page={shownPage} totalPages={data.totalPages} onChange={setPage} busy={query.isFetching} />
      ) : null}
    </div>
  );
}

function HistoryTab({ captainName }: { captainName: string }) {
  const [page, setPage] = useState(1);
  const playerId = getProfile().playerId;
  const query = useHistoryQuery(playerId, page);
  const submissions = useSyncExternalStore(submissionStore.subscribe, submissionStore.getSnapshot);
  const unsent = unsentEntries(submissions);
  const data = query.data;

  return (
    <div className="log-tab" data-testid="history-tab">
      <p className="bracket">{captainName} · your recent battles</p>
      {unsent.length > 0 ? (
        <div className="pending-banner" role="status" data-testid="pending-banner">
          <span>
            {unsent.length === 1 ? '1 battle is waiting to be saved.' : `${unsent.length} battles are waiting to be saved.`}
          </span>
          <GameButton size="small" variant="secondary" data-testid="pending-retry" onClick={() => requeue()}>
            Retry now
          </GameButton>
        </div>
      ) : null}
      <QueryState
        isPending={query.isPending}
        isError={query.isError}
        isFetching={query.isFetching}
        isPlaceholderData={query.isPlaceholderData}
        error={query.error}
        hasData={data !== undefined}
        onRetry={() => void query.refetch()}
      />
      {data ? (
        data.items.length === 0 ? (
          <p className="log-state" data-testid="log-empty">
            No battles yet. Your finished battles will appear here.
          </p>
        ) : (
          <table className="log-table" data-testid="history-table" aria-busy={query.isFetching}>
            <caption className="visually-hidden">Your match history, newest first</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Points</th>
                <th scope="col">Duration</th>
                <th scope="col">Result</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((match) => {
                const played = formatPlayedAt(match.playedAt);
                return (
                  <tr key={match.matchId} data-testid="history-row" data-match-id={match.matchId}>
                    <th scope="row">
                      {played.day} <span className="played">· {played.time}</span>
                    </th>
                    <td className="points">{match.score}</td>
                    <td>{formatDurationMs(match.durationMs)}</td>
                    <td className={`reason reason--${match.endReason}`}>{match.endReason === 'time_up' ? 'Time up' : 'Defeated'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )
      ) : null}
      {data && data.items.length > 0 ? (
        <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} busy={query.isFetching} />
      ) : null}
    </div>
  );
}

export function CaptainsLog({ tab }: { tab: LogTab }) {
  const options = useSyncExternalStore(optionsStore.subscribe, optionsStore.getSnapshot);
  const tabRefs = useRef<Record<LogTab, HTMLButtonElement | null>>({ ranking: null, history: null });
  const [focusTab, setFocusTab] = useState(false);

  useEffect(() => {
    if (focusTab) tabRefs.current[tab]?.focus();
  }, [tab, focusTab]);

  const select = (next: LogTab, focus: boolean) => {
    setFocusTab(focus);
    navigate({ name: 'log', tab: next }, { replace: true });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = TABS.findIndex((t) => t.id === tab);
    let next: number | null = null;
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TABS.length - 1;
    const target = next === null ? undefined : TABS[next];
    if (!target) return;
    event.preventDefault();
    select(target.id, true);
  };

  return (
    <main className="scene" id="main">
      <Panel wide aria-labelledby="log-title">
        <ScreenHeading id="log-title">Captain’s Log</ScreenHeading>
        <div className="btn-row" role="tablist" aria-label="Captain’s log" onKeyDown={onKeyDown}>
          {TABS.map((t) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              className="btn btn--secondary btn--small"
              data-testid={`tab-${t.id}`}
              onClick={() => select(t.id, false)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="log-panel">
          {tab === 'ranking' ? (
            <RankingTab
              initialConfig={{ sessionDurationSec: options.sessionDurationSec, spawnIntervalSec: options.spawnIntervalSec }}
            />
          ) : (
            <HistoryTab captainName={options.captainName} />
          )}
        </div>
        <GameButton sound="ui_back" data-testid="log-menu" onClick={() => navigate({ name: 'menu' })}>
          Main Menu
        </GameButton>
      </Panel>
    </main>
  );
}
