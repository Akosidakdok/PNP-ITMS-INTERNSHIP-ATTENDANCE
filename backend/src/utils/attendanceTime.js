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

/**
 * Calculates creditable attendance time for a single two-scan Philippine day.
 * Time outside 08:00-17:00 is ignored and actual overlap with 12:00-13:00
 * is deducted. Invalid, incomplete, reversed, and cross-date pairs earn zero.
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
  const workdayEnd = phtLocalMinuteTimestamp(timeInDateKey, WORKDAY_END_MINUTE);

  const creditedStart = Math.max(timeInTimestamp, workdayStart);
  const creditedEnd = Math.min(timeOutTimestamp, workdayEnd);
  if (creditedEnd <= creditedStart) return 0;

  const lunchOverlap = Math.max(
    0,
    Math.min(creditedEnd, lunchEnd) - Math.max(creditedStart, lunchStart)
  );
  const renderedMilliseconds = creditedEnd - creditedStart - lunchOverlap;

  return Math.max(
    0,
    Math.min(renderedMilliseconds, MAX_RENDERED_MINUTES * MINUTE_MS)
  );
}

/** Returns completed creditable minutes; partial trailing minutes are ignored. */
export function calculateRenderedMinutes(timeIn, timeOut) {
  return Math.floor(calculateRenderedMilliseconds(timeIn, timeOut) / MINUTE_MS);
}
