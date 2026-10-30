import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { FACE_ID_VERSION, FACE_DESCRIPTOR_LENGTH } from '../src/utils/compareFaces.js';

process.env.SUPABASE_URL ||= 'http://dtr-scan.test';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-key';
const { supabase } = await import('../src/supabaseClient.js');
const { scanAttendance } = await import('../src/attendance.js');
const { getDtrRecords, getAttendanceLogs, getAttendanceReport } = await import('../src/data.js');
const { editDtrRecord, setIndividualAttendanceControl, getDtrEditHistory, deleteDtrAttendance } = await import('../src/services/attendanceControlService.js');
const { buildDtrRecords } = await import('../src/utils/dtrRecords.js');
const originalFrom = supabase.from;
const originalRpc = supabase.rpc;
afterEach(() => { supabase.from = originalFrom; supabase.rpc = originalRpc; });

test('deleted QR entries remain in DTR history with the actual administrator identity', async () => {
  mockDatabase({ scanAudits: [{ id: 81, attendance_log_id: 41, account_id: 7,
    event_type: 'attendance_deleted', actual_scan_time: '2026-10-29T01:20:51Z',
    dtr_time: '2026-10-29T00:00:00Z', approved_by: 10, adjustment_mode: 'manual',
    created_at: '2026-10-29T04:00:00Z', policy_snapshot: { deleted_by_name: 'Demo Admin', deleted_by_role: 'admin' } }] });
  const history = await getDtrEditHistory({ internId: 7 });
  const deletion = history.find(entry => entry.id === 'scan-81');
  assert.equal(deletion.field_name, 'Attendance entry deleted');
  assert.equal(deletion.new_value, 'Deleted · scan evidence retained');
  assert.equal(deletion.modified_by_role, 'admin');
  assert.equal(deletion.modified_by_name, 'Demo Admin');
});

const descriptor = Array.from({ length: FACE_DESCRIPTOR_LENGTH }, (_, i) => Math.sin(i * 0.1) * 0.4);
const face = { version: FACE_ID_VERSION, samples: [descriptor, descriptor, descriptor] };
const photo = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
const user = { id: 7, full_name: 'Test intern', face_registered: true, face_embedding: JSON.stringify(face) };
const regularProfile = { id: 1, profile_name: 'Regular 8AM–5PM', time_in: '08:00:00', time_out: '17:00:00', first_scan_enabled: true, second_scan_enabled: true };

test('Admin-approved policy assignments use controlled scan persistence', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-26T01:13:00Z') });
  const writes = mockDatabase({ assignment: { attendance_profile_id: 1, assigned_by: 10, approver: { role: 'admin' } } });
  await scanAttendance({ qr_code: 'VALID', photo, face_embedding: face, user });
  const inserted = writes.find(write => write.table === 'attendance_logs' && write.action === 'insert').payload;
  const log = Array.isArray(inserted) ? inserted[0] : inserted;
  assert.equal(log.recorded_scan_time, '2026-10-26T00:00:00.000Z');
});

test('DTR scan audit history retains the actual Admin identity', async () => {
  mockDatabase({ scanAudits: [{ id: 82, account_id: 7, event_type: 'dtr_adjustment', approved_by: 10,
    actual_scan_time: '2026-10-29T01:20:51Z', dtr_time: '2026-10-29T00:05:00Z',
    created_at: '2026-10-29T04:00:00Z', policy_snapshot: { approved_by_name: 'Demo Admin', approved_by_role: 'admin' } }] });
  const history = await getDtrEditHistory({ internId: 7 });
  assert.equal(history[0].modified_by_role, 'admin');
  assert.equal(history[0].modified_by_name, 'Demo Admin');
});

