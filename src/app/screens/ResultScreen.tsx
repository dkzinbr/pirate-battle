import { useSyncExternalStore } from 'react';
import { requeue, type SubmissionEntry, submissionStore } from '../../api/submissionStore';
import { lastResultStore } from '../../game/lastResult';
import { formatDurationMs } from '../../shared/format';
import { GameButton } from '../components/Buttons';
import { Panel } from '../components/Panel';
import { ScreenHeading } from '../components/ScreenHeading';
import { navigate } from '../router';

function RecordStatus({ entry }: { entry: SubmissionEntry | undefined }) {
  if (!entry) {
    return (
      <p className="record-status" data-testid="record-status" data-status="unknown">
        Record status unavailable.
      </p>
    );
  }
  const text: Record<SubmissionEntry['status'], string> = {
    pending: 'Waiting to save this battle to the Captain’s Log…',
    sending: 'Saving this battle to the Captain’s Log…',
    confirmed: 'Saved to the Captain’s Log.',
    failed: 'Not saved yet. Your result is kept on this device.',
  };
  return (
    <div className="record-status-box">
      <p
        className={`record-status record-status--${entry.status}`}
        role={entry.status === 'failed' ? 'alert' : 'status'}
        data-testid="record-status"
        data-status={entry.status}
      >
        {text[entry.status]}
      </p>
      {entry.status === 'failed' ? (
        <>
          {entry.lastError ? <p className="muted">{entry.lastError}</p> : null}
          <GameButton size="small" variant="secondary" data-testid="record-retry" onClick={() => requeue([entry.record.matchId])}>
            Try again
          </GameButton>
        </>
      ) : null}
    </div>
  );
}

export function ResultScreen() {
  const result = useSyncExternalStore(lastResultStore.subscribe, lastResultStore.getSnapshot);
  const submissions = useSyncExternalStore(submissionStore.subscribe, submissionStore.getSnapshot);

  if (!result) {
    return (
      <main className="scene" id="main">
        <Panel aria-labelledby="result-title">
          <ScreenHeading id="result-title">No battle yet</ScreenHeading>
          <p className="muted">Finish a battle to see its result here.</p>
          <GameButton onClick={() => navigate({ name: 'menu' })}>Main Menu</GameButton>
        </Panel>
      </main>
    );
  }

  const { record } = result;
  const reason = record.endReason === 'time_up' ? 'Time up' : 'Ship sunk';

  return (
    <main className="scene" id="main">
      <Panel aria-labelledby="result-title" data-testid="result-panel">
        <ScreenHeading id="result-title">{record.endReason === 'time_up' ? 'Battle complete' : 'Ship sunk'}</ScreenHeading>
        <p className="result-score" data-testid="result-score" aria-label={`${record.score} points`}>
          {record.score}
        </p>
        <p className="result-meta">
          <span>Points</span> · <span data-testid="result-duration">{formatDurationMs(record.durationMs)}</span> ·{' '}
          <span data-testid="result-reason">{reason}</span>
        </p>
        <p className="muted fine-print">
          {record.config.sessionDurationSec} s battle · {record.config.spawnIntervalSec} s spawn interval
        </p>
        <RecordStatus entry={submissions[record.matchId]} />
        <div className="btn-stack">
          <GameButton data-testid="result-play-again" onClick={() => navigate({ name: 'play' })}>
            Play Again
          </GameButton>
          <GameButton data-testid="result-menu" sound="ui_back" onClick={() => navigate({ name: 'menu' })}>
            Main Menu
          </GameButton>
        </div>
      </Panel>
    </main>
  );
}
