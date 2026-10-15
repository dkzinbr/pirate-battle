import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';
import { applyScenarioFromUrl } from './scenarios';

/**
 * Starts the mock API. It runs in every build, including the published one,
 * because the challenge has no real backend. Failure to start (e.g. service
 * workers disabled) only affects ranking/history, never the game.
 */
export async function startMockApi(): Promise<boolean> {
  applyScenarioFromUrl(window.location.search);
  if (!('serviceWorker' in navigator)) {
    console.warn('[mocks] Service workers are unavailable; ranking and history will be offline.');
    return false;
  }
  try {
    const worker = setupWorker(...handlers);
    await worker.start({
      serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
      onUnhandledRequest: 'bypass',
      quiet: true,
    });
    return true;
  } catch (error) {
    console.warn('[mocks] Mock API could not start; ranking and history will be offline.', error);
    return false;
  }
}
