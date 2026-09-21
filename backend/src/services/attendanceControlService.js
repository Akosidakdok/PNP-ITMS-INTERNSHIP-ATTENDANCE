import { supabase } from '../supabaseClient.js';
import { getPhtDateKey, getPhtDayBoundsUtc, PHT_UTC_OFFSET_MS } from '../utils/attendanceTime.js';

/**
 * Normalizes time string to HH:MM:SS (24-hour)
 */
export function normalizeTimeString(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const trimmed = timeStr.trim();
  
  // Match 12-hour format e.g. "8:00 AM", "08:15 PM"
  const ampmMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10);
    const minutes = parseInt(ampmMatch[2], 10);
    const seconds = ampmMatch[3] ? parseInt(ampmMatch[3], 10) : 0;
    const isPm = ampmMatch[4].toUpperCase() === 'PM';
    if (isPm && hours < 12) hours += 12;
    if (!isPm && hours === 12) hours = 0;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  // Match 24-hour format e.g. "08:00", "17:00:00"
  const standardMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (standardMatch) {
    const hours = parseInt(standardMatch[1], 10);
    const minutes = parseInt(standardMatch[2], 10);
    const seconds = standardMatch[3] ? parseInt(standardMatch[3], 10) : 0;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return null;
}

/**
 * Constructs a UTC ISO timestamp for a Philippine local date and time
 */
export function buildPhtTimestamp(dateStr, timeStr) {
  const normalizedTime = normalizeTimeString(timeStr);
  if (!normalizedTime) return null;
  const [hours, minutes, seconds] = normalizedTime.split(':').map(Number);
  
  const [year, month, day] = dateStr.split('-').map(Number);
  // Date.UTC in UTC, minus PHT offset (+8h)
  const utcMs = Date.UTC(year, month - 1, day, hours, minutes, seconds) - PHT_UTC_OFFSET_MS;
  return new Date(utcMs).toISOString();
}

/**
 * Formats a timestamp into PHT HH:MM (e.g. "08:00")
 */
export function formatPhtTime(timestamp) {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return '';
  const phtDate = new Date(d.getTime() + PHT_UTC_OFFSET_MS);
  return phtDate.toISOString().slice(11, 16);
}

// ─────────────────────────────────────────────────────────────
// ATTENDANCE PROFILES MANAGEMENT
// ─────────────────────────────────────────────────────────────

export async function listAttendanceProfiles() {
  const { data: profiles, error } = await supabase
    .from('attendance_profiles')
    .select('*')
    .order('id', { ascending: true });

  if (error) {
    console.error('Error fetching attendance profiles:', error);
    throw new Error('Failed to retrieve attendance profiles');
  }

  // Count assigned accounts per profile
  const { data: assignments, error: assignError } = await supabase
    .from('account_attendance_profiles')
    .select('attendance_profile_id');

  const countMap = {};
  if (!assignError && assignments) {
    for (const a of assignments) {
      countMap[a.attendance_profile_id] = (countMap[a.attendance_profile_id] || 0) + 1;
    }
  }

  return (profiles || []).map(p => ({
    ...p,
    assigned_accounts_count: countMap[p.id] || 0,
  }));
}

export async function getAttendanceProfileById(id) {
  const { data, error } = await supabase
    .from('attendance_profiles')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    throw new Error('Attendance profile not found');
  }
  return data;
}

export async function createAttendanceProfile(payload) {
  const {
    profile_name,
    time_in = '08:00:00',
    time_out = '17:00:00',
    first_scan_enabled = true,
    second_scan_enabled = true,
    status = 'active',
  } = payload;

  if (!profile_name || !profile_name.trim()) {
    const err = new Error('Profile name is required');
    err.statusCode = 400;
    throw err;
  }

  const normalizedIn = normalizeTimeString(time_in) || '08:00:00';
  const normalizedOut = normalizeTimeString(time_out) || '17:00:00';

  const { data, error } = await supabase
    .from('attendance_profiles')
    .insert([
      {
        profile_name: profile_name.trim(),
        time_in: normalizedIn,
        time_out: normalizedOut,
        first_scan_enabled: Boolean(first_scan_enabled),
        second_scan_enabled: Boolean(second_scan_enabled),
        status: status === 'inactive' ? 'inactive' : 'active',
        updated_at: new Date().toISOString(),
      },
    ])
    .select()
    .single();

  if (error) {
    console.error('Error creating profile:', error);
    throw new Error('Failed to create attendance profile');
  }
  return data;
}

