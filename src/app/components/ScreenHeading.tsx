import { type ReactNode, useEffect, useRef } from 'react';

/** Screen title that receives focus on navigation so keyboard and screen reader users land on the new screen. */
export function ScreenHeading({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <h1 id={id} ref={ref} tabIndex={-1} className={className}>
      {children}
    </h1>
  );
}
