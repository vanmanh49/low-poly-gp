// Race clock text: m:ss.mmm, truncated (never rounds up to the next second).
export function formatTime(seconds) {
  if (seconds === null || seconds === undefined) return '--:--.---';
  const ms = Math.floor(seconds * 1000);
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${String(s).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
}

export function ordinal(n) {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th');
  return `${n}${suffix}`;
}
