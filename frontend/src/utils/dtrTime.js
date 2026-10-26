/** Format a Philippine clock value without parsing it in the browser's timezone. */
export function formatDtrTime(value) {
  if (!value) return '';
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?$/.exec(value);
  if (!match) return value;
  const hour = Number(match[1]);
  const seconds = Number(match[3]) > 0 ? `:${match[3]}` : '';
  return `${hour % 12 || 12}:${match[2]}${seconds} ${hour >= 12 ? 'PM' : 'AM'}`;
}

/** Preserve full scan precision when opening a timestamp in a DTR time editor. */
export function getPhtDtrTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hourCycle: 'h23',
  }).format(date);
  return time.endsWith(':00.000') ? time.slice(0, 5) : time.replace(/\.000$/, '');
}
