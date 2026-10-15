import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { HudState } from '../../game/GameSession';
import type { ExternalStore } from '../../shared/externalStore';
import { formatClock } from '../../shared/format';

const PAUSE_TEXT = {
  manual: 'Game paused.',
  blur: 'Game paused because the window lost focus.',
  hidden: 'Game paused because the tab was hidden.',
  orientation: 'Game paused. Rotate your device to landscape.',
} as const;

/**
 * Screen reader companion of the HUD. The summary is always readable, while
 * the live region only speaks on discrete events (score, pause, warnings,
 * end) instead of every second.
 */
export function MatchAnnouncer({ store }: { store: ExternalStore<HudState> }) {
  const hud = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [message, setMessage] = useState('Battle started.');
  const previous = useRef(hud);

  useEffect(() => {
    const prev = previous.current;
    previous.current = hud;
    let next: string | null = null;
    if (hud.phase === 'paused' && prev.phase !== 'paused' && hud.pauseReason) next = PAUSE_TEXT[hud.pauseReason];
    else if (hud.phase === 'running' && prev.phase === 'paused') next = 'Game resumed.';
    else if ((hud.phase === 'ending' || hud.phase === 'ended') && prev.phase === 'running')
      next = hud.endReason === 'destroyed' ? `Your ship was sunk. Final score ${hud.score}.` : `Time is up. Final score ${hud.score}.`;
    else if (hud.score !== prev.score) next = `Score ${hud.score}.`;
    else if (hud.health <= hud.maxHealth * 0.33 && prev.health > prev.maxHealth * 0.33) next = 'Warning: hull integrity low.';
    else if ((hud.timeLeftSec === 30 || hud.timeLeftSec === 10) && prev.timeLeftSec !== hud.timeLeftSec)
      next = `${hud.timeLeftSec} seconds left.`;
    if (next) setMessage(next);
  }, [hud]);

  const state =
    hud.phase === 'paused' ? 'Paused' : hud.phase === 'running' ? 'In battle' : hud.endReason === 'destroyed' ? 'Sunk' : 'Time up';

  return (
    <section className="visually-hidden" aria-label="Match status">
      <dl data-testid="match-status">
        <dt>State</dt>
        <dd data-testid="status-state">{state}</dd>
        <dt>Score</dt>
        <dd data-testid="status-score">{hud.score}</dd>
        <dt>Time left</dt>
        <dd data-testid="status-time">{formatClock(hud.timeLeftSec)}</dd>
        <dt>Health</dt>
        <dd>
          {hud.health} of {hud.maxHealth}
        </dd>
      </dl>
      <p role="status" aria-live="polite" data-testid="match-announcement">
        {message}
      </p>
    </section>
  );
}
