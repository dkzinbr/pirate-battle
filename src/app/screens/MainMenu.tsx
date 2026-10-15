import { useState, useSyncExternalStore } from 'react';
import { submissionStore, unsentEntries } from '../../api/submissionStore';
import { GameButton } from '../components/Buttons';
import { ControlsHelp } from '../components/ControlsHelp';
import { NetworkLab } from '../components/NetworkLab';
import { Panel } from '../components/Panel';
import { ScreenHeading } from '../components/ScreenHeading';
import { navigate } from '../router';

export function MainMenu() {
  const [labOpen, setLabOpen] = useState(false);
  // Only tall screens start with the help expanded, so every action fits without scrolling.
  const [helpOpenByDefault] = useState(() => window.matchMedia('(min-height: 820px)').matches);
  const submissions = useSyncExternalStore(submissionStore.subscribe, submissionStore.getSnapshot);
  const unsent = unsentEntries(submissions).length;

  return (
    <main className="scene" id="main">
      <Panel aria-labelledby="menu-title">
        <ScreenHeading id="menu-title" className="visually-hidden">
          Pirate Battle
        </ScreenHeading>
        <div className="title-art" role="img" aria-label="Pirate Battle" />
        <p className="tagline">Set sail. Take command.</p>
        <nav className="btn-stack" aria-label="Main menu">
          <GameButton data-testid="menu-play" onClick={() => navigate({ name: 'play' })}>
            Play
          </GameButton>
          <GameButton data-testid="menu-options" onClick={() => navigate({ name: 'options' })}>
            Options
          </GameButton>
        </nav>
        <div className="btn-row" role="group" aria-label="Captain's log">
          <GameButton variant="secondary" size="small" data-testid="menu-ranking" onClick={() => navigate({ name: 'log', tab: 'ranking' })}>
            Ranking
          </GameButton>
          <GameButton variant="secondary" size="small" data-testid="menu-history" onClick={() => navigate({ name: 'log', tab: 'history' })}>
            Match History
          </GameButton>
        </div>
        {unsent > 0 ? (
          <p className="muted" role="status" data-testid="menu-pending">
            {unsent === 1 ? '1 battle is waiting to be saved.' : `${unsent} battles are waiting to be saved.`}
          </p>
        ) : null}
        <details className="disclosure" open={helpOpenByDefault}>
          <summary>How to play</summary>
          <ControlsHelp />
          <p className="muted" style={{ fontSize: '0.72rem', marginTop: 6 }}>
            Sink chasers before they ram you and keep moving to dodge shooters. Each enemy sunk by your cannons scores 1 point.
          </p>
        </details>
        <button type="button" className="link-btn" data-testid="open-network-lab" onClick={() => setLabOpen(true)}>
          Network lab (mock API scenarios)
        </button>
      </Panel>
      {labOpen ? <NetworkLab onClose={() => setLabOpen(false)} /> : null}
    </main>
  );
}
