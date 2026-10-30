import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDtrTimeChanges, normalizeDtrTimeInput, estimateDtrScheduleHours } from '../src/utils/dtrTimeEdit.js';

const original = { timeIn: '08:00', timeOut: '' };

test('schedule estimates exclude 12:00–13:00 while retaining overtime', () => {
  assert.deepEqual(estimateDtrScheduleHours('08:00', '19:00'), { hours: '10' });
  assert.deepEqual(estimateDtrScheduleHours('08:00', '20:00'), { hours: '11' });
  assert.deepEqual(estimateDtrScheduleHours('08:00', '12:30'), { hours: '4' });
  assert.deepEqual(estimateDtrScheduleHours('11:30', '13:30'), { hours: '1' });
  assert.equal(estimateDtrScheduleHours('19:00', '08:00'), null);
  assert.equal(estimateDtrScheduleHours('', '19:00'), null);
});

test('Time Out alone is valid and leaves the unchanged Time In out of the update', () => {
  assert.deepEqual(buildDtrTimeChanges('08:00', '17:00', original), { time_in: null, time_out: '17:00' });
  assert.deepEqual(buildDtrTimeChanges('', '5:00 PM', original), { time_in: null, time_out: '17:00' });
  assert.deepEqual(buildDtrTimeChanges('', '17:00', { timeIn: '', timeOut: '' }), { time_in: null, time_out: '17:00' });
});

test('Time In alone is valid while unchanged or blank Time Out is preserved', () => {
  assert.deepEqual(buildDtrTimeChanges('08:30', '', original), { time_in: '08:30', time_out: null });
  assert.deepEqual(buildDtrTimeChanges('08:30', '17:00', { timeIn: '08:00', timeOut: '17:00' }),
    { time_in: '08:30', time_out: null });
});

test('equivalent clock formats are unchanged and existing seconds are preserved', () => {
  assert.throws(() => buildDtrTimeChanges('8:00 AM', '17:00:00', { timeIn: '08:00', timeOut: '17:00' }), /Change Time In or Time Out/);
  assert.deepEqual(buildDtrTimeChanges('08:00:01.123', '17:30', { timeIn: '08:00:01.123', timeOut: '17:00' }),
    { time_in: null, time_out: '17:30' });
});

test('incomplete and invalid input receives a field-specific error instead of a no-change error', () => {
  for (const value of ['5:', '05:00 --', '25:00', '17:65']) {
    assert.throws(() => buildDtrTimeChanges('08:00', value, original), /valid Time Out/);
  }
  assert.throws(() => buildDtrTimeChanges('bad', '17:00', original), /valid Time In/);
});

test('clock normalization handles midnight, noon and precision without guessing AM/PM', () => {
  assert.equal(normalizeDtrTimeInput('12:00 AM'), '00:00');
  assert.equal(normalizeDtrTimeInput('12:00 PM'), '12:00');
  assert.equal(normalizeDtrTimeInput('5:00 PM'), '17:00');
  assert.equal(normalizeDtrTimeInput('05:00'), '05:00');
  assert.equal(normalizeDtrTimeInput('08:00:00.001'), '08:00:00.001');
  assert.equal(normalizeDtrTimeInput('08:00:02.100'), '08:00:02.1');
  assert.equal(normalizeDtrTimeInput(''), '');
});
