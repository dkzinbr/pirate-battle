import { useSyncExternalStore } from 'react';
import type { ExternalStore } from '../../shared/externalStore';
import { formatClock } from '../../shared/format';
import type { HudState } from '../../game/GameSession';
import { Icon, IconButton } from '../components/Buttons';

/** `fill_rect` of the health sprites in ui_sheet.json: x 30, width 196, sprite width 256. */
const FILL = { x: 30, w: 196, sprite: 256 } as const;

function fillInsetPercent(ratio: number): number {
  const visibleRight = FILL.x + FILL.w * Math.max(0, Math.min(1, ratio));
  return ratio <= 0 ? 100 : ((FILL.sprite - visibleRight) / FILL.sprite) * 100;
}

interface HudProps {
  store: ExternalStore<HudState>;
  onPause: () => void;
}

/** DOM overlay synced from the simulation only when displayed values change. */
export function Hud({ store, onPause }: HudProps) {
  const hud = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const ratio = hud.maxHealth > 0 ? hud.health / hud.maxHealth : 0;
  const fill = ratio > 0.66 ? 'green' : ratio > 0.33 ? 'amber' : 'red';
  const lowTime = hud.timeLeftSec <= 10 && hud.phase === 'running';

  return (
    <div className="hud" data-testid="hud">
      <div className="hud__health" role="group" aria-label="Ship health">
        <Icon name="heart" className="hud__heart" />
        <div
          className="hud__bar"
          role="meter"
          aria-label="Health"
          aria-valuemin={0}
          aria-valuemax={hud.maxHealth}
          aria-valuenow={hud.health}
        >
          <div className={`hud__fill hud__fill--${fill}`} style={{ clipPath: `inset(0 ${fillInsetPercent(ratio)}% 0 0)` }} />
          <span className="hud__bar-text" data-testid="hud-health">
            {hud.health} / {hud.maxHealth}
          </span>
        </div>
      </div>
      <div className="hud__right">
        <div className="hud__counter" aria-label={`Score ${hud.score}`}>
          <Icon name="score" />
          <span data-testid="hud-score">{hud.score}</span>
        </div>
        <div className={`hud__counter${lowTime ? ' hud__counter--warning' : ''}`} aria-label={`Time left ${formatClock(hud.timeLeftSec)}`}>
          <Icon name="time" />
          <time data-testid="hud-time">{formatClock(hud.timeLeftSec)}</time>
        </div>
        <IconButton icon="pause" label="Pause" className="hud__pause" data-testid="hud-pause" onClick={onPause} disabled={hud.phase !== 'running'} />
      </div>
    </div>
  );
}
