import { type ReactNode, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { audio } from '../../audio/AudioEngine';

interface DialogProps {
  title: string;
  /** Visually hide the title when the content already shows it. */
  hideTitle?: boolean;
  wide?: boolean;
  onDismiss?: (() => void) | undefined;
  initialFocusSelector?: string;
  children: ReactNode;
  describedBy?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal: traps Tab focus, closes on Escape (when dismissible),
 * makes the rest of the page inert and restores focus to the opener.
 */
export function Dialog({ title, hideTitle, wide, onDismiss, initialFocusSelector, children, describedBy }: DialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const dismissRef = useRef(onDismiss);

  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = document.getElementById('root');
    root?.setAttribute('inert', '');
    audio.play('ui_open', { volume: 0.5 });

    const panel = panelRef.current;
    const target =
      (initialFocusSelector ? panel?.querySelector<HTMLElement>(initialFocusSelector) : null) ??
      panel?.querySelector<HTMLElement>(FOCUSABLE) ??
      panel;
    target?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissRef.current) {
        event.preventDefault();
        event.stopPropagation();
        dismissRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      root?.removeAttribute('inert');
      if (opener?.isConnected) opener.focus();
    };
  }, [initialFocusSelector]);

  return createPortal(
    <div className="dialog-backdrop">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        {...(describedBy ? { 'aria-describedby': describedBy } : {})}
        tabIndex={-1}
        className={['panel', wide && 'panel--wide'].filter(Boolean).join(' ')}
      >
        <div className="panel__body">
          <h2 id={titleId} className={hideTitle ? 'visually-hidden' : undefined}>
            {title}
          </h2>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
