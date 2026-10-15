import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

interface PanelProps extends HTMLAttributes<HTMLElement> {
  wide?: boolean;
  as?: 'section' | 'div';
  children: ReactNode;
}

export const Panel = forwardRef<HTMLElement, PanelProps>(function Panel(
  { wide = false, as: Tag = 'section', className, children, ...rest },
  ref,
) {
  return (
    <Tag
      ref={ref as never}
      className={['panel', wide && 'panel--wide', className].filter(Boolean).join(' ')}
      {...rest}
    >
      <div className="panel__body">{children}</div>
    </Tag>
  );
});