function mockDatabase({ logs = [], profile = regularProfile, fallbackProfile = profile, assignment = null, existingRecord = null, insertError = null, logUpdateError = null, scanAudits = [], logReadError = null, recordReadError = null } = {}) {
  const writes = [];
  supabase.rpc = async (name, payload) => {
    if (name === 'apply_controlled_dtr_edit') {
      writes.push({ table: 'rpc', action: name, payload });
      return { data: { record_id: existingRecord?.id || 30 }, error: logUpdateError };
    }
    return { data: { allowed: true }, error: null };
  };
  supabase.from = table => {
    const state = { table, action: 'select', args: [] };
    const result = () => {
      if (state.action !== 'select') {
        writes.push({ ...state });
        if (table === 'attendance_logs' && insertError) return { data: null, error: insertError };
        if (table === 'attendance_logs' && state.action === 'update' && logUpdateError) return { data: null, error: logUpdateError };
        return { data: { id: 30, ...(Array.isArray(state.payload) ? state.payload[0] : state.payload) }, error: null };
      }
      if (table === 'qr_codes') return { data: { id: 1 }, error: null };
      if (table === 'accounts') return { data: state.args.some(([method]) => method === 'neq') ? [] : state.single ? user : [user], error: null };
      if (table === 'attendance_profiles') return { data: state.args.some(([method]) => method === 'not')
        ? fallbackProfile : profile?.status === 'inactive' ? null : profile, error: null };
      if (table === 'account_attendance_profiles') return { data: assignment, error: null };
      if (table === 'attendance_records') return { data: existingRecord, error: recordReadError };
      if (table === 'attendance_scan_audit') return { data: scanAudits, error: null };
      if (table === 'attendance_logs') return { data: logReadError ? null : state.single ? null : logs, count: logs.length, error: logReadError };
      return { data: [], error: null };
    };
    const query = {};
    for (const method of ['select', 'eq', 'neq', 'in', 'gte', 'lt', 'gt', 'order', 'limit', 'not', 'or', 'range']) {
      query[method] = (...args) => { state.args.push([method, ...args]); return query; };
    }
    for (const method of ['insert', 'update', 'delete']) {
      query[method] = payload => { state.action = method; state.payload = payload; return query; };
    }
    query.single = query.maybeSingle = async () => { state.single = true; return result(); };
    query.then = (resolve, reject) => Promise.resolve(result()).then(resolve, reject);
    return query;
  };
  return writes;
}

for (const [scanType, localTime, expected] of [
  ['time_in', '07:30:00', '08:00:00'],
  ['time_in', '08:00:01', '08:00:01'],
  ['time_in', '08:15:00', '08:15:00'],
  ['time_in', '11:59:00', '11:59:00'],
  ['time_in', '12:00:00', '13:00:00'],
  ['time_in', '12:30:00', '13:00:00'],
  ['time_in', '12:59:00', '13:00:00'],
  ['time_in', '13:00:00', '13:00:00'],
  ['time_in', '13:01:00', '13:01:00'],
  ['time_out', '11:59:00', '11:59:00'],
  ['time_out', '12:00:00', '13:00:00'],
  ['time_out', '12:30:00', '13:00:00'],
  ['time_out', '12:59:00', '13:00:00'],
  ['time_out', '13:00:00', '13:00:00'],
  ['time_out', '13:01:00', '13:01:00'],
  ['time_out', '16:59:59', '16:59:59'],
  ['time_out', '17:00:01', '17:00:00'],
  ['time_out', '18:00:00', '17:00:00'],
]) {
  test(`scan persists raw and processed values separately: ${scanType} ${localTime}`, async t => {
    const raw = new Date(`2026-10-26T${localTime}+08:00`).toISOString();
    const recorded = new Date(`2026-10-26T${expected}+08:00`).toISOString();
    t.mock.timers.enable({ apis: ['Date'], now: new Date(raw) });
    const isOut = scanType === 'time_out';
    const writes = mockDatabase({
      logs: isOut ? [{ scan_type: 'time_in', scan_time: '2026-10-26T00:00:00Z' }] : [],
      existingRecord: isOut ? { id: 30, actual_time_in: '2026-10-25T23:30:00Z' } : null,
    });
    const response = await scanAttendance({ qr_code: 'VALID', user, photo, face_embedding: face });
    const log = writes.find(write => write.table === 'attendance_logs').payload[0];
    const recordWrite = writes.find(write => write.table === 'attendance_records');
    const record = isOut ? recordWrite.payload : recordWrite.payload[0];
    assert.equal(log.actual_scan_time, raw);
    assert.equal(log.scan_time, raw, 'scan ordering and duplicate checks must use the raw time');
    assert.equal(log.recorded_scan_time, recorded);
    assert.equal(record[`actual_${scanType}`], raw);
    assert.equal(record[`recorded_${scanType}`], recorded);
    if (isOut) assert.equal(Object.hasOwn(record, 'actual_time_in'), false);
    assert.equal(response.scan_time, recorded);
  });
}

