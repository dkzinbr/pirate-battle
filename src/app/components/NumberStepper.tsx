import { useId } from 'react';
import { IconButton } from './Buttons';

interface NumberStepperProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
  error?: string | undefined;
  hint?: string;
  testId?: string;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** Numeric field with +/- buttons; keeps the raw text so invalid input can be reported. */
export function NumberStepper({ label, value, onChange, min, max, step, unit, error, hint, testId }: NumberStepperProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const numeric = Number(value);
  const valid = value.trim() !== '' && Number.isFinite(numeric);

  const nudge = (direction: 1 | -1) => {
    const base = valid ? numeric : direction > 0 ? min - step : max + step;
    const snapped = Math.round((base - min) / step) * step + min;
    const next = Math.min(max, Math.max(min, snapped + direction * step));
    onChange(formatNumber(Math.round(next * 100) / 100));
  };

  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="stepper">
        <IconButton icon="minus" label={`Decrease ${label.toLowerCase()}`} onClick={() => nudge(-1)} disabled={valid && numeric <= min} />
        <div>
          <input
            id={id}
            data-testid={testId}
            type="number"
            inputMode="decimal"
            min={min}
            max={max}
            step={step}
            value={value}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy || undefined}
            onChange={(event) => onChange(event.target.value)}
          />
        </div>
        <IconButton icon="plus" label={`Increase ${label.toLowerCase()}`} onClick={() => nudge(1)} disabled={valid && numeric >= max} />
      </div>
      <span className="field__hint" id={hintId}>
        {hint ?? `${formatNumber(min)}–${formatNumber(max)} ${unit}`}
      </span>
      {error ? (
        <span className="field__error" id={errorId} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
