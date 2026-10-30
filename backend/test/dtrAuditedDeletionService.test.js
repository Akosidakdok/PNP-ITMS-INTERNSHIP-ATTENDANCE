import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL ||= 'http://dtr-delete.test';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-key';
const { supabase } = await import('../src/supabaseClient.js');
const { deleteDtrAttendance } = await import('../src/services/attendanceControlService.js');
const originalRpc = supabase.rpc;
const originalFrom = supabase.from;
afterEach(() => { supabase.rpc = originalRpc; supabase.from = originalFrom; });

function database(error = null) {
  const calls = [];
  // The backend must not issue separate destructive writes before the audited transaction.
  supabase.from = () => { throw new Error('Deletion must use the atomic RPC'); };
  supabase.rpc = async (name, params) => {
    calls.push({ name, params });
    return { data: error ? null : { success: true, deletedLogsCount: 2, deletedRecord: true, audit_preserved: true }, error };
  };
  return calls;
}

test('DTR deletion uses one audited transaction with the actor, target, date and trimmed reason', async () => {
  const calls = database();
  const result = await deleteDtrAttendance({ internId: '7', date: '2026-10-29', modified_by: 10,
    reason: '  Duplicate attendance  ', target: 'all' });
  assert.equal(result.success, true);
  assert.equal(result.audit_preserved, true);
  assert.deepEqual(calls, [{ name: 'delete_admin_dtr_attendance', params: {
    p_account_id: 7, p_date: '2026-10-29', p_actor_id: 10, p_reason: 'Duplicate attendance', p_target: 'all',
  } }]);
});

for (const [code, message, status] of [
  ['42501', 'Admin access required', 403],
  ['P0001', 'audit unavailable', 500],
  ['PGRST202', 'Function not found', 503],
]) {
  test(`DTR deletion propagates ${code} without separate cleanup writes`, async () => {
    const calls = database({ code, message });
    await assert.rejects(deleteDtrAttendance({ internId: 7, date: '2026-10-29', modified_by: 10,
      reason: 'Duplicate', target: 'all' }), error =>
      error.statusCode === status && (status !== 503 || /database update/i.test(error.message)));
    assert.equal(calls.length, 1);
  });
}

test('invalid deletion targets and missing actors fail before accessing the database', async () => {
  const calls = database();
  for (const [patch, status] of [[{ target: 'invalid' }, 400], [{ modified_by: null }, 403], [{ internId: 'invalid' }, 400]]) {
    await assert.rejects(deleteDtrAttendance({ internId: 7, date: '2026-10-29', modified_by: 10,
      reason: 'Duplicate', target: 'all', ...patch }), error => error.statusCode === status);
  }
  assert.equal(calls.length, 0);
});
