import { supabase } from '../supabaseClient.js';

/** Evidence remains authoritative after unassignment, including legacy rows. */
export async function hasProtectedScans(logs = []) {
  if (logs.some(log => log.superadmin_controlled)) return true;
  const ids = logs.map(log => log.id).filter(Boolean);
  if (!ids.length) return false;
  const { data, error } = await supabase.from('attendance_scan_audit')
    .select('attendance_log_id').in('attendance_log_id', ids).limit(1);
  if (error) throw new Error(`Failed to check protected scan evidence: ${error.message}`);
  return Boolean(data?.length);
}

export async function assertScansDeletable(logs) {
  if (await hasProtectedScans(logs)) {
    const err = new Error('Actual QR scans are protected. Use an audited DTR correction or archive the account instead of deleting scan evidence.');
    err.statusCode = 409;
    throw err;
  }
}

/** Individual admin deletion keeps the original QR evidence in immutable audit rows. */
export async function deleteProtectedScan(attendance, user, { rescan = false } = {}) {
  if (!await hasProtectedScans([attendance])) return null;
  if (!['admin', 'superadmin'].includes(user?.role) || !Number.isSafeInteger(Number(user?.id)) || Number(user.id) <= 0) {
    const error = new Error('Admin access required to delete protected attendance.');
    error.statusCode = 403;
    throw error;
  }
  const { data, error } = await supabase.rpc('delete_admin_attendance_entry', {
    p_attendance_id: Number(attendance.id),
    p_actor_id: Number(user.id),
    p_rescan: rescan,
  });
  if (error) {
    const missingMigration = ['PGRST202', '42883'].includes(error.code);
    const failure = new Error(missingMigration
      ? 'Admin attendance deletion requires the latest database update. Ask the system administrator to apply it.'
      : error.message);
    failure.statusCode = missingMigration ? 503 : ({ '42501': 403, P0002: 404, '23514': 409 }[error.code] || 500);
    throw failure;
  }
  return data;
}
