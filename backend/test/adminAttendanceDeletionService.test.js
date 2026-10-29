import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL ||= 'http://attendance-delete.test';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-key';
const { supabase } = await import('../src/supabaseClient.js');
const { deleteAttendanceEntry, removeRejectedAttendanceForRescan } = await import('../src/data.js');
const originalFrom = supabase.from;
const originalRpc = supabase.rpc;
afterEach(() => { supabase.from = originalFrom; supabase.rpc = originalRpc; });

function database({ rpcError = null, protectedScan = true, status = 'rejected', rescan = false } = {}) {
  const log = { id: 41, intern_id: 7, scan_type: 'time_in', scan_time: new Date().toISOString(),
    approval_status: status, superadmin_controlled: protectedScan };
  const writes = [];
  supabase.from = table => {
    let deleting = false;
    const result = () => {
      if (deleting) { writes.push(table); return { data: log, error: null }; }
      if (table === 'attendance_logs') return { data: log, error: null };
      if (table === 'attendance_scan_audit') return { data: [], error: null };
      return { data: null, error: null };
    };
    const query = {};
    for (const method of ['select','eq','or','gte','lt','order','limit','in']) query[method] = () => query;
    query.delete = () => { deleting = true; return query; };
    query.single = query.maybeSingle = async () => result();
    query.then = (resolve, reject) => Promise.resolve(result()).then(resolve, reject);
    return query;
  };
  supabase.rpc = async (name, params) => {
    assert.equal(name, 'delete_admin_attendance_entry');
    assert.equal(params.p_attendance_id, 41);
    assert.equal(params.p_actor_id, 10);
    assert.equal(params.p_rescan, rescan);
    writes.push('rpc');
    return { data: rpcError ? null : { removed: log, audit_preserved: true }, error: rpcError };
  };
  return writes;
}

test('admin can delete a protected entry through the audited transaction', async () => {
  database();
  const result = await deleteAttendanceEntry(41, { id: 10, role: 'admin' });
  assert.equal(result.removed.id, 41);
  assert.equal(result.audit_preserved, true);
});

test('admin can remove a protected rejected scan for rescanning', async () => {
  database({ rescan: true });
  const result = await removeRejectedAttendanceForRescan(41, { id: 10, role: 'admin' });
  assert.equal(result.removed.id, 41);
  assert.equal(result.audit_preserved, true);
});

test('supervisor and missing actors cannot delete protected entries', async () => {
  const writes = database();
  for (const actor of [{ id: 11, role: 'supervisor' }, undefined]) {
    await assert.rejects(deleteAttendanceEntry(41, actor), error => error.statusCode === 403);
  }
  assert.deepEqual(writes, []);
});

test('failed audited deletion never cleans up selfies or attachments', async () => {
  const writes = database({ rpcError: { code: '42501', message: 'Admin access required' } });
  await assert.rejects(deleteAttendanceEntry(41, { id: 10, role: 'admin' }), error => error.statusCode === 403);
  assert.deepEqual(writes, ['rpc']);
});

test('missing database migration returns an actionable error without deleting files', async () => {
  const writes = database({ rpcError: { code: 'PGRST202', message: 'Function not found' } });
  await assert.rejects(deleteAttendanceEntry(41, { id: 10, role: 'admin' }), error =>
    error.statusCode === 503 && /latest database update/.test(error.message));
  assert.deepEqual(writes, ['rpc']);
});

test('unprotected entries retain existing supervisor deletion behavior', async () => {
  database({ protectedScan: false });
  assert.equal((await deleteAttendanceEntry(41, { id: 11, role: 'supervisor' })).removed.id, 41);
});

test('rescan cannot remove an approved entry', async () => {
  const writes = database({ status: 'approved' });
  await assert.rejects(removeRejectedAttendanceForRescan(41, { id: 10, role: 'admin' }), /Only rejected/);
  assert.deepEqual(writes, []);
});
