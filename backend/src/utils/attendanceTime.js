export const MINUTE_MS = 60 * 1000;
export const PHT_UTC_OFFSET_MINUTES = 8 * 60;
export const PHT_UTC_OFFSET_MS = PHT_UTC_OFFSET_MINUTES * MINUTE_MS;

export const WORKDAY_START_MINUTE = 8 * 60;
export const LUNCH_START_MINUTE = 12 * 60;
export const LUNCH_END_MINUTE = 13 * 60;
export const WORKDAY_END_MINUTE = 17 * 60;
export const MAX_RENDERED_MINUTES = 8 * 60;

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function validTimestamp(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  const timestamp = date.getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function validateDateKey(value) {
  const match = DATE_KEY_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));

  if (
    check.getUTCFullYear() !== year
    || check.getUTCMonth() !== month - 1
    || check.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day, dateKey: value };
}

/**
 * Returns the calendar date in Philippine time (UTC+8) as YYYY-MM-DD.
 * A bare YYYY-MM-DD value is treated as a Philippine calendar date.
 */
export function getPhtDateKey(value = new Date()) {
  if (typeof value === 'string') {
    const dateParts = validateDateKey(value);
    if (dateParts) return dateParts.dateKey;
    if (DATE_KEY_PATTERN.test(value)) {
      throw new RangeError('A valid date is required');
    }
  }

  const timestamp = validTimestamp(value);
  if (timestamp === null) {
    throw new RangeError('A valid date is required');
  }

  return new Date(timestamp + PHT_UTC_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Returns UTC ISO bounds for one Philippine calendar day.
 * `endExclusiveIso` is preferred for database queries (`>= start`, `< end`).
 * `endIso` is also supplied for APIs that require an inclusive upper bound.
 */
export function getPhtDayBoundsUtc(value = new Date()) {
  const dateKey = getPhtDateKey(value);
  const { year, month, day } = validateDateKey(dateKey);
  const startTimestamp = Date.UTC(year, month - 1, day) - PHT_UTC_OFFSET_MS;
  const endExclusiveTimestamp = startTimestamp + 24 * 60 * MINUTE_MS;

  return {
    dateKey,
    startIso: new Date(startTimestamp).toISOString(),
    endIso: new Date(endExclusiveTimestamp - 1).toISOString(),
    endExclusiveIso: new Date(endExclusiveTimestamp).toISOString(),
  };
}

function phtLocalMinuteTimestamp(dateKey, minuteOfDay) {
  const { year, month, day } = validateDateKey(dateKey);
  return Date.UTC(year, month - 1, day) - PHT_UTC_OFFSET_MS + minuteOfDay * MINUTE_MS;
}

/** Apply the regular DTR rule to the full scan instant, before display rounding. */
export function processDtrScanTime(value, scanType) {
  const timestamp = validTimestamp(value);
  if (timestamp === null || !['time_in', 'time_out'].includes(scanType)) return null;
  const boundary = phtLocalMinuteTimestamp(
    getPhtDateKey(timestamp),
    scanType === 'time_in' ? WORKDAY_START_MINUTE : WORKDAY_END_MINUTE
  );
  return new Date(scanType === 'time_in'
    ? Math.max(timestamp, boundary)
    : Math.min(timestamp, boundary)).toISOString();
}

/** Explicit recorded values (including custom schedules and corrections) win. */
export function getRecordedScanTime(log) {
  if (!log) return null;
  if (validTimestamp(log.recorded_scan_time) !== null) return log.recorded_scan_time;
  // Older corrections stored their official value in scan_time only.
  const actual = validTimestamp(log.actual_scan_time);
  const scan = validTimestamp(log.scan_time);
  if (actual !== null && scan !== null && actual !== scan) return log.scan_time;
  return processDtrScanTime(log.scan_time, log.scan_type);
}

/** Keep the API's existing scan_time display contract, without mutating stored data. */
export function toOfficialAttendanceLog(log) {
  return {
    ...log,
    scan_time: getRecordedScanTime(log),
    actual_scan_time: log.actual_scan_time === undefined ? log.scan_time : log.actual_scan_time,
  };
}

/** Philippine HH:MM, retaining nonzero seconds/fractions for DTRs and corrections. */
export function formatPhtClockTime(value) {
  const timestamp = validTimestamp(value);
  if (timestamp === null) return null;
  const time = new Date(timestamp + PHT_UTC_OFFSET_MS).toISOString().slice(11, 23);
  return time.endsWith(':00.000') ? time.slice(0, 5) : time.replace(/\.000$/, '');
}

/**
 * Calculates creditable attendance time for a single two-scan Philippine day.
 * Workday starts crediting at 08:00; time before 08:00 is ignored and actual overlap
 * with 12:00-13:00 lunch is deducted. Invalid, incomplete, reversed, and cross-date pairs earn zero.
 */
export function calculateRenderedMilliseconds(timeIn, timeOut) {
  const timeInTimestamp = validTimestamp(timeIn);
  const timeOutTimestamp = validTimestamp(timeOut);

  if (
    timeInTimestamp === null
    || timeOutTimestamp === null
    || timeOutTimestamp <= timeInTimestamp
  ) {
    return 0;
  }

  const timeInDateKey = getPhtDateKey(timeInTimestamp);
  if (getPhtDateKey(timeOutTimestamp) !== timeInDateKey) return 0;

  const workdayStart = phtLocalMinuteTimestamp(timeInDateKey, WORKDAY_START_MINUTE);
  const lunchStart = phtLocalMinuteTimestamp(timeInDateKey, LUNCH_START_MINUTE);
  const lunchEnd = phtLocalMinuteTimestamp(timeInDateKey, LUNCH_END_MINUTE);

  const creditedStart = Math.max(timeInTimestamp, workdayStart);
  const creditedEnd = timeOutTimestamp;
  if (creditedEnd <= creditedStart) return 0;

  const lunchOverlap = Math.max(
    0,
    Math.min(creditedEnd, lunchEnd) - Math.max(creditedStart, lunchStart)
  );
  const renderedMilliseconds = creditedEnd - creditedStart - lunchOverlap;

  return Math.max(0, renderedMilliseconds);
}

/** Returns completed creditable minutes; partial trailing minutes are ignored. */
export function calculateRenderedMinutes(timeIn, timeOut) {
  return Math.floor(calculateRenderedMilliseconds(timeIn, timeOut) / MINUTE_MS);
}
