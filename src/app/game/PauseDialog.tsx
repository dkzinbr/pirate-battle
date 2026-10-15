import { useState } from 'react';
import type { PauseReason } from '../../game/GameSession';
import { GameButton } from '../components/Buttons';
import { Dialog } from '../components/Dialog';
import { OptionsForm } from '../components/OptionsForm';

const REASON_TEXT: Record<PauseReason, string> = {
  manual: 'Ready when you are.',
  blur: 'The game window lost focus.',
  hidden: 'The tab was hidden.',
  orientation: 'Rotate your device to landscape to keep playing.',
};

interface PauseDialogProps {
  reason: PauseReason;
  canResume: boolean;
  onResume: () => void;
  onRestart: () => void;
  onExit: () => void;
}

export function PauseDialog({ reason, canResume, onResume, onRestart, onExit }: PauseDialogProps) {
  const [view, setView] = useState<'menu' | 'options'>('menu');

  if (view === 'options') {
    return (
      <Dialog title="Options" onDismiss={() => setView('menu')}>
        <OptionsForm note="Changes apply to your next battle." backLabel="Back" onBack={() => setView('menu')} />
      </Dialog>
    );
  }

  return (
    <Dialog title="Paused" onDismiss={canResume ? onResume : undefined} initialFocusSelector="[data-testid='pause-resume']">
      <p className="muted" data-testid="pause-reason">
        {REASON_TEXT[reason]}
      </p>
      <div className="btn-stack">
        <GameButton data-testid="pause-resume" onClick={onResume} disabled={!canResume} sound={null}>
          Resume
        </GameButton>
        <GameButton data-testid="pause-restart" onClick={onRestart}>
          Restart
        </GameButton>
        <GameButton data-testid="pause-options" onClick={() => setView('options')}>
          Options
        </GameButton>
        <GameButton data-testid="pause-exit" onClick={onExit} sound="ui_back">
          Main Menu
        </GameButton>
      </div>
      <p className="muted" style={{ fontSize: '0.72rem' }}>
        Leaving or restarting abandons this battle; it will not be recorded.
      </p>
    </Dialog>
  );
}
