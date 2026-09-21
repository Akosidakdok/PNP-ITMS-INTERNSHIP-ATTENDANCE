import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDtrRecords,
  buildStandardDtrRecord,
  parseDtrOverride,
  summarizeDtrRecords,
} from '../src/utils/dtrRecords.js';

const scan = (id, localTime, scanType, approvalStatus = 'approved', remarks = null) => ({
  id,
  intern_id: 7,
  scan_time: `2026-08-27T${localTime}+08:00`,
  scan_type: scanType,
  approval_status: approvalStatus,
  remarks,
});

test('a two-scan afternoon day produces one complete approved DTR record', () => {
  const [record] = buildDtrRecords([
    scan(1, '15:03:00', 'time_in'),
    scan(2, '16:05:00', 'time_out'),
  ]);

  assert.equal(record.date, '2026-08-27');
  assert.equal(record.time_in, '15:03');
  assert.equal(record.time_out, '16:05');
  assert.equal(record.total_minutes, 62);
  assert.equal(record.worked_minutes, 62);
  assert.equal(record.approved_minutes, 62);
  assert.equal(record.approval_status, 'approved');
  assert.equal(record.is_complete, true);
});

test('a full approved day is capped at 480 minutes and lunch is excluded', () => {
  const record = buildStandardDtrRecord('2026-08-27', [
    scan(1, '07:10:00', 'time_in'),
    scan(2, '18:30:00', 'time_out'),
  ]);

  assert.equal(record.total_minutes, 480);
  assert.equal(record.total_hours, 8);
});

test('an approved time-in without a time-out remains incomplete and uncredited', () => {
  const record = buildStandardDtrRecord('2026-08-27', [scan(1, '08:36:00', 'time_in')]);

  assert.equal(record.time_in, '08:36');
  assert.equal(record.time_out, null);
  assert.equal(record.total_minutes, 0);
  assert.equal(record.approved_minutes, 0);
  assert.equal(record.approval_status, 'pending');
  assert.equal(record.is_complete, false);
});

test('both scans must be approved before worked time becomes rendered time', () => {
  const record = buildStandardDtrRecord('2026-08-27', [
    scan(1, '08:00:00', 'time_in', 'approved'),
    scan(2, '17:00:00', 'time_out', 'pending'),
  ]);

  assert.equal(record.worked_minutes, 480);
  assert.equal(record.approved_minutes, 0);
  assert.equal(record.approval_status, 'pending');
});

test('override parsing preserves colon-delimited remarks and legacy suspension rows', () => {
  assert.deepEqual(parseDtrOverride('OVERRIDE:HOURS:6.5:System issue: approved'), {
    type: 'HOURS',
    hours: 6.5,
    remarks: 'System issue: approved',
  });
  assert.deepEqual(parseDtrOverride('OVERRIDE:SUSPENDED:Typhoon'), {
    type: 'SUSPENDED',
    hours: 0,
    remarks: 'Typhoon',
  });
});

test('manual override credit stays separate from raw worked time', () => {
  const records = buildDtrRecords([
    scan(1, '08:30:00', 'time_in'),
    scan(2, '12:00:00', 'time_out'),
    scan(3, '08:00:00', 'time_in', 'approved', 'OVERRIDE:HOURS:6:Authorized correction'),
  ]);
  const [record] = records;
  const summary = summarizeDtrRecords(records);

  assert.equal(record.worked_minutes, 210);
  assert.equal(record.total_minutes, 360);
  assert.equal(record.approved_minutes, 360);
  assert.equal(record.override_type, 'hours');
  assert.equal(summary.worked_minutes, 210);
  assert.equal(summary.approved_minutes, 360);
});

test('excused and suspended overrides respect the eight-hour policy', () => {
  const excused = buildDtrRecords([
    scan(1, '08:00:00', 'time_in', 'approved', 'OVERRIDE:EXCUSED:8:Official activity'),
  ])[0];
  const suspended = buildDtrRecords([
    scan(2, '08:00:00', 'time_in', 'approved', 'OVERRIDE:SUSPENDED:0:Typhoon'),
  ])[0];

  assert.equal(excused.total_minutes, 480);
  assert.equal(excused.worked_minutes, 0);
  assert.equal(excused.approved_minutes, 480);
  assert.equal(suspended.total_minutes, 0);
  assert.equal(suspended.approved_minutes, 0);
});

