import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRenderedMinutes, processDtrScanTime, getRecordedScanTime } from '../src/utils/attendanceTime.js';
import { buildDtrRecords, summarizeDtrRecords } from '../src/utils/dtrRecords.js';

const time = clock => `2026-09-24T${clock}:00+08:00`;
const pair = (out, status = 'approved') => [
  { id: 1, scan_type: 'time_in', scan_time: time('08:00'), recorded_scan_time: time('08:00'),
    actual_scan_time: time('08:00'), adjustment_mode: 'manual', approval_status: status },
  { id: 2, scan_type: 'time_out', scan_time: time(out), recorded_scan_time: time(out),
    actual_scan_time: time('17:00'), adjustment_mode: 'manual', approval_status: status },
];

test('08:00–19:00 retains ten approved hours after excluding 12:00–13:00', () => {
  const logs = pair('19:00');
  const original = structuredClone(logs);
  const records = buildDtrRecords(logs);
  assert.equal(records[0].time_out, '19:00');
  assert.equal(records[0].total_minutes, 600);
  assert.equal(records[0].approved_minutes, 600);
  assert.equal(records[0].total_hours, 10);
  assert.equal(summarizeDtrRecords(records).approved_hours, 10);
  assert.deepEqual(logs, original);
});

test('the reported 08:00–20:00 day retains eleven approved hours after lunch', () => {
  assert.equal(buildDtrRecords(pair('20:00'))[0].approved_minutes, 660);
});

test('totals exclude only lunch overlap while keeping overtime', () => {
  assert.equal(calculateRenderedMinutes(time('08:00'), time('19:00')), 600);
  assert.equal(calculateRenderedMinutes(time('08:30'), time('16:30')), 420);
  assert.equal(calculateRenderedMinutes(time('06:30'), time('20:15')), 765);
  assert.equal(calculateRenderedMinutes(time('11:30'), time('12:30')), 30);
  assert.equal(calculateRenderedMinutes(time('12:15'), time('13:15')), 15);
  assert.equal(calculateRenderedMinutes(time('12:00'), time('13:00')), 0);
});

test('default scans preserve late departures and manual saved times are never normalized away', () => {
  assert.equal(processDtrScanTime(time('19:00'), 'time_out'), new Date(time('19:00')).toISOString());
  assert.equal(getRecordedScanTime({ scan_type: 'time_in', actual_scan_time: time('07:30'),
    recorded_scan_time: time('07:30'), adjustment_mode: 'manual' }), time('07:30'));
  assert.equal(getRecordedScanTime({ scan_type: 'time_out', actual_scan_time: null,
    recorded_scan_time: time('12:30'), scan_time: time('12:30') }), time('12:30'));
  assert.equal(getRecordedScanTime({ scan_type: 'time_out', actual_scan_time: time('09:00'),
    recorded_scan_time: time('12:30'), adjustment_mode: 'automatic' }), time('12:30'));
});

test('pending overtime stays pending and does not earn approved hours', () => {
  const [record] = buildDtrRecords(pair('19:00', 'pending'));
  assert.equal(record.worked_minutes, 600);
  assert.equal(record.approved_minutes, 0);
});

for (const type of ['HOURS', 'OTHERS', 'HOLIDAY', 'SCHOOL']) {
  test(`explicit ${type} custom credit can retain eleven hours`, () => {
    const [record] = buildDtrRecords([{ scan_type: 'time_in', scan_time: time('08:00'),
      remarks: `OVERRIDE:${type}:11:Approved overtime`, approval_status: 'approved' }]);
    assert.equal(record.total_minutes, 660);
    assert.equal(record.approved_minutes, 660);
  });
}
