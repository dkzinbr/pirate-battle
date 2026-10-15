import type { ControlInput } from './ControlInput';
import { controlForKey, PAUSE_KEYS } from './ControlInput';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * Captures gameplay keys only while attached (i.e. while the combat screen is
 * mounted). Keys are swallowed (preventDefault) only when they are consumed,
 * so menus, dialogs and form fields keep their native keyboard behaviour.
 */
export class KeyboardController {
  private readonly input: ControlInput;
  private readonly onPauseKey: () => void;
  private attached = false;

  constructor(input: ControlInput, onPauseKey: () => void) {
    this.input = input;
    this.onPauseKey = onPauseKey;
  }

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.altKey || event.ctrlKey || event.metaKey || isEditableTarget(event.target)) return;
    if (!this.input.isEnabled) return;
    if (PAUSE_KEYS.includes(event.code)) {
      event.preventDefault();
      if (!event.repeat) this.onPauseKey();
      return;
    }
    const control = controlForKey(event.code);
    if (!control) return;
    event.preventDefault();
    if (!event.repeat) this.input.press(`key:${event.code}`, control);
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    if (!controlForKey(event.code)) return;
    this.input.release(`key:${event.code}`);
  };
}
