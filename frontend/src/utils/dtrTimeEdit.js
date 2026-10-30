/** Parse typed clock values without the browser's segmented AM/PM input state. */
export function normalizeDtrTimeInput(value) {
  const input = String(value ?? '').trim();
  if (!input) return '';
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}(?:\.\d{1,3})?))?\s*(AM|PM)?$/i.exec(input);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] || 0);
  const period = match[4]?.toUpperCase();
  if (minutes > 59 || seconds >= 60 || hours > (period ? 12 : 23) || (period && hours < 1)) return null;
  if (period) hours = hours % 12 + (period === 'PM' ? 12 : 0);
  const clock = `${String(hours).padStart(2, '0')}:${match[2]}`;
  if (!seconds) return clock;
  const [whole, fraction] = seconds.toFixed(3).split('.');
  const decimals = fraction.replace(/0+$/, '');
  return `${clock}:${whole.padStart(2, '0')}${decimals ? `.${decimals}` : ''}`;
}

/** Blank and unchanged fields are omitted so either time can be edited alone. */
export function buildDtrTimeChanges(timeIn, timeOut, originalTimes) {
  const changes = {};
  for (const [field, label, value, original] of [
    ['time_in', 'Time In', timeIn, originalTimes.timeIn],
    ['time_out', 'Time Out', timeOut, originalTimes.timeOut],
  ]) {
    const normalized = normalizeDtrTimeInput(value);
    if (normalized === null) throw new Error(`Enter a valid ${label}, such as 08:00 or 17:00 (5:00 PM).`);
    changes[field] = normalized && normalized !== normalizeDtrTimeInput(original) ? normalized : null;
  }
  if (!changes.time_in && !changes.time_out) throw new Error('Change Time In or Time Out before saving.');
  return changes;
}

/** Match DTR totals: retain overtime and exclude overlap with 12:00–13:00. */
export function estimateDtrScheduleHours(timeIn, timeOut) {
  const clocks = [timeIn, timeOut].map(normalizeDtrTimeInput);
  if (clocks.some(clock => !clock)) return null;
  const [start, end] = clocks.map(clock => {
    const [hours, minutes, seconds = 0] = clock.split(':').map(Number);
    return hours * 3600 + minutes * 60 + seconds;
  });
  if (end <= start) return null;
  const lunchOverlap = Math.max(0, Math.min(end, 13 * 3600) - Math.max(start, 12 * 3600));
  return { hours: ((end - start - lunchOverlap) / 3600).toFixed(1).replace(/\.0$/, '') };
}
