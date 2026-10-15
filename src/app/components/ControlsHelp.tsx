export function ControlsHelp({ compact = false }: { compact?: boolean }) {
  return (
    <dl className="controls-help" aria-label="Controls">
      <dt>Sail forward</dt>
      <dd>
        <kbd>W</kbd> / <kbd>↑</kbd>
      </dd>
      <dt>Turn</dt>
      <dd>
        <kbd>A</kbd> <kbd>D</kbd> / <kbd>←</kbd> <kbd>→</kbd>
      </dd>
      <dt>Bow cannon</dt>
      <dd>
        <kbd>Space</kbd> / <kbd>K</kbd>
      </dd>
      <dt>Broadsides</dt>
      <dd>
        <kbd>Q</kbd> left · <kbd>E</kbd> right
      </dd>
      <dt>Pause</dt>
      <dd>
        <kbd>P</kbd> / <kbd>Esc</kbd>
      </dd>
      {!compact && (
        <>
          <dt>Touch</dt>
          <dd>Left pad steers, right pad fires</dd>
        </>
      )}
    </dl>
  );
}