test('a scan without an assigned profile still applies the regular boundary', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-26T07:30:00+08:00') });
  const writes = mockDatabase({ profile: null });
  await scanAttendance({ qr_code: 'VALID', user, photo, face_embedding: face });
  assert.equal(writes.find(write => write.table === 'attendance_logs').payload[0].recorded_scan_time, '2026-10-26T00:00:00.000Z');
});

test('an explicit custom profile retains its existing recording behavior', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-26T09:15:00+08:00') });
  const writes = mockDatabase({ profile: { ...regularProfile, profile_name: 'Individual: Test [Ongoing]', time_in: '09:00:00', time_out: '18:00:00' } });
  await scanAttendance({ qr_code: 'VALID', user, photo, face_embedding: face });
  assert.equal(writes.find(write => write.table === 'attendance_logs').payload[0].recorded_scan_time, '2026-10-26T01:00:00.000Z');
});

test('a disabled custom schedule scan applies standard DTR rules (8:00 AM floor)', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-26T07:30:00+08:00') });
  const writes = mockDatabase({ profile: { ...regularProfile, profile_name: 'Individual: Test [Ongoing]', first_scan_enabled: false } });
  await scanAttendance({ qr_code: 'VALID', user, photo, face_embedding: face });
  assert.equal(writes.find(write => write.table === 'attendance_logs').payload[0].recorded_scan_time, '2026-10-26T00:00:00.000Z');
  assert.equal(writes.find(write => write.table === 'attendance_logs').payload[0].actual_scan_time, '2026-10-25T23:30:00.000Z');
});

test('a disabled custom schedule scan during lunch normalizes to 1:00 PM', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-26T12:30:00+08:00') });
  const writes = mockDatabase({ profile: { ...regularProfile, profile_name: 'Individual: Test [Ongoing]', first_scan_enabled: false } });
  await scanAttendance({ qr_code: 'VALID', user, photo, face_embedding: face });
  assert.equal(writes.find(write => write.table === 'attendance_logs').payload[0].recorded_scan_time, '2026-10-26T05:00:00.000Z');
});

test('a named shared custom schedule still overrides scans even with regular hours', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-26T09:15:00+08:00') });
  const writes = mockDatabase({ profile: { ...regularProfile, profile_name: 'Approved training schedule' } });
  await scanAttendance({ qr_code: 'VALID', user, photo, face_embedding: face });
  assert.equal(writes.find(write => write.table === 'attendance_logs').payload[0].recorded_scan_time, '2026-10-26T00:00:00.000Z');
});

test('manual corrections preserve raw audit times and return precise recorded times', async () => {
  const raw = '2026-10-26T07:30:12.345+08:00';
  const log = { id: 1, intern_id: 7, scan_type: 'time_in', scan_time: raw, actual_scan_time: raw, recorded_scan_time: '2026-10-26T08:00:00+08:00' };
  const writes = mockDatabase({ logs: [log], existingRecord: { id: 30, actual_time_in: raw, recorded_time_in: log.recorded_scan_time, status: 'approved' } });
  const response = await editDtrRecord({ internId: 7, date: '2026-10-26', time_in: '07:00:01.123', reason: 'Approved manual correction', modified_by: 9 });
  const logUpdate = writes.find(write => write.table === 'attendance_logs').payload;
  const recordUpdate = writes.find(write => write.table === 'attendance_records').payload;
  assert.equal(Object.hasOwn(logUpdate, 'actual_scan_time'), false);
  assert.equal(Object.hasOwn(logUpdate, 'scan_time'), false);
  assert.equal(Object.hasOwn(recordUpdate, 'actual_time_in'), false);
  assert.equal(logUpdate.recorded_scan_time, '2026-10-25T23:00:01.123Z');
  assert.equal(recordUpdate.recorded_time_in, '2026-10-25T23:00:01.123Z');
  assert.equal(response.recorded_time_in, '07:00:01.123');
  const history = writes.find(write => write.table === 'dtr_edit_history').payload;
  assert.equal(history.find(entry => entry.field_name === 'Time In').new_value, '07:00:01.123 AM');
});

