export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatDurationMs(ms: number): string {
  return formatClock(Math.floor(ms / 1000));
}

const dayFormatter = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' });
const timeFormatter = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

export function formatPlayedAt(iso: string): { day: string; time: string } {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { day: '--', time: '--:--' };
  return { day: dayFormatter.format(date).toUpperCase(), time: timeFormatter.format(date) };
}

export function formatRank(rank: number): string {
  return String(rank).padStart(2, '0');
}