export async function updateAttendanceProfile(id, payload) {
  const {
    profile_name,
    time_in,
    time_out,
    first_scan_enabled,
    second_scan_enabled,
    status,
  } = payload;

  const updates = { updated_at: new Date().toISOString() };
  if (profile_name !== undefined) {
    if (!profile_name.trim()) {
      const err = new Error('Profile name cannot be empty');
      err.statusCode = 400;
      throw err;
    }
    updates.profile_name = profile_name.trim();
  }
  if (time_in !== undefined) {
    const normalizedIn = normalizeTimeString(time_in);
    if (!normalizedIn) {
      const err = new Error('Invalid Time In format');
      err.statusCode = 400;
      throw err;
    }
    updates.time_in = normalizedIn;
  }
  if (time_out !== undefined) {
    const normalizedOut = normalizeTimeString(time_out);
    if (!normalizedOut) {
      const err = new Error('Invalid Time Out format');
      err.statusCode = 400;
      throw err;
    }
    updates.time_out = normalizedOut;
  }
  if (first_scan_enabled !== undefined) {
    updates.first_scan_enabled = Boolean(first_scan_enabled);
  }
  if (second_scan_enabled !== undefined) {
    updates.second_scan_enabled = Boolean(second_scan_enabled);
  }
  if (status !== undefined) {
    updates.status = status === 'inactive' ? 'inactive' : 'active';
  }

  const { data, error } = await supabase
    .from('attendance_profiles')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating profile:', error);
    throw new Error('Failed to update attendance profile');
  }
  return data;
}

export async function toggleAttendanceProfileStatus(id, status) {
  const newStatus = status === 'active' ? 'active' : 'inactive';
  return updateAttendanceProfile(id, { status: newStatus });
}

// ─────────────────────────────────────────────────────────────
// ACCOUNT ASSIGNMENTS MANAGEMENT
// ─────────────────────────────────────────────────────────────

export async function getAssignedProfileForAccount(accountId) {
  if (!accountId) return null;

  const { data: assignment, error: assignError } = await supabase
    .from('account_attendance_profiles')
    .select('attendance_profile_id')
    .eq('account_id', accountId)
    .maybeSingle();

  if (assignError || !assignment) return null;

  const { data: profile, error: profError } = await supabase
    .from('attendance_profiles')
    .select('*')
    .eq('id', assignment.attendance_profile_id)
    .eq('status', 'active')
    .maybeSingle();

  if (profError || !profile) return null;
  return profile;
}

export async function getAccountsWithProfiles() {
  // Fetch all accounts with role 'intern'
  const { data: accounts, error: accError } = await supabase
    .from('accounts')
    .select('id, username, full_name, email, role, student_id, division_name, status')
    .eq('role', 'intern')
    .neq('status', 'archived')
    .order('full_name', { ascending: true });

  if (accError) {
    console.error('Error fetching accounts:', accError);
    throw new Error('Failed to load accounts');
  }

  // Fetch all assignments with profile details
  const { data: assignments, error: assignError } = await supabase
    .from('account_attendance_profiles')
    .select('account_id, attendance_profile_id, assigned_at, attendance_profiles(id, profile_name, time_in, time_out, status)');

  const assignmentMap = new Map();
  if (!assignError && assignments) {
    for (const a of assignments) {
      assignmentMap.set(Number(a.account_id), {
        profile_id: a.attendance_profile_id,
        profile_name: a.attendance_profiles?.profile_name || 'Assigned Profile',
        time_in: a.attendance_profiles?.time_in,
        time_out: a.attendance_profiles?.time_out,
        status: a.attendance_profiles?.status,
        assigned_at: a.assigned_at,
      });
    }
  }

  return (accounts || []).map(acc => ({
    ...acc,
    assigned_profile: assignmentMap.get(Number(acc.id)) || null,
  }));
}

