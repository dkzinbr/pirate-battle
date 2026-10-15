import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { MatchRecord } from '../../api/contracts';
import { enqueueSubmission } from '../../api/submissionStore';
import { assetLoader } from '../../game/assets/AssetLoader';
import { createMatchConfig, type GameConfig } from '../../game/config';
import { randomSeed } from '../../game/core/rng';
import type { MatchSummary } from '../../game/core/types';
import { GameSession } from '../../game/GameSession';
import { saveLastResult } from '../../game/lastResult';
import { acquirePixiHost } from '../../game/render/pixiHost';
import { optionsStore } from '../../settings/options';
import { getProfile } from '../../settings/profile';
import { createId } from '../../shared/id';
import { getE2EOptions, registerSession } from '../../testing/e2eBridge';
import { GameButton } from '../components/Buttons';
import { Panel } from '../components/Panel';
import { Hud } from '../game/Hud';
import { MatchAnnouncer } from '../game/MatchAnnouncer';
import { PauseDialog } from '../game/PauseDialog';
import { TouchControls } from '../game/TouchControls';
import { usePortrait, useTouchDevice } from '../game/useDeviceTraits';
import { navigate } from '../router';

interface GameScreenProps {
  onRestart: () => void;
}

function buildRecord(summary: MatchSummary, config: GameConfig, captainName: string): MatchRecord {
  return {
    matchId: createId(),
    playerId: getProfile().playerId,
    playerName: captainName,
    playedAt: new Date().toISOString(),
    score: summary.score,
    durationMs: summary.durationMs,
    endReason: summary.endReason,
    config: { sessionDurationSec: config.match.durationSec, spawnIntervalSec: config.spawn.intervalSec },
  };
}

export function GameScreen({ onRestart }: GameScreenProps) {
  // Snapshot of the options at match start; later changes only affect new matches.
  const [setup] = useState(() => {
    const options = optionsStore.getSnapshot();
    const e2e = getE2EOptions();
    return {
      captainName: options.captainName,
      config: createMatchConfig(options, e2e.overrides ?? undefined),
      seed: e2e.seed ?? randomSeed(),
      manualClock: e2e.manualClock,
    };
  });
  const loadState = useSyncExternalStore(assetLoader.state.subscribe, assetLoader.state.getSnapshot);
  const [attempt, setAttempt] = useState(0);
  const [session, setSession] = useState<GameSession | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const touch = useTouchDevice();
  const portrait = usePortrait();

  useEffect(() => {
    let cancelled = false;
    let created: GameSession | null = null;

    const onEnded = (summary: MatchSummary) => {
      const record = buildRecord(summary, setup.config, setup.captainName);
      // Persist before any network attempt so the result can never be lost.
      enqueueSubmission(record);
      saveLastResult({ record, enemiesSpawned: summary.enemiesSpawned });
      navigate({ name: 'result' }, { replace: true });
    };

    Promise.all([acquirePixiHost(), assetLoader.load()])
      .then(([host, textures]) => {
        const container = hostRef.current;
        if (cancelled || !container) return;
        created = new GameSession({
          host,
          textures,
          config: setup.config,
          seed: setup.seed,
          manualClock: setup.manualClock,
          onEnded,
        });
        created.mount(container);
        registerSession(created);
        setSession(created);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Unknown error';
        setStartError(message);
      });

    return () => {
      cancelled = true;
      if (created) {
        registerSession(null);
        created.destroy();
      }
      setSession(null);
    };
  }, [attempt, setup]);

  const hud = useSyncExternalStore(
    session?.hud.subscribe ?? noopSubscribe,
    session?.hud.getSnapshot ?? nullSnapshot,
  );

  useEffect(() => {
    if (session && touch && portrait) session.pause('orientation');
  }, [session, touch, portrait]);

  const failed = startError !== null || loadState.status === 'error';
  const loading = !session && !failed;

  return (
    <main className="game-screen" id="main" aria-label="Battle">
      <h1 className="visually-hidden">Battle</h1>
      <div className="arena-frame" data-testid="arena">
        <div ref={hostRef} className="arena-host" />
        {session ? (
          <>
            <Hud store={session.hud} onPause={() => session.pause('manual')} />
            {touch ? <TouchControls input={session.input} /> : <KeyboardHint />}
            <MatchAnnouncer store={session.hud} />
          </>
        ) : null}
      </div>

      {loading ? (
        <div className="overlay" data-testid="loading">
          <Panel aria-labelledby="loading-title">
            <h2 id="loading-title">Loading battle</h2>
            <div
              className="progress"
              role="progressbar"
              aria-label="Loading assets"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(loadState.progress * 100)}
            >
              <div className="progress__fill" style={{ width: `${Math.round(loadState.progress * 100)}%` }} />
            </div>
            <p className="muted">{Math.round(loadState.progress * 100)}% · preparing ships and islands</p>
          </Panel>
        </div>
      ) : null}

      {failed ? (
        <div className="overlay" data-testid="load-error">
          <Panel aria-labelledby="load-error-title">
            <h2 id="load-error-title">Could not start the battle</h2>
            <p className="status-message status-message--error" role="alert">
              {startError ?? loadState.error ?? 'Assets failed to load.'}
            </p>
            <div className="btn-stack">
              <GameButton
                data-testid="load-retry"
                onClick={() => {
                  setStartError(null);
                  setAttempt((n) => n + 1);
                }}
              >
                Retry
              </GameButton>
              <GameButton sound="ui_back" onClick={() => navigate({ name: 'menu' })}>
                Main Menu
              </GameButton>
            </div>
          </Panel>
        </div>
      ) : null}

      {session && hud?.phase === 'paused' && !(touch && portrait) ? (
        <PauseDialog
          reason={hud.pauseReason ?? 'manual'}
          canResume
          onResume={() => session.resume()}
          onRestart={onRestart}
          onExit={() => navigate({ name: 'menu' })}
        />
      ) : null}

      {touch && portrait ? (
        <div className="overlay rotate-hint" role="alert" data-testid="rotate-hint">
          <Panel>
            <h2>Rotate your device</h2>
            <p className="muted">Battles are played in landscape. The game is paused until you rotate.</p>
          </Panel>
        </div>
      ) : null}
    </main>
  );
}

function KeyboardHint() {
  return (
    <p className="keyboard-hint" aria-hidden="true">
      <kbd>W</kbd> sail · <kbd>A</kbd>
      <kbd>D</kbd> turn · <kbd>Space</kbd> bow · <kbd>Q</kbd>/<kbd>E</kbd> broadsides · <kbd>P</kbd> pause
    </p>
  );
}

const noopSubscribe = () => () => undefined;
const nullSnapshot = () => null;
