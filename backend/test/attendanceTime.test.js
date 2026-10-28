import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_RENDERED_MINUTES,
  calculateRenderedMilliseconds,
  calculateRenderedMinutes,
  getPhtDateKey,
  getPhtDayBoundsUtc,
  processDtrScanTime,
  normalizeLunchBreakScan,
} from '../src/utils/attendanceTime.js';

const onAugust28 = time => `2026-08-28T${time}+08:00`;

for (const [scanType, input, expected] of [
  ...['07:30:00', '07:59:00', '07:59:59.999', '08:00:00'].map(time => ['time_in', time, '08:00:00']),
  ...['08:00:00.001', '08:00:01', '08:01:00', '08:15:00', '09:00:00'].map(time => ['time_in', time, time]),
  // Scans before 12:00 PM retain their actual scan time
  ...['11:30:00', '11:45:00', '11:59:00', '11:59:59.999'].map(time => ['time_in', time, time]),
  ...['11:30:00', '11:45:00', '11:59:00', '11:59:59.999'].map(time => ['time_out', time, time]),
  // Scans between 12:00 PM and 12:59 PM are automatically treated as 1:00 PM (13:00:00)
  ...['12:00:00', '12:01:00', '12:10:00', '12:30:00', '12:45:00', '12:59:00', '12:59:59', '12:59:59.999'].map(time => ['time_in', time, '13:00:00']),
  ...['12:00:00', '12:01:00', '12:10:00', '12:30:00', '12:45:00', '12:59:00', '12:59:59', '12:59:59.999'].map(time => ['time_out', time, '13:00:00']),
  // Scans at 1:00 PM or later retain their actual scan time
  ...['13:00:00', '13:01:00', '13:05:00', '13:30:00'].map(time => ['time_in', time, time]),
  ...['13:00:00', '13:01:00', '13:05:00', '13:30:00'].map(time => ['time_out', time, time]),
  ...['16:00:00', '16:30:00', '16:59:00', '16:59:59', '16:59:59.999'].map(time => ['time_out', time, time]),
  ...['17:00:00', '17:00:00.001', '17:00:01', '17:01:00', '17:30:00', '18:00:00'].map(time => ['time_out', time, '17:00:00']),
]) {
  test(`${scanType}: ${input} is recorded as ${expected} PHT`, () => {
    const raw = new Date(onAugust28(input));
    const original = raw.getTime();
    assert.equal(processDtrScanTime(raw, scanType), new Date(onAugust28(expected)).toISOString());
    assert.equal(raw.getTime(), original, 'processing must not mutate the raw timestamp');
  });
}

test('DTR boundaries use the Philippine date even on the previous UTC date', () => {
  assert.equal(processDtrScanTime('2026-08-27T16:00:00Z', 'time_in'), '2026-08-28T00:00:00.000Z');
  assert.equal(processDtrScanTime('2026-08-28T15:59:59Z', 'time_out'), '2026-08-28T09:00:00.000Z');
  assert.equal(processDtrScanTime('2026-08-28T00:00:01Z', 'time_in'), '2026-08-28T00:00:01.000Z');
});

test('invalid or missing scans never fabricate a DTR timestamp', () => {
  for (const value of [null, undefined, '', 'invalid']) {
    assert.equal(processDtrScanTime(value, 'time_in'), null);
  }
  assert.equal(processDtrScanTime(onAugust28('08:00:00'), 'unknown'), null);
});

test('an exact 08:00 to 17:00 workday renders eight hours after lunch', () => {
  assert.equal(
    calculateRenderedMinutes(onAugust28('08:00:00'), onAugust28('17:00:00')),
    480
  );
});

test('an 08:30 to 16:30 workday renders seven hours (3h30m morning + 3h30m afternoon)', () => {
  assert.equal(
    calculateRenderedMinutes(onAugust28('08:30:00'), onAugust28('16:30:00')),
    420
  );
});

test('a morning-only 08:00 to 11:30 pair renders 3 hours 30 minutes without lunch deduction', () => {
  assert.equal(
    calculateRenderedMinutes(onAugust28('08:00:00'), onAugust28('11:30:00')),
    210
  );
});

test('an 08:00 to 12:00 morning period renders exactly 4 hours (240 minutes)', () => {
  assert.equal(
    calculateRenderedMinutes(onAugust28('08:00:00'), onAugust28('12:00:00')),
    240
  );
});

test('an 08:00 to 12:30 period renders 4 hours as lunch interval contributes 0 hours', () => {
  assert.equal(
    calculateRenderedMinutes(onAugust28('08:00:00'), onAugust28('12:30:00')),
    240
  );
});

