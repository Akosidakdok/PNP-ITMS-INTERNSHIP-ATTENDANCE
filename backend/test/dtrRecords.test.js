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

test('an ordinary 08:00 to 18:00 scan pair uses the official 17:00 departure', () => {
  const record = buildStandardDtrRecord('2026-08-27', [
    scan(1, '08:00:00', 'time_in'),
    scan(2, '18:00:00', 'time_out'),
  ]);

  assert.equal(record.time_out, '17:00');
  assert.equal(record.total_minutes, 480);
  assert.equal(record.total_hours, 8);
});

test('an ordinary early arrival and late departure use the official workday', () => {
  const record = buildStandardDtrRecord('2026-08-27', [
    scan(1, '07:10:00', 'time_in'),
    scan(2, '18:30:00', 'time_out'),
  ]);

  assert.equal(record.time_in, '08:00');
  assert.equal(record.time_out, '17:00');
  assert.equal(record.total_minutes, 480);
  assert.equal(record.total_hours, 8);
});

test('DTR output and totals use recorded times while audit times keep the original scans', () => {
  const entries = [
    { ...scan(1, '07:30:12', 'time_in'), actual_scan_time: '2026-08-27T07:30:12+08:00', recorded_scan_time: '2026-08-27T08:00:00+08:00' },
    { ...scan(2, '18:00:25', 'time_out'), actual_scan_time: '2026-08-27T18:00:25+08:00', recorded_scan_time: '2026-08-27T17:00:00+08:00' },
  ];
  const originals = structuredClone(entries);
  const [record] = buildDtrRecords(entries);
  assert.equal(record.time_in, '08:00');
  assert.equal(record.am_time_in, '08:00');
  assert.equal(record.time_out, '17:00');
  assert.equal(record.pm_time_out, '17:00');
  assert.equal(record.actual_time_in, '07:30:12');
  assert.equal(record.actual_time_out, '18:00:25');
  assert.equal(record.approved_minutes, 480);
  assert.deepEqual(entries, originals);
});

test('seconds on late arrivals and early departures survive DTR aggregation', () => {
  const [record] = buildDtrRecords([scan(1, '08:00:01', 'time_in'), scan(2, '16:59:59', 'time_out')]);
  assert.equal(record.time_in, '08:00:01');
  assert.equal(record.time_out, '16:59:59');
  assert.equal(record.total_minutes, 479);
});

test('explicit custom or manually recorded times remain authoritative', () => {
  const [record] = buildDtrRecords([
    { ...scan(1, '08:20:00', 'time_in'), recorded_scan_time: '2026-08-27T08:30:00+08:00' },
    { ...scan(2, '19:00:00', 'time_out'), recorded_scan_time: '2026-08-27T18:30:00+08:00' },
  ]);
  assert.equal(record.time_in, '08:30');
  assert.equal(record.time_out, '18:30');
  assert.equal(record.total_minutes, 540);
});

test('two scans before 08:00 remain a complete pair with zero credited minutes', () => {
  const [record] = buildDtrRecords([scan(1, '07:30:00', 'time_in'), scan(2, '07:45:00', 'time_out')]);
  assert.equal(record.time_in, '08:00');
  assert.equal(record.time_out, '07:45');
  assert.equal(record.is_complete, true);
  assert.equal(record.total_minutes, 0);
});

test('a date-corrected early pair groups by its edited date and pairs by original scans', () => {
  const [record] = buildDtrRecords([
    { ...scan(1, '08:00:00', 'time_in'), actual_scan_time: '2026-08-26T07:30:00+08:00', recorded_scan_time: '2026-08-27T08:00:00+08:00' },
    { ...scan(2, '07:45:00', 'time_out'), actual_scan_time: '2026-08-26T07:45:00+08:00', recorded_scan_time: '2026-08-27T07:45:00+08:00' },
  ]);
  assert.equal(record.date, '2026-08-27');
  assert.equal(record.time_out, '07:45');
  assert.equal(record.is_complete, true);
  assert.equal(record.total_minutes, 0);
});