test('controlled manual edits attach the approving actor and reason without touching the scan', async () => {
  const raw = '2026-10-26T08:13:00+08:00';
  const log = { id: 1, intern_id: 7, scan_type: 'time_in', scan_time: raw, actual_scan_time: raw, recorded_scan_time: '2026-10-26T08:00:00+08:00', superadmin_controlled: true };
  const writes = mockDatabase({ logs: [log], existingRecord: { id: 30, recorded_time_in: log.recorded_scan_time, status: 'approved' } });
  await editDtrRecord({ internId: 7, date: '2026-10-26', time_in: '08:05', reason: 'Approved morning correction', modified_by: 9 });
  const update = writes.find(write => write.action === 'apply_controlled_dtr_edit').payload.p_log_updates[0].changes;
  assert.equal(update.adjustment_mode, 'manual');
  assert.equal(update.adjustment_reason, 'Approved morning correction');
  assert.equal(update.adjustment_approved_by, 9);
  assert.equal(Object.hasOwn(update, 'actual_scan_time'), false);
});

test('a rejected controlled log edit cannot report success or update the DTR mirror', async () => {
  const log = { id: 1, intern_id: 7, scan_type: 'time_in', scan_time: '2026-10-26T08:13:00+08:00', actual_scan_time: '2026-10-26T08:13:00+08:00', recorded_scan_time: '2026-10-26T08:00:00+08:00', superadmin_controlled: true };
  const writes = mockDatabase({ logs: [log], existingRecord: { id: 30, recorded_time_in: log.recorded_scan_time, status: 'approved' }, logUpdateError: { message: 'audit unavailable' } });
  await assert.rejects(editDtrRecord({ internId: 7, date: '2026-10-26', time_in: '08:05', reason: 'Approved morning correction', modified_by: 9 }), /audit unavailable/);
  assert.equal(writes.filter(write => write.table === 'attendance_records').length, 0);
});

test('Superadmin DTR history includes original scans and automatic policy adjustments', async () => {
  mockDatabase({ scanAudits: [{ id: 12, account_id: 7, account_name: 'Test intern', attendance_date: '2026-10-26',
    actual_scan_time: '2026-10-26T00:13:00Z', dtr_time: '2026-10-26T00:00:00Z', time_adjusted: true,
    adjustment_mode: 'automatic', approved_by: 9, reason: 'Approved regular morning policy', created_at: '2026-10-26T00:13:00Z' }] });
  const history = await getDtrEditHistory({ internId: 7 });
  assert.equal(history.length, 1);
  assert.equal(history[0].actual_scan_time, '2026-10-26T00:13:00Z');
  assert.equal(history[0].dtr_time, '2026-10-26T00:00:00Z');
  assert.equal(history[0].adjustment_mode, 'automatic');
  assert.equal(history[0].reason, 'Approved regular morning policy');
});

test('protected DTR deletion stops before deleting photos, logs, or records', async () => {
  const writes = mockDatabase({ logs: [{ id: 1, superadmin_controlled: true, scan_type: 'time_in' }], existingRecord: { id: 30 } });
  await assert.rejects(deleteDtrAttendance({ internId: 7, date: '2026-10-26', reason: 'Requested deletion', modified_by: 9 }), /protected/i);
  assert.equal(writes.length, 0);
});

test('legacy protected scans use the atomic correction path after unassignment', async () => {
  const log = { id: 1, intern_id: 7, scan_type: 'time_in', scan_time: '2026-10-26T08:13+08:00', actual_scan_time: '2026-10-26T08:13+08:00', recorded_scan_time: '2026-10-26T08:13+08:00' };
  const writes = mockDatabase({ logs: [log], scanAudits: [{ attendance_log_id: 1 }], existingRecord: { id: 30, recorded_time_in: log.recorded_scan_time, status: 'approved' } });
  await editDtrRecord({ internId: 7, date: '2026-10-26', time_in: '08:05', reason: 'Approved correction', modified_by: 9 });
  assert.equal(writes.filter(write => write.action === 'apply_controlled_dtr_edit').length, 1);
  assert.equal(writes.filter(write => write.table === 'attendance_logs').length, 0);
});

