import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDtrTime, getPhtDtrTime } from '../src/utils/dtrTime.js';

test('official DTRs show exact boundaries without seconds and preserve nonzero seconds', () => {
  assert.equal(formatDtrTime('08:00'), '8:00 AM');
  assert.equal(formatDtrTime('08:00:00'), '8:00 AM');
  assert.equal(formatDtrTime('08:00:01'), '8:00:01 AM');
  assert.equal(formatDtrTime('16:59:59'), '4:59:59 PM');
  assert.equal(formatDtrTime('17:00:00'), '5:00 PM');
  assert.equal(formatDtrTime('08:00:00.001'), '8:00:00.001 AM');
});

test('formatting Philippine clock values does not depend on the browser timezone', () => {
  assert.equal(formatDtrTime('00:00'), '12:00 AM');
  assert.equal(formatDtrTime('11:59'), '11:59 AM');
  assert.equal(formatDtrTime('12:00'), '12:00 PM');
  assert.equal(formatDtrTime('12:30'), '12:30 PM');
  assert.equal(formatDtrTime('13:00'), '1:00 PM');
  assert.equal(formatDtrTime('13:00:00'), '1:00 PM');
  assert.equal(formatDtrTime('13:01'), '1:01 PM');
  assert.equal(formatDtrTime('13:05'), '1:05 PM');
  assert.equal(formatDtrTime('13:30'), '1:30 PM');
  assert.equal(formatDtrTime(null), '');
  assert.equal(formatDtrTime('invalid'), 'invalid');
});

test('attendance preview clock values retain timestamp precision for manual edits', () => {
  assert.equal(getPhtDtrTime('2026-10-26T00:00:01.123Z'), '08:00:01.123');
  assert.equal(getPhtDtrTime('2026-10-26T08:59:59Z'), '16:59:59');
  assert.equal(getPhtDtrTime('2026-10-25T16:00:00Z'), '00:00');
  assert.equal(getPhtDtrTime('2026-10-26T04:30:00Z'), '12:30');
  assert.equal(getPhtDtrTime('2026-10-26T05:00:00Z'), '13:00');
  assert.equal(getPhtDtrTime('2026-10-26T09:00:00Z'), '17:00');
});
