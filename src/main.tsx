import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createQueryClient } from './api/queryClient';
import { App } from './app/App';
import { normalizeInitialRoute } from './app/router';
import './app/styles/theme.css';
import './app/styles/screens.css';
import { audio } from './audio/AudioEngine';
import { startMockApi } from './mocks/browser';
import { optionsStore } from './settings/options';
import { initE2EBridge } from './testing/e2eBridge';

async function bootstrap(): Promise<void> {
  initE2EBridge(window.location.search);
  normalizeInitialRoute();
  audio.setEnabled(optionsStore.getSnapshot().soundEnabled);
  // Unlock Web Audio on the first gesture anywhere (autoplay policy).
  const unlock = () => {
    audio.unlock();
  };
  window.addEventListener('pointerdown', unlock, { once: true, capture: true });
  window.addEventListener('keydown', unlock, { once: true, capture: true });

  // Ranking/history are mocked in every environment; a failure here never blocks the game.
  await startMockApi();

  const container = document.getElementById('root');
  if (!container) throw new Error('Missing #root element');
  createRoot(container).render(
    <StrictMode>
      <App queryClient={createQueryClient()} />
    </StrictMode>,
  );
}

void bootstrap();
