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
