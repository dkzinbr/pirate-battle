import { useQueryClient } from '@tanstack/react-query';
import { useId, useState, useSyncExternalStore } from 'react';
import { DEFAULT_TIMEOUT_MS, getApiTimeoutMs, setApiTimeoutMs, TIMEOUT_LIMITS } from '../../api/http';
import { requeue, submissionStore, unsentEntries } from '../../api/submissionStore';
import { mockDb } from '../../mocks/db';
import { createPlayerHistoryFixtures } from '../../mocks/fixtures';
import { DEFAULT_MOCK_SETTINGS, mockSettingsStore, SCENARIO_IDS, SCENARIOS, updateMockSettings } from '../../mocks/scenarios';
import { optionsStore } from '../../settings/options';
import { getProfile } from '../../settings/profile';
import { clearAppStorage } from '../../shared/storage';
import { GameButton } from './Buttons';
import { Dialog } from './Dialog';

/**
 * Developer/demo panel for the mocked REST API: pick a reproducible network
 * scenario, tune the client timeout and restore the initial state.
 * Available in the published build on purpose.
 */
export function NetworkLab({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const settings = useSyncExternalStore(mockSettingsStore.subscribe, mockSettingsStore.getSnapshot);
  const submissions = useSyncExternalStore(submissionStore.subscribe, submissionStore.getSnapshot);
  const [timeoutMs, setTimeoutMs] = useState(String(getApiTimeoutMs()));
  const [message, setMessage] = useState('');
  const groupId = useId();
  const unsent = unsentEntries(submissions).length;

  const refreshData = () => {
    void queryClient.invalidateQueries();
  };

  return (
    <Dialog title="Network lab" wide onDismiss={onClose}>
      <p className="muted">
        Ranking and match history are served by a mock REST API (MSW) running in your browser. Choose how it behaves.
      </p>
      <fieldset className="lab-scenarios" aria-describedby={`${groupId}-desc`}>
        <legend>Scenario</legend>
        <p id={`${groupId}-desc`} className="visually-hidden">
          Applies immediately to every following request.
        </p>
        {SCENARIO_IDS.map((id) => (
          <label key={id} className="lab-scenario">
            <input
              type="radio"
              name={`${groupId}-scenario`}
              value={id}
              checked={settings.scenario === id}
              data-testid={`scenario-${id}`}
              onChange={() => {
                updateMockSettings({ scenario: id });
                setMessage(`Scenario set to “${SCENARIOS[id].label}”.`);
                if (id === 'normal' || id === 'instant') requeue();
              }}
            />
            <span>
              <strong>{SCENARIOS[id].label}</strong>
              <small>{SCENARIOS[id].description}</small>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="lab-grid">
        <label className="field">
          <span className="field__label">Latency seed</span>
          <input
            className="text-input"
            type="number"
            value={settings.seed}
            onChange={(event) => {
              const seed = Number(event.target.value);
              if (Number.isFinite(seed)) updateMockSettings({ seed });
            }}
          />
        </label>
        <label className="field">
          <span className="field__label">Client timeout (ms)</span>
          <input
            className="text-input"
            type="number"
            min={TIMEOUT_LIMITS.min}
            max={TIMEOUT_LIMITS.max}
            step={500}
            value={timeoutMs}
            onChange={(event) => {
              setTimeoutMs(event.target.value);
              const ms = Number(event.target.value);
              if (Number.isFinite(ms) && ms >= TIMEOUT_LIMITS.min) setApiTimeoutMs(ms);
            }}
          />
        </label>
      </div>

      <div className="btn-row">
        <GameButton
          size="small"
          variant="secondary"
          data-testid="lab-retry-pending"
          disabled={unsent === 0}
          onClick={() => {
            requeue();
            setMessage('Retrying pending battles.');
          }}
        >
          Retry pending ({unsent})
        </GameButton>
        <GameButton
          size="small"
          variant="secondary"
          data-testid="lab-seed-history"
          onClick={() => {
            mockDb.insertMany(createPlayerHistoryFixtures(getProfile().playerId, optionsStore.getSnapshot().captainName, Date.now()));
            refreshData();
            setMessage('Added 12 sample battles to your history.');
          }}
        >
          Seed my history
        </GameButton>
        <GameButton
          size="small"
          variant="secondary"
          data-testid="lab-reset"
          onClick={() => {
            mockDb.reset();
            updateMockSettings(DEFAULT_MOCK_SETTINGS);
            setApiTimeoutMs(DEFAULT_TIMEOUT_MS);
            setTimeoutMs(String(DEFAULT_TIMEOUT_MS));
            refreshData();
            setMessage('Mock server restored to its initial fixtures and the Normal scenario.');
          }}
        >
          Reset mock API
        </GameButton>
        <GameButton
          size="small"
          variant="secondary"
          data-testid="lab-clear-all"
          onClick={() => {
            if (!window.confirm('Erase all local data (options, last result, pending battles and mock server)?')) return;
            clearAppStorage();
            // Every store re-initialises from empty storage on a fresh load.
            window.location.replace(window.location.pathname);
          }}
        >
          Erase local data
        </GameButton>
      </div>
      <p role="status" className="status-message status-message--success">
        {message}
      </p>
      <GameButton onClick={onClose} sound="ui_close" data-testid="lab-close">
        Close
      </GameButton>
    </Dialog>
  );
}