for (const failedLookup of ['logReadError', 'recordReadError']) {
  test(`DTR edits stop before writes if ${failedLookup} prevents protection checks`, async () => {
    const writes = mockDatabase({ existingRecord: { id: 30 }, [failedLookup]: { message: 'Database read failed' } });
    await assert.rejects(editDtrRecord({ internId: 7, date: '2026-10-26', time_in: '08:05', reason: 'Approved correction', modified_by: 9 }), /Database read failed/);
    assert.equal(writes.length, 0);
  });
}

test('saving an early scan pair retains its complete DTR and original scan order', async () => {
  const logs = [
    { id: 1, intern_id: 7, scan_type: 'time_in', scan_time: '2026-10-26T07:30:00+08:00', actual_scan_time: '2026-10-26T07:30:00+08:00', recorded_scan_time: '2026-10-26T08:00:00+08:00', approval_status: 'approved' },
    { id: 2, intern_id: 7, scan_type: 'time_out', scan_time: '2026-10-26T07:45:00+08:00', actual_scan_time: '2026-10-26T07:45:00+08:00', recorded_scan_time: '2026-10-26T07:45:00+08:00', approval_status: 'approved' },
  ];
  const writes = mockDatabase({ logs, existingRecord: { id: 30, recorded_time_in: logs[0].recorded_scan_time, recorded_time_out: logs[1].recorded_scan_time, status: 'approved' } });
  await editDtrRecord({ internId: 7, date: '2026-10-26', time_in: '08:00', time_out: '07:45', status: 'approved', reason: 'Verified attendance', modified_by: 9 });
  const updatedLogs = logs.map(log => ({ ...log, ...writes.find(write => write.table === 'attendance_logs' && write.args.some(([method, key, value]) => method === 'eq' && key === 'id' && value === log.id)).payload }));
  const [record] = buildDtrRecords(updatedLogs);
  assert.equal(record.time_out, '07:45');
  assert.equal(record.is_complete, true);
  assert.equal(record.approval_status, 'approved');
  assert.equal(record.total_minutes, 0);
});

test('DTR pairing follows original QR instants when stored morning scan values have been capped', () => {
  const [record] = buildDtrRecords([
    { scan_type: 'time_in', scan_time: '2026-10-26T09:20:00+08:00', actual_scan_time: '2026-10-26T08:00:00+08:00', original_scan_time: '2026-10-26T09:20:00+08:00', recorded_scan_time: '2026-10-26T08:00:00+08:00' },
    { scan_type: 'time_out', scan_time: '2026-10-26T09:10:00+08:00', actual_scan_time: '2026-10-26T09:10:00+08:00' },
  ]);
  assert.equal(record.is_complete, false);
});

test('applying a custom schedule leaves all existing DTR records and scans unchanged', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-26T18:00:00+08:00') });
  const writes = mockDatabase({ existingRecord: { id: 30, actual_time_in: '2026-10-26T00:10:00Z', actual_time_out: '2026-10-26T09:10:00Z' } });
  await setIndividualAttendanceControl(7, { mode: 'custom', custom_schedule: { time_in: '09:00', time_out: '18:00' }, assigned_by: 9 });
  assert.equal(writes.filter(write => ['attendance_logs', 'attendance_records'].includes(write.table)).length, 0);
});

test('a Superadmin-assigned regular morning policy records 08:00 while retaining the 08:13 scan', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-26T08:13:27+08:00') });
  const writes = mockDatabase({ assignment: { attendance_profile_id: 1, assigned_by: 9, approver: { role: 'superadmin' } } });
  await scanAttendance({ qr_code: 'VALID', user, photo, face_embedding: face });
  const log = writes.find(write => write.table === 'attendance_logs').payload[0];
  assert.equal(log.actual_scan_time, '2026-10-26T00:13:27.000Z');
  assert.equal(log.scan_time, '2026-10-26T00:13:27.000Z');
  assert.equal(log.recorded_scan_time, '2026-10-26T00:00:00.000Z');
});

