import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();
process.env.SUPABASE_URL ||= 'http://superadmin-attendance.test';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-superadmin-service-role-key';

const {
  normalizeTimeString,
  buildPhtTimestamp,
  formatPhtTime,
  format12HourTime,
  formatDateDisplay,
  editDtrRecord,
  deleteDtrAttendance,
} = await import('../src/services/attendanceControlService.js');
const {
  superadminMiddleware,
  adminMiddleware,
  adminOnlyMiddleware,
} = await import('../src/middleware.js');
const { getProjectAccessFlags } = await import('../src/authorization.js');
const { buildStandardDtrRecord } = await import('../src/utils/dtrRecords.js');

test('normalizeTimeString handles 12-hour and 24-hour formats', () => {
  assert.equal(normalizeTimeString('8:00 AM'), '08:00:00');
  assert.equal(normalizeTimeString('08:00 AM'), '08:00:00');
  assert.equal(normalizeTimeString('5:00 PM'), '17:00:00');
  assert.equal(normalizeTimeString('05:00 PM'), '17:00:00');
  assert.equal(normalizeTimeString('12:00 PM'), '12:00:00');
  assert.equal(normalizeTimeString('12:00 AM'), '00:00:00');
  assert.equal(normalizeTimeString('08:00'), '08:00:00');
  assert.equal(normalizeTimeString('17:00:00'), '17:00:00');
  assert.equal(normalizeTimeString(''), null);
  assert.equal(normalizeTimeString(null), null);
});
test('buildPhtTimestamp creates valid UTC ISO instant for Philippine local time', () => {
  // Manila is UTC+8. So 08:00 Manila is 00:00 UTC.
  const isoIn = buildPhtTimestamp('2026-09-21', '08:00');
  assert.equal(isoIn, '2026-09-21T00:00:00.000Z');

  // 17:00 Manila is 09:00 UTC.
  const isoOut = buildPhtTimestamp('2026-09-21', '17:00');
  assert.equal(isoOut, '2026-09-21T09:00:00.000Z');

  // formatPhtTime reconstructs 08:00 and 17:00
  assert.equal(formatPhtTime(isoIn), '08:00');
  assert.equal(formatPhtTime(isoOut), '17:00');
});

test('buildStandardDtrRecord preserves actual scan times alongside official DTR times', () => {
  const record = buildStandardDtrRecord('2026-09-21', [
    {
      id: 101,
      scan_type: 'time_in',
      scan_time: '2026-09-21T00:00:00.000Z', // 08:00 PHT official
      actual_scan_time: '2026-09-20T23:42:00.000Z', // 07:42 PHT actual
      approval_status: 'approved',
    },
    {
      id: 102,
      scan_type: 'time_out',
      scan_time: '2026-09-21T09:00:00.000Z', // 17:00 PHT official
      actual_scan_time: '2026-09-21T08:52:00.000Z', // 16:52 PHT actual
      approval_status: 'approved',
    },
  ]);

  assert.equal(record.time_in, '08:00');
  assert.equal(record.time_out, '17:00');
  assert.equal(record.actual_time_in, '07:42');
  assert.equal(record.actual_time_out, '16:52');
  assert.equal(record.approved_minutes, 480); // 8 hours credited
  assert.equal(record.total_hours, 8);
});

test('superadminMiddleware permits only superadmin and rejects admin, supervisor, and intern', () => {
  const createMock = (role) => {
    const req = { user: role ? { id: 1, role } : null };
    let status = null;
    let jsonBody = null;
    let nextCalled = false;
    const res = {
      status(code) { status = code; return this; },
      json(data) { jsonBody = data; return this; },
    };
    const next = () => { nextCalled = true; };
    return { req, res, next, getResult: () => ({ status, jsonBody, nextCalled }) };
  };

  // Superadmin: allowed
  const superadminMock = createMock('superadmin');
  superadminMiddleware(superadminMock.req, superadminMock.res, superadminMock.next);
  assert.equal(superadminMock.getResult().nextCalled, true);

  // Admin: rejected (403)
  const adminMock = createMock('admin');
  superadminMiddleware(adminMock.req, adminMock.res, adminMock.next);
  assert.equal(adminMock.getResult().status, 403);
  assert.equal(adminMock.getResult().nextCalled, false);

  // Supervisor: rejected (403)
  const supervisorMock = createMock('supervisor');
  superadminMiddleware(supervisorMock.req, supervisorMock.res, supervisorMock.next);
  assert.equal(supervisorMock.getResult().status, 403);
  assert.equal(supervisorMock.getResult().nextCalled, false);

  // Intern: rejected (403)
  const internMock = createMock('intern');
  superadminMiddleware(internMock.req, internMock.res, internMock.next);
  assert.equal(internMock.getResult().status, 403);
  assert.equal(internMock.getResult().nextCalled, false);
});

