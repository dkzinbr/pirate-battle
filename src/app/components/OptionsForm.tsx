import { type SyntheticEvent, useId, useState, useSyncExternalStore } from 'react';
import { audio } from '../../audio/AudioEngine';
import { SESSION_DURATION_LIMITS, SPAWN_INTERVAL_LIMITS } from '../../game/config';
import {
  CAPTAIN_NAME_LIMITS,
  DEFAULT_OPTIONS,
  type OptionsErrors,
  optionsStore,
  type PlayerOptions,
  saveOptions,
  validateOptions,
} from '../../settings/options';
import { GameButton } from './Buttons';
import { NumberStepper } from './NumberStepper';

interface Draft {
  sessionDurationSec: string;
  spawnIntervalSec: string;
  captainName: string;
  soundEnabled: boolean;
}

function toDraft(options: PlayerOptions): Draft {
  return {
    sessionDurationSec: String(options.sessionDurationSec),
    spawnIntervalSec: String(options.spawnIntervalSec),
    captainName: options.captainName,
    soundEnabled: options.soundEnabled,
  };
}

function fromDraft(draft: Draft): PlayerOptions {
  const toNumber = (raw: string) => (raw.trim() === '' ? Number.NaN : Number(raw));
  return {
    sessionDurationSec: toNumber(draft.sessionDurationSec),
    spawnIntervalSec: toNumber(draft.spawnIntervalSec),
    captainName: draft.captainName,
    soundEnabled: draft.soundEnabled,
  };
}

interface OptionsFormProps {
  note?: string;
  onBack: () => void;
  backLabel: string;
}

export function OptionsForm({ note, onBack, backLabel }: OptionsFormProps) {
  const saved = useSyncExternalStore(optionsStore.subscribe, optionsStore.getSnapshot);
  const [draft, setDraft] = useState<Draft>(() => toDraft(saved));
  const [errors, setErrors] = useState<OptionsErrors>({});
  const [status, setStatus] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const nameId = useId();

  const parsed = fromDraft(draft);
  const dirty = JSON.stringify(parsed) !== JSON.stringify(saved);

  const update = (patch: Partial<Draft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    setStatus(null);
    // Re-validate fields that already show an error so messages clear as soon as they are fixed.
    if (Object.keys(errors).length > 0) setErrors(validateOptions(fromDraft(next)));
  };

  const onSubmit = (event: SyntheticEvent) => {
    event.preventDefault();
    const result = saveOptions(parsed);
    if (!result.ok) {
      setErrors(result.errors);
      setStatus({ kind: 'error', text: 'Fix the highlighted fields before saving.' });
      audio.play('ui_back', { volume: 0.5 });
      return;
    }
    audio.setEnabled(parsed.soundEnabled);
    setErrors({});
    setDraft(toDraft(optionsStore.getSnapshot()));
    setStatus({ kind: 'success', text: 'Options saved.' });
  };

  return (
    <form className="form-stack" onSubmit={onSubmit} noValidate aria-label="Game options">
      {note ? <p className="muted">{note}</p> : null}
      <NumberStepper
        label="Game session time"
        unit="seconds"
        testId="option-session-time"
        value={draft.sessionDurationSec}
        onChange={(value) => update({ sessionDurationSec: value })}
        min={SESSION_DURATION_LIMITS.min}
        max={SESSION_DURATION_LIMITS.max}
        step={SESSION_DURATION_LIMITS.step}
        hint={`${SESSION_DURATION_LIMITS.min}–${SESSION_DURATION_LIMITS.max} s, steps of ${SESSION_DURATION_LIMITS.step} s`}
        error={errors.sessionDurationSec}
      />
      <NumberStepper
        label="Enemy spawn time"
        unit="seconds"
        testId="option-spawn-time"
        value={draft.spawnIntervalSec}
        onChange={(value) => update({ spawnIntervalSec: value })}
        min={SPAWN_INTERVAL_LIMITS.min}
        max={SPAWN_INTERVAL_LIMITS.max}
        step={SPAWN_INTERVAL_LIMITS.step}
        hint={`${SPAWN_INTERVAL_LIMITS.min}–${SPAWN_INTERVAL_LIMITS.max} s, steps of ${SPAWN_INTERVAL_LIMITS.step} s`}
        error={errors.spawnIntervalSec}
      />
      <div className="field">
        <label htmlFor={nameId}>Captain name</label>
        <input
          id={nameId}
          className="text-input"
          data-testid="option-captain-name"
          value={draft.captainName}
          maxLength={CAPTAIN_NAME_LIMITS.max + 4}
          autoComplete="nickname"
          aria-invalid={errors.captainName ? true : undefined}
          aria-describedby={errors.captainName ? `${nameId}-error` : undefined}
          onChange={(event) => update({ captainName: event.target.value })}
        />
        {errors.captainName ? (
          <span className="field__error" id={`${nameId}-error`} role="alert">
            {errors.captainName}
          </span>
        ) : null}
      </div>
      <label className="toggle">
        <input type="checkbox" checked={draft.soundEnabled} onChange={(event) => update({ soundEnabled: event.target.checked })} />
        Sound effects
      </label>

      <p
        role="status"
        className={`status-message ${status ? `status-message--${status.kind}` : ''}`}
        data-testid="options-status"
      >
        {status?.text ?? (dirty ? 'You have unsaved changes.' : '')}
      </p>

      <div className="btn-stack">
        <GameButton type="submit" disabled={!dirty} data-testid="options-save">
          Save
        </GameButton>
        <GameButton onClick={onBack} sound="ui_back">
          {backLabel}
        </GameButton>
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            update(toDraft(DEFAULT_OPTIONS));
          }}
        >
          Restore defaults
        </button>
      </div>
    </form>
  );
}