export async function assignProfileToAccounts({ account_ids = [], attendance_profile_id, assigned_by }) {
  if (!attendance_profile_id) {
    const err = new Error('Attendance profile ID is required');
    err.statusCode = 400;
    throw err;
  }

  const ids = Array.isArray(account_ids) ? account_ids.map(Number).filter(Boolean) : [];
  if (ids.length === 0) {
    const err = new Error('At least one account must be selected');
    err.statusCode = 400;
    throw err;
  }

  // Delete previous assignments for these accounts
  await supabase
    .from('account_attendance_profiles')
    .delete()
    .in('account_id', ids);

  const rows = ids.map(id => ({
    account_id: id,
    attendance_profile_id: Number(attendance_profile_id),
    assigned_at: new Date().toISOString(),
    assigned_by: assigned_by || null,
  }));

  const { data, error } = await supabase
    .from('account_attendance_profiles')
    .insert(rows)
    .select();

  if (error) {
    console.error('Error assigning profiles:', error);
    throw new Error('Failed to assign attendance profile');
  }
  return data;
}

export async function removeAccountProfileAssignment(accountId) {
  if (!accountId) {
    const err = new Error('Account ID is required');
    err.statusCode = 400;
    throw err;
  }

  const { error } = await supabase
    .from('account_attendance_profiles')
    .delete()
    .eq('account_id', Number(accountId));

  if (error) {
    console.error('Error removing assignment:', error);
    throw new Error('Failed to remove attendance profile assignment');
  }
  return { success: true };
}

// ─────────────────────────────────────────────────────────────
// SUPERADMIN DTR EDITING & AUDIT LOGGING
// ─────────────────────────────────────────────────────────────