test('an afternoon-only 13:00 to 17:00 period renders 4 hours', () => {
  assert.equal(
    calculateRenderedMinutes(onAugust28('13:00:00'), onAugust28('17:00:00')),
    240
  );
});

test('a 12:30 to 17:00 period renders 4 hours starting at 1:00 PM', () => {
  assert.equal(
    calculateRenderedMinutes(onAugust28('12:30:00'), onAugust28('17:00:00')),
    240
  );
});

test('a 08:00 to 18:00 day caps at 8 hours (480 minutes) under 17:00 boundary', () => {
  assert.equal(
    calculateRenderedMinutes(onAugust28('08:00:00'), onAugust28('18:00:00')),
    480
  );
});

test('early arrivals and late departures do not earn hours outside 08:00-17:00', () => {
  assert.equal(
    calculateRenderedMinutes(onAugust28('06:30:00'), onAugust28('20:15:00')),
    480
  );
});

test('Example A: 07:40 to 17:30 renders 8 hours (480 minutes)', () => {
  assert.equal(
    calculateRenderedMinutes(onAugust28('07:40:00'), onAugust28('17:30:00')),
    480
  );
});

test('Example B: 08:25 to 16:30 renders 7 hours 5 minutes (425 minutes)', () => {
  assert.equal(
    calculateRenderedMinutes(onAugust28('08:25:00'), onAugust28('16:30:00')),
    425
  );
});

test('Example C: 07:45 to 16:45 renders 7 hours 45 minutes (465 minutes)', () => {
  assert.equal(
    calculateRenderedMinutes(onAugust28('07:45:00'), onAugust28('16:45:00')),
    465
  );
});

test('an afternoon 15:03 to 16:05 pair renders exactly 62 minutes', () => {
  assert.equal(
    calculateRenderedMinutes(onAugust28('15:03:00'), onAugust28('16:05:00')),
    62
  );
});

test('only the actual overlap with the 12:00 to 13:00 lunch is deducted', () => {
  assert.equal(
    calculateRenderedMinutes(onAugust28('11:30:00'), onAugust28('12:30:00')),
    30
  );
  assert.equal(
    calculateRenderedMinutes(onAugust28('11:30:00'), onAugust28('13:30:00')),
    60
  );
  assert.equal(
    calculateRenderedMinutes(onAugust28('11:45:00'), onAugust28('12:30:00')),
    15
  );
  assert.equal(
    calculateRenderedMinutes(onAugust28('12:15:00'), onAugust28('13:15:00')),
    15
  );
  assert.equal(
    calculateRenderedMinutes(onAugust28('11:59:00'), onAugust28('13:01:00')),
    2
  );
});

test('a pair entirely inside lunch renders zero minutes', () => {
  assert.equal(
    calculateRenderedMinutes(onAugust28('12:10:00'), onAugust28('12:50:00')),
    0
  );
  assert.equal(
    calculateRenderedMinutes(onAugust28('12:00:00'), onAugust28('12:59:59')),
    0
  );
});

test('incomplete, invalid, reversed, and cross-date pairs render zero minutes', () => {
  assert.equal(calculateRenderedMinutes(onAugust28('08:00:00'), undefined), 0);
  assert.equal(calculateRenderedMinutes('not-a-date', onAugust28('17:00:00')), 0);
  assert.equal(
    calculateRenderedMinutes(onAugust28('17:00:00'), onAugust28('08:00:00')),
    0
  );
  assert.equal(
    calculateRenderedMinutes('2026-08-28T23:30:00+08:00', '2026-08-29T08:30:00+08:00'),
    0
  );
});

test('rendered minutes are derived from integer milliseconds', () => {
  const milliseconds = calculateRenderedMilliseconds(
    onAugust28('15:03:20'),
    onAugust28('16:05:50')
  );

  assert.equal(milliseconds, 62 * 60 * 1000 + 30 * 1000);
  assert.equal(calculateRenderedMinutes(onAugust28('15:03:20'), onAugust28('16:05:50')), 62);
});

test('PHT date keys change at 16:00 UTC', () => {
  assert.equal(getPhtDateKey('2026-08-27T15:59:59.999Z'), '2026-08-27');
  assert.equal(getPhtDateKey('2026-08-27T16:00:00.000Z'), '2026-08-28');
});

test('PHT day bounds are returned as UTC ISO instants', () => {
  assert.deepEqual(getPhtDayBoundsUtc('2026-08-28'), {
    dateKey: '2026-08-28',
    startIso: '2026-08-27T16:00:00.000Z',
    endIso: '2026-08-28T15:59:59.999Z',
    endExclusiveIso: '2026-08-28T16:00:00.000Z',
  });
});

test('invalid Philippine calendar dates are rejected by date helpers', () => {
  assert.throws(() => getPhtDayBoundsUtc('2026-02-30'), RangeError);
});