for (const [name, assignment, profile, local, expected, logs] of [
  ['unassigned', null, regularProfile, '08:13:27', '08:13:27', []],
  ['non-administrator assignment', { attendance_profile_id: 1, assigned_by: 11, approver: { role: 'supervisor' } }, regularProfile, '08:13:27', '08:13:27', []],
  ['disabled first scan', { attendance_profile_id: 1, assigned_by: 9, approver: { role: 'superadmin' } }, { ...regularProfile, first_scan_enabled: false }, '08:13:27', '08:13:27', []],
  ['lunch', { attendance_profile_id: 1, assigned_by: 9, approver: { role: 'superadmin' } }, regularProfile, '12:30:00', '13:00:00', []],
  ['afternoon time-out', { attendance_profile_id: 1, assigned_by: 9, approver: { role: 'superadmin' } }, regularProfile, '16:42:00', '16:42:00', [{ scan_type: 'time_in', scan_time: '2026-10-26T00:00:00Z' }]],
]) {
  test(`additional morning policy leaves ${name} behavior unchanged`, async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date(`2026-10-26T${local}+08:00`) });
    const writes = mockDatabase({ assignment, profile, logs });
    await scanAttendance({ qr_code: 'VALID', user, photo, face_embedding: face });
    const log = writes.find(write => write.table === 'attendance_logs').payload[0];
    assert.equal(log.recorded_scan_time, new Date(`2026-10-26T${expected}+08:00`).toISOString());
    assert.equal(log.actual_scan_time, new Date(`2026-10-26T${local}+08:00`).toISOString());
  });
}

for (const profile of [
  { ...regularProfile, id: 2, profile_name: 'Individual: Expired [2026-10-01..2026-10-25]' },
  { ...regularProfile, id: 2, profile_name: 'Individual: Future [2026-10-27..2026-10-30]' },
  { ...regularProfile, id: 2, status: 'inactive' },
]) {
  test(`an ineffective Superadmin policy does not adjust late arrival: ${profile.profile_name} ${profile.status || ''}`, async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-26T08:13:00+08:00') });
    const writes = mockDatabase({ profile, fallbackProfile: regularProfile,
      assignment: { attendance_profile_id: 2, assigned_by: 9, approver: { role: 'superadmin' } } });
    await scanAttendance({ qr_code: 'VALID', user, photo, face_embedding: face });
    assert.equal(writes.find(write => write.table === 'attendance_logs').payload[0].recorded_scan_time, '2026-10-26T00:13:00.000Z');
  });
}

test('missing audit columns cannot cause a successful lossy fallback insert', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-26T07:30:00+08:00') });
  const writes = mockDatabase({ insertError: { code: 'PGRST204', message: 'actual_scan_time is missing' } });
  await assert.rejects(() => scanAttendance({ qr_code: 'VALID', user, photo, face_embedding: face }), /Failed to record attendance/);
  assert.equal(writes.filter(write => write.table === 'attendance_logs').length, 1);
});

test('history, DTR export input, and generated reports agree on processed values', async () => {
  const logs = [
    { id: 1, intern_id: 7, scan_type: 'time_in', scan_time: '2026-10-26T07:30:00+08:00', actual_scan_time: '2026-10-26T07:30:00+08:00', recorded_scan_time: '2026-10-26T08:00:00+08:00', approval_status: 'approved' },
    { id: 2, intern_id: 7, scan_type: 'time_out', scan_time: '2026-10-26T18:00:00+08:00', actual_scan_time: '2026-10-26T18:00:00+08:00', recorded_scan_time: '2026-10-26T17:00:00+08:00', approval_status: 'approved' },
  ];
  mockDatabase({ logs });
  const history = await getAttendanceLogs();
  assert.equal(history.logs[0].scan_time, logs[0].recorded_scan_time);
  assert.equal(history.logs[1].scan_time, logs[1].recorded_scan_time);
  assert.equal(history.logs[0].actual_scan_time, logs[0].actual_scan_time);
  const [dtr] = await getDtrRecords(7, { month: 10, year: 2026 });
  assert.equal(dtr.time_in, '08:00');
  assert.equal(dtr.time_out, '17:00');
  assert.equal(dtr.total_minutes, 480);
  const [report] = await getAttendanceReport({ month: 10, year: 2026 });
  assert.equal(report.total_minutes, 480);
  assert.equal(report.rendered_minutes, 480);
});