export async function editDtrRecord({
  internId,
  date,
  time_in,
  time_out,
  status,
  reason,
  modified_by,
}) {
  if (!internId) {
    const err = new Error('Intern ID is required');
    err.statusCode = 400;
    throw err;
  }
  if (!date) {
    const err = new Error('Attendance date is required');
    err.statusCode = 400;
    throw err;
  }
  if (!reason || !reason.trim()) {
    const err = new Error('A modification reason is strictly required before saving');
    err.statusCode = 400;
    throw err;
  }

  const { startIso, endExclusiveIso } = getPhtDayBoundsUtc(date);

  // 1. Fetch existing attendance_records row if it exists
  let { data: record } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('account_id', internId)
    .eq('attendance_date', date)
    .maybeSingle();

  // 2. Fetch existing attendance_logs for this date
  const { data: logs } = await supabase
    .from('attendance_logs')
    .select('*')
    .eq('intern_id', internId)
    .gte('scan_time', startIso)
    .lt('scan_time', endExclusiveIso)
    .order('scan_time', { ascending: true });

  const timeInLog = (logs || []).find(l => l.scan_type === 'time_in');
  const timeOutLog = (logs || []).find(l => l.scan_type === 'time_out');

  // Determine original values
  const origTimeInStr = record?.recorded_time_in
    ? formatPhtTime(record.recorded_time_in)
    : timeInLog ? formatPhtTime(timeInLog.scan_time) : null;

  const origTimeOutStr = record?.recorded_time_out
    ? formatPhtTime(record.recorded_time_out)
    : timeOutLog ? formatPhtTime(timeOutLog.scan_time) : null;

  const origStatus = record?.status || timeInLog?.approval_status || 'pending';

  // Normalize incoming values
  const newTimeInNormalized = time_in ? normalizeTimeString(time_in) : null;
  const newTimeInDisplay = newTimeInNormalized ? newTimeInNormalized.slice(0, 5) : null;

  const newTimeOutNormalized = time_out ? normalizeTimeString(time_out) : null;
  const newTimeOutDisplay = newTimeOutNormalized ? newTimeOutNormalized.slice(0, 5) : null;

  const newStatus = status ? status.toLowerCase() : origStatus;

  // Build timestamps for new recorded times
  const newTimeInIso = newTimeInNormalized ? buildPhtTimestamp(date, newTimeInNormalized) : null;
  const newTimeOutIso = newTimeOutNormalized ? buildPhtTimestamp(date, newTimeOutNormalized) : null;

  // Ensure record exists in attendance_records
  if (!record) {
    const { data: createdRecord, error: createError } = await supabase
      .from('attendance_records')
      .insert([
        {
          account_id: internId,
          attendance_date: date,
          actual_time_in: timeInLog?.actual_scan_time || timeInLog?.scan_time || null,
          recorded_time_in: newTimeInIso || timeInLog?.scan_time || null,
          actual_time_out: timeOutLog?.actual_scan_time || timeOutLog?.scan_time || null,
          recorded_time_out: newTimeOutIso || timeOutLog?.scan_time || null,
          status: newStatus,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (createError) {
      console.error('Error creating attendance_record:', createError);
    } else {
      record = createdRecord;
    }
  }

  const recordId = record?.id || null;
  const historyEntries = [];
  const modifiedAt = new Date().toISOString();

  // Check differences and prepare history entries
  if (newTimeInDisplay && origTimeInStr !== newTimeInDisplay) {
    historyEntries.push({
      attendance_record_id: recordId,
      account_id: internId,
      field_name: 'Time In',
      original_value: origTimeInStr || 'None',
      new_value: newTimeInDisplay,
      modified_by: modified_by || null,
      modified_at: modifiedAt,
      reason: reason.trim(),
    });
  }

  if (newTimeOutDisplay && origTimeOutStr !== newTimeOutDisplay) {
    historyEntries.push({
      attendance_record_id: recordId,
      account_id: internId,
      field_name: 'Time Out',
      original_value: origTimeOutStr || 'None',
      new_value: newTimeOutDisplay,
      modified_by: modified_by || null,
      modified_at: modifiedAt,
      reason: reason.trim(),
    });
  }

  if (status && origStatus !== newStatus) {
    historyEntries.push({
      attendance_record_id: recordId,
      account_id: internId,
      field_name: 'Status',
      original_value: origStatus,
      new_value: newStatus,
      modified_by: modified_by || null,
      modified_at: modifiedAt,
      reason: reason.trim(),
    });
  }

  // Insert audit history
  if (historyEntries.length > 0) {
    const { error: histError } = await supabase
      .from('dtr_edit_history')
      .insert(historyEntries);

    if (histError) {
      console.error('Failed to write dtr_edit_history audit log:', histError);
    }
  }

  // Update attendance_records
  const recordUpdates = {
    updated_at: modifiedAt,
    status: newStatus,
  };
  if (newTimeInIso) recordUpdates.recorded_time_in = newTimeInIso;
  if (newTimeOutIso) recordUpdates.recorded_time_out = newTimeOutIso;

  if (recordId) {
    await supabase
      .from('attendance_records')
      .update(recordUpdates)
      .eq('id', recordId);
  }

  // Synchronize attendance_logs so calculations and reports stay consistent
  if (newTimeInIso) {
    if (timeInLog) {
      await supabase
        .from('attendance_logs')
        .update({
          scan_time: newTimeInIso,
          recorded_scan_time: newTimeInIso,
          approval_status: newStatus,
        })
        .eq('id', timeInLog.id);
    } else {
      await supabase
        .from('attendance_logs')
        .insert([
          {
            intern_id: internId,
            scan_type: 'time_in',
            scan_time: newTimeInIso,
            recorded_scan_time: newTimeInIso,
            actual_scan_time: newTimeInIso,
            approval_status: newStatus,
            attendance_record_id: recordId,
          },
        ]);
    }
  }

  if (newTimeOutIso) {
    if (timeOutLog) {
      await supabase
        .from('attendance_logs')
        .update({
          scan_time: newTimeOutIso,
          recorded_scan_time: newTimeOutIso,
          approval_status: newStatus,
        })
        .eq('id', timeOutLog.id);
    } else {
      await supabase
        .from('attendance_logs')
        .insert([
          {
            intern_id: internId,
            scan_type: 'time_out',
            scan_time: newTimeOutIso,
            recorded_scan_time: newTimeOutIso,
            actual_scan_time: newTimeOutIso,
            approval_status: newStatus,
            attendance_record_id: recordId,
          },
        ]);
    }
  }

  return {
    success: true,
    modified_fields_count: historyEntries.length,
    recorded_time_in: newTimeInDisplay || origTimeInStr,
    recorded_time_out: newTimeOutDisplay || origTimeOutStr,
    status: newStatus,
  };
}

// ─────────────────────────────────────────────────────────────
// DTR EDIT HISTORY QUERY (SUPERADMIN ONLY)
// ─────────────────────────────────────────────────────────────

export async function getDtrEditHistory({ internId, date, limit = 100 } = {}) {
  let query = supabase
    .from('dtr_edit_history')
    .select(`
      id,
      attendance_record_id,
      account_id,
      field_name,
      original_value,
      new_value,
      modified_by,
      modified_at,
      reason,
      attendance_records ( attendance_date ),
      accounts!dtr_edit_history_account_id_fkey ( full_name, username, student_id ),
      modifier:accounts!dtr_edit_history_modified_by_fkey ( full_name, username, role )
    `)
    .order('modified_at', { ascending: false })
    .limit(limit);

  if (internId) {
    query = query.eq('account_id', Number(internId));
  }

  const { data, error } = await query;
  if (error) {
    // Fallback query if joins fail on complex relations
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('dtr_edit_history')
      .select('*')
      .order('modified_at', { ascending: false })
      .limit(limit);

    if (fallbackError) {
      console.error('Error fetching dtr_edit_history:', fallbackError);
      throw new Error('Failed to retrieve DTR edit history');
    }

    // Fetch accounts manually for names
    const userIds = [...new Set([
      ...(fallbackData || []).map(r => r.account_id),
      ...(fallbackData || []).map(r => r.modified_by),
    ].filter(Boolean))];

    const { data: accountsList } = await supabase
      .from('accounts')
      .select('id, full_name, username, role')
      .in('id', userIds);

    const accMap = new Map((accountsList || []).map(a => [a.id, a]));

    return (fallbackData || []).map(item => ({
      id: item.id,
      attendance_record_id: item.attendance_record_id,
      account_id: item.account_id,
      account_name: accMap.get(item.account_id)?.full_name || accMap.get(item.account_id)?.username || `Account #${item.account_id}`,
      attendance_date: item.attendance_date || '',
      field_name: item.field_name,
      original_value: item.original_value,
      new_value: item.new_value,
      modified_by_name: accMap.get(item.modified_by)?.full_name || accMap.get(item.modified_by)?.username || 'Superadmin',
      modified_by_role: accMap.get(item.modified_by)?.role || 'superadmin',
      modified_at: item.modified_at,
      reason: item.reason,
    }));
  }

  return (data || []).map(item => ({
    id: item.id,
    attendance_record_id: item.attendance_record_id,
    account_id: item.account_id,
    account_name: item.accounts?.full_name || item.accounts?.username || `Account #${item.account_id}`,
    attendance_date: item.attendance_records?.attendance_date || '',
    field_name: item.field_name,
    original_value: item.original_value,
    new_value: item.new_value,
    modified_by_name: item.modifier?.full_name || item.modifier?.username || 'Superadmin',
    modified_by_role: item.modifier?.role || 'superadmin',
    modified_at: item.modified_at,
    reason: item.reason,
  }));
}