for (const [direction, actualIn, actualOut] of [
  ['backward', '2026-08-28T08:00:00+08:00', null],
  ['forward', null, '2026-08-26T17:00:00+08:00'],
]) {
  test(`a date correction ${direction} preserves a mixed real/manual scan pair`, () => {
    const [record] = buildDtrRecords([
      { ...scan(1, '08:00:00', 'time_in'), actual_scan_time: actualIn, recorded_scan_time: '2026-08-27T08:00:00+08:00' },
      { ...scan(2, '17:00:00', 'time_out'), actual_scan_time: actualOut, recorded_scan_time: '2026-08-27T17:00:00+08:00' },
    ]);
    assert.equal(record.date, '2026-08-27');
    assert.equal(record.time_in, '08:00');
    assert.equal(record.time_out, '17:00');
    assert.equal(record.approved_minutes, 480);
  });
}

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

test('absent and holiday overrides set zero credit and do not increment days present', () => {
  const parsedAbsent = parseDtrOverride('OVERRIDE:ABSENT:0:Sick leave');
  assert.deepEqual(parsedAbsent, {
    type: 'ABSENT',
    hours: 0,
    remarks: 'Sick leave',
  });

  const parsedHoliday = parseDtrOverride('OVERRIDE:HOLIDAY:0:National Heroes Day');
  assert.deepEqual(parsedHoliday, {
    type: 'HOLIDAY',
    hours: 0,
    remarks: 'National Heroes Day',
  });

  const records = buildDtrRecords([
    { ...scan(1, '08:00:00', 'time_in', 'approved', 'OVERRIDE:ABSENT:0:Sick leave'), scan_time: '2026-08-25T08:00:00+08:00' },
    { ...scan(2, '08:00:00', 'time_in', 'approved', 'OVERRIDE:HOLIDAY:0:Special Non-Working Holiday'), scan_time: '2026-08-26T08:00:00+08:00' },
  ]);
  const [holidayRec, absentRec] = records;

  assert.equal(absentRec.override_type, 'absent');
  assert.equal(absentRec.total_minutes, 0);
  assert.equal(absentRec.approved_minutes, 0);
  assert.equal(absentRec.remarks, 'Sick leave');

  assert.equal(holidayRec.override_type, 'holiday');
  assert.equal(holidayRec.total_minutes, 0);
  assert.equal(holidayRec.approved_minutes, 0);
  assert.equal(holidayRec.remarks, 'Special Non-Working Holiday');

  const summary = summarizeDtrRecords(records);
  assert.equal(summary.days_present, 0);
  assert.equal(summary.approved_minutes, 0);
});

test('school face to face / class override sets zero credit and does not increment days present', () => {
  const parsedSchool = parseDtrOverride('OVERRIDE:SCHOOL:0:University Face-to-Face Class');
  assert.deepEqual(parsedSchool, {
    type: 'SCHOOL',
    hours: 0,
    remarks: 'University Face-to-Face Class',
  });

  const records = buildDtrRecords([
    { ...scan(1, '08:00:00', 'time_in', 'approved', 'OVERRIDE:SCHOOL:0:University Face-to-Face Class'), scan_time: '2026-08-27T08:00:00+08:00' },
  ]);
  const [schoolRec] = records;

  assert.equal(schoolRec.override_type, 'school');
  assert.equal(schoolRec.total_minutes, 0);
  assert.equal(schoolRec.approved_minutes, 0);
  assert.equal(schoolRec.remarks, 'University Face-to-Face Class');

  const summary = summarizeDtrRecords(records);
  assert.equal(summary.days_present, 0);
  assert.equal(summary.approved_minutes, 0);
});

test('school override synonyms (school_class, school_f2f, f2f) normalize to SCHOOL', () => {
  const parsedSynonym1 = parseDtrOverride('OVERRIDE:SCHOOL_CLASS:0:Midterm Exam');
  assert.deepEqual(parsedSynonym1, {
    type: 'SCHOOL',
    hours: 0,
    remarks: 'Midterm Exam',
  });

  const parsedSynonym2 = parseDtrOverride('OVERRIDE:SCHOOL-F2F:0:Lab Class');
  assert.deepEqual(parsedSynonym2, {
    type: 'SCHOOL',
    hours: 0,
    remarks: 'Lab Class',
  });
});



