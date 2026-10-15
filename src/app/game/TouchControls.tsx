import type { PointerEvent } from 'react';
import type { ControlInput, ControlName } from '../../game/input/ControlInput';
import { iconSources, type IconName } from '../components/icons';

interface PadButton {
  control: ControlName;
  icon: IconName;
  label: string;
  raised?: boolean;
}

const STEERING: readonly PadButton[] = [
  { control: 'turnLeft', icon: 'turn_left', label: 'Turn left' },
  { control: 'forward', icon: 'forward', label: 'Sail forward', raised: true },
  { control: 'turnRight', icon: 'turn_right', label: 'Turn right' },
];

const WEAPONS: readonly PadButton[] = [
  { control: 'fireLeft', icon: 'fire_left', label: 'Fire left broadside' },
  { control: 'fireFront', icon: 'fire_front', label: 'Fire bow cannon', raised: true },
  { control: 'fireRight', icon: 'fire_right', label: 'Fire right broadside' },
];

function TouchButton({ input, button }: { input: ControlInput; button: PadButton }) {
  const { src, srcSet } = iconSources(button.icon);

  const press = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointers (tests, some browsers) cannot be captured.
    }
    event.currentTarget.dataset.pressed = 'true';
    input.press(`pointer:${event.pointerId}`, button.control);
  };

  const release = (event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.dataset.pressed = 'false';
    input.release(`pointer:${event.pointerId}`);
  };

  return (
    <button
      type="button"
      tabIndex={-1}
      className={`round-btn touch-btn${button.raised ? ' touch-btn--raised' : ''}`}
      aria-label={button.label}
      data-testid={`touch-${button.control}`}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(event) => event.preventDefault()}
    >
      <img src={src} srcSet={srcSet} alt="" draggable={false} />
    </button>
  );
}

/** On-screen pads for touch devices. Each finger is tracked separately, so steering and firing combine. */
export function TouchControls({ input }: { input: ControlInput }) {
  return (
    <div className="touch-controls" data-testid="touch-controls">
      <div className="touch-pad touch-pad--left" role="group" aria-label="Steering">
        {STEERING.map((button) => (
          <TouchButton key={button.control} input={input} button={button} />
        ))}
      </div>
      <div className="touch-pad touch-pad--right" role="group" aria-label="Cannons">
        {WEAPONS.map((button) => (
          <TouchButton key={button.control} input={input} button={button} />
        ))}
      </div>
    </div>
  );
}