test('adminMiddleware permits superadmin, admin, and supervisor, but rejects intern', () => {
  const testRole = (role) => {
    let nextCalled = false;
    let status = null;
    const req = { user: { id: 1, role } };
    const res = { status: (c) => { status = c; return res; }, json: () => res };
    adminMiddleware(req, res, () => { nextCalled = true; });
    return { nextCalled, status };
  };

  assert.equal(testRole('superadmin').nextCalled, true);
  assert.equal(testRole('admin').nextCalled, true);
  assert.equal(testRole('supervisor').nextCalled, true);
  assert.equal(testRole('intern').nextCalled, false);
  assert.equal(testRole('intern').status, 403);
});

test('getProjectAccessFlags awards administrative privileges to superadmin', () => {
  const flags = getProjectAccessFlags({ id: 99, role: 'superadmin' }, { id: 1, leader_id: 2 });
  assert.equal(flags.isAdmin, true);
  assert.equal(flags.canView, true);
  assert.equal(flags.canEditDetails, true);
  assert.equal(flags.canDelete, true);
});

test('editDtrRecord strictly requires a non-empty reason', async () => {
  await assert.rejects(
    () => editDtrRecord({
      internId: 1,
      date: '2026-09-21',
      time_in: '08:15',
      reason: '',
    }),
    /reason is strictly required/
  );

  await assert.rejects(
    () => editDtrRecord({
      internId: 1,
      date: '2026-09-21',
      time_in: '08:15',
      reason: '   ',
    }),
    /reason is strictly required/
  );
});

test('database migration file defines all required tables and constraints', () => {
  const migrationPath = fs.existsSync(path.resolve(process.cwd(), 'db/migration_superadmin_attendance_control.sql'))
    ? path.resolve(process.cwd(), 'db/migration_superadmin_attendance_control.sql')
    : path.resolve(process.cwd(), 'backend/db/migration_superadmin_attendance_control.sql');
  assert.equal(fs.existsSync(migrationPath), true);
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.attendance_profiles/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.account_attendance_profiles/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.attendance_records/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.dtr_edit_history/);
  assert.match(sql, /actual_scan_time/);
  assert.match(sql, /recorded_scan_time/);
  assert.match(sql, /Regular 8AM–5PM/);
  assert.match(sql, /'superadmin'/);
});

test('format12HourTime converts 24h and 12h times to standard 12-hour AM/PM format', () => {
  assert.equal(format12HourTime('08:00'), '08:00 AM');
  assert.equal(format12HourTime('08:15:00'), '08:15 AM');
  assert.equal(format12HourTime('17:00'), '05:00 PM');
  assert.equal(format12HourTime('12:00'), '12:00 PM');
  assert.equal(format12HourTime('00:00'), '12:00 AM');
  assert.equal(format12HourTime('8:00 AM'), '08:00 AM');
  assert.equal(format12HourTime('5:00 PM'), '05:00 PM');
});

test('formatDateDisplay converts YYYY-MM-DD to MMMM dd, yyyy format', () => {
  assert.equal(formatDateDisplay('2026-09-22'), 'September 22, 2026');
  assert.equal(formatDateDisplay('2026-01-01'), 'January 1, 2026');
  assert.equal(formatDateDisplay('2026-12-25'), 'December 25, 2026');
  assert.equal(formatDateDisplay(''), '');
});

test('editDtrRecord rejects invalid new_date', async () => {
  await assert.rejects(
    () => editDtrRecord({
      internId: 1,
      date: '2026-09-21',
      new_date: 'invalid-date',
      time_in: '08:15',
      reason: 'Valid correction reason',
    }),
    /valid new attendance date is required/
  );
});

test('deleteDtrAttendance strictly requires a non-empty reason', async () => {
  await assert.rejects(
    () => deleteDtrAttendance({
      internId: 1,
      date: '2026-09-21',
      reason: '',
    }),
    /modification reason is strictly required/
  );

  await assert.rejects(
    () => deleteDtrAttendance({
      internId: 1,
      date: '2026-09-21',
      reason: '   ',
    }),
    /modification reason is strictly required/
  );
});

test('deleteDtrAttendance strictly requires internId and date', async () => {
  await assert.rejects(
    () => deleteDtrAttendance({
      internId: null,
      date: '2026-09-21',
      reason: 'Valid reason',
    }),
    /Intern ID is required/
  );

  await assert.rejects(
    () => deleteDtrAttendance({
      internId: 1,
      date: '',
      reason: 'Valid reason',
    }),
    /Attendance date is required/
  );
});

test('deleteDtrAttendance rejects invalid date format', async () => {
  await assert.rejects(
    () => deleteDtrAttendance({
      internId: 1,
      date: 'invalid-date-format',
      reason: 'Valid reason',
    }),
    /valid attendance date is required/
  );
});

