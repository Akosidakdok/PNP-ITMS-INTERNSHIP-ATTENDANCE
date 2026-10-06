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
 * Formats a timestamp or time string into 12-hour AM/PM format (e.g. "08:00 AM", "05:00 PM")
 */
export function format12HourTime(timeStr) {
  if (!timeStr) return '';
  const normalized = normalizeTimeString(timeStr);
  if (!normalized) return timeStr;
  const [h, m] = normalized.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayHours = h % 12 || 12;
  return `${String(displayHours).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

/**
 * Formats a YYYY-MM-DD string into "MMMM dd, yyyy" (e.g. "September 22, 2026")
 */
export function formatDateDisplay(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dateStr;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return `${monthNames[monthIndex]} ${day}, ${year}`;
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
// ATTENDANCE PROFILES MANAGEMENT & EFFECTIVITY
// ─────────────────────────────────────────────────────────────

export function addDaysToDateKey(dateKey, numDays = 0) {
  if (!dateKey) return dateKey;
  const [year, month, day] = dateKey.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + Number(numDays)));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function parseProfileEffectivity(profileName) {
  if (!profileName || typeof profileName !== 'string') {
    return {
      isIndividual: false,
      durationType: 'ongoing',
      startDate: null,
      endDate: null,
      cleanName: profileName || '',
      label: 'Standard Profile',
    };
  }

  const isIndividual = profileName.startsWith('Individual:');
  const dateMatch = profileName.match(/\[(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})\]/);

  if (dateMatch) {
    const startDate = dateMatch[1];
    const endDate = dateMatch[2];
    const isTodayOnly = startDate === endDate;
    const cleanName = profileName.replace(/\s*\[\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}\]/, '').trim();

    return {
      isIndividual,
      durationType: isTodayOnly ? 'today' : 'days',
      startDate,
      endDate,
      cleanName,
      label: isTodayOnly
        ? `Today Only (${formatDateDisplay(startDate)})`
        : `${formatDateDisplay(startDate)} – ${formatDateDisplay(endDate)}`,
    };
  }

  const ongoingMatch = profileName.match(/\[Ongoing\]/i);
  if (ongoingMatch) {
    const cleanName = profileName.replace(/\s*\[Ongoing\]/i, '').trim();
    return {
      isIndividual,
      durationType: 'ongoing',
      startDate: null,
      endDate: null,
      cleanName,
      label: 'Permanent / Ongoing',
    };
  }

  return {
    isIndividual,
    durationType: 'ongoing',
    startDate: null,
    endDate: null,
    cleanName: profileName,
    label: isIndividual ? 'Ongoing' : 'Standard',
  };
}

export function isProfileEffectiveOnDate(profile, dateKey) {
  if (!profile) return false;
  const { durationType, startDate, endDate } = parseProfileEffectivity(profile.profile_name);
  if (durationType === 'ongoing') return true;
  if (!startDate || !endDate || !dateKey) return true;
  return dateKey >= startDate && dateKey <= endDate;
}

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

  return (profiles || []).map(p => {
    const eff = parseProfileEffectivity(p.profile_name);
    return {
      ...p,
      assigned_accounts_count: countMap[p.id] || 0,
      is_individual: eff.isIndividual,
      clean_name: eff.cleanName,
      duration_type: eff.durationType,
      start_date: eff.startDate,
      end_date: eff.endDate,
      duration_label: eff.label,
    };
  });
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

export async function getAssignedProfileForAccount(accountId, dateKey = null) {
  if (!accountId) return null;

  const targetDate = dateKey || getPhtDayBoundsUtc().dateKey;

  const { data: assignment, error: assignError } = await supabase
    .from('account_attendance_profiles')
    .select('attendance_profile_id')
    .eq('account_id', accountId)
    .maybeSingle();

  if (!assignError && assignment) {
    const { data: profile, error: profError } = await supabase
      .from('attendance_profiles')
      .select('*')
      .eq('id', assignment.attendance_profile_id)
      .eq('status', 'active')
      .maybeSingle();

    if (!profError && profile) {
      if (isProfileEffectiveOnDate(profile, targetDate)) {
        return profile;
      }
      // If it's an individual profile that has expired, do NOT use it for targetDate; fallback to standard profile below
    }
  }

  // Fallback to active "Regular 8AM–5PM" or first active standard profile
  const { data: defaultProfile } = await supabase
    .from('attendance_profiles')
    .select('*')
    .eq('status', 'active')
    .not('profile_name', 'like', 'Individual:%')
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  return defaultProfile || null;
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
    .select('account_id, attendance_profile_id, assigned_at, attendance_profiles(id, profile_name, time_in, time_out, first_scan_enabled, second_scan_enabled, status)');

  const todayKey = getPhtDayBoundsUtc().dateKey;
  const assignmentMap = new Map();

  if (!assignError && assignments) {
    for (const a of assignments) {
      const prof = a.attendance_profiles;
      const eff = parseProfileEffectivity(prof?.profile_name);
      const isEffectiveToday = isProfileEffectiveOnDate(prof, todayKey);

      assignmentMap.set(Number(a.account_id), {
        profile_id: a.attendance_profile_id,
        profile_name: prof?.profile_name || 'Assigned Profile',
        clean_name: eff.cleanName,
        duration_type: eff.durationType,
        start_date: eff.startDate,
        end_date: eff.endDate,
        duration_label: eff.label,
        is_effective_today: isEffectiveToday,
        time_in: prof?.time_in,
        time_out: prof?.time_out,
        first_scan_enabled: prof?.first_scan_enabled ?? true,
        second_scan_enabled: prof?.second_scan_enabled ?? true,
        status: prof?.status,
        assigned_at: a.assigned_at,
        is_individual: eff.isIndividual,
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

export async function setIndividualAttendanceControl(
  accountId,
  {
    mode = 'custom',
    profile_id,
    custom_schedule,
    duration = { type: 'today' },
    assigned_by
  } = {}
) {
  if (!accountId || isNaN(Number(accountId))) {
    const err = new Error('Valid Account ID is required');
    err.statusCode = 400;
    throw err;
  }
  const numericAccountId = Number(accountId);

  // 1. Fetch account
  const { data: account, error: accErr } = await supabase
    .from('accounts')
    .select('id, full_name, username')
    .eq('id', numericAccountId)
    .single();

  if (accErr || !account) {
    const err = new Error('Account not found');
    err.statusCode = 404;
    throw err;
  }

  const accountName = account.full_name || account.username || `Intern #${numericAccountId}`;
  const todayKey = getPhtDayBoundsUtc().dateKey;

  // 2. Fetch current assignment and its profile
  const { data: currentAssignment } = await supabase
    .from('account_attendance_profiles')
    .select('attendance_profile_id, attendance_profiles(id, profile_name)')
    .eq('account_id', numericAccountId)
    .maybeSingle();

  const currentProfile = currentAssignment?.attendance_profiles;
  const isCurrentIndividual = Boolean(currentProfile?.profile_name?.startsWith('Individual:'));

  if (mode === 'custom') {
    const {
      time_in = '08:00',
      time_out = '17:00',
      first_scan_enabled = true,
      second_scan_enabled = true,
    } = custom_schedule || {};

    const normalizedIn = normalizeTimeString(time_in) || '08:00:00';
    const normalizedOut = normalizeTimeString(time_out) || '17:00:00';

    // Calculate effectivity dates and duration tag
    const durationType = duration?.type || 'today';
    let durationTag = '';
    let effStartDate = todayKey;
    let effEndDate = todayKey;

    if (durationType === 'today') {
      durationTag = ` [${todayKey}..${todayKey}]`;
      effStartDate = todayKey;
      effEndDate = todayKey;
    } else if (durationType === 'days') {
      const daysCount = Math.max(1, Number(duration?.days_count || 1));
      effStartDate = todayKey;
      effEndDate = addDaysToDateKey(todayKey, daysCount - 1);
      durationTag = ` [${effStartDate}..${effEndDate}]`;
    } else if (durationType === 'range') {
      effStartDate = duration?.start_date || todayKey;
      effEndDate = duration?.end_date || effStartDate;
      durationTag = ` [${effStartDate}..${effEndDate}]`;
    } else {
      durationTag = ' [Ongoing]';
      effStartDate = null;
      effEndDate = null;
    }

    const individualProfileName = `Individual: ${accountName}${durationTag}`;

    let targetProfileId = null;

    // Check if the current assigned profile is already an individual profile dedicated to this account
    if (isCurrentIndividual && currentProfile?.id) {
      // Check if any other account shares this profile
      const { count } = await supabase
        .from('account_attendance_profiles')
        .select('*', { count: 'exact', head: true })
        .eq('attendance_profile_id', currentProfile.id);

      if (!count || count <= 1) {
        targetProfileId = currentProfile.id;
        await supabase
          .from('attendance_profiles')
          .update({
            profile_name: individualProfileName,
            time_in: normalizedIn,
            time_out: normalizedOut,
            first_scan_enabled: Boolean(first_scan_enabled),
            second_scan_enabled: Boolean(second_scan_enabled),
            status: 'active',
            updated_at: new Date().toISOString(),
          })
          .eq('id', targetProfileId);
      }
    }

    if (!targetProfileId) {
      // Create new dedicated profile
      const { data: newProfile, error: createErr } = await supabase
        .from('attendance_profiles')
        .insert([
          {
            profile_name: individualProfileName,
            time_in: normalizedIn,
            time_out: normalizedOut,
            first_scan_enabled: Boolean(first_scan_enabled),
            second_scan_enabled: Boolean(second_scan_enabled),
            status: 'active',
            updated_at: new Date().toISOString(),
          },
        ])
        .select()
        .single();

      if (createErr) {
        console.error('Error creating individual profile:', createErr);
        throw new Error('Failed to create individual attendance schedule');
      }
      targetProfileId = newProfile.id;
    }

    // Reassign account to target profile
    await supabase
      .from('account_attendance_profiles')
      .delete()
      .eq('account_id', numericAccountId);

    const { error: assignErr } = await supabase
      .from('account_attendance_profiles')
      .insert([
        {
          account_id: numericAccountId,
          attendance_profile_id: targetProfileId,
          assigned_at: new Date().toISOString(),
          assigned_by: assigned_by || null,
        },
      ]);

    if (assignErr) {
      console.error('Error assigning individual profile:', assignErr);
      throw new Error('Failed to assign individual profile');
    }

    // ── SYNC TODAY'S RECORD IF ACTIVE TODAY ─────────────────────────
    // If this schedule is effective today, update today's existing attendance_records and logs
    if (durationType === 'ongoing' || (todayKey >= effStartDate && todayKey <= effEndDate)) {
      try {
        const { data: todayRec } = await supabase
          .from('attendance_records')
          .select('id, actual_time_in, actual_time_out, recorded_time_in, recorded_time_out')
          .eq('account_id', numericAccountId)
          .eq('attendance_date', todayKey)
          .maybeSingle();

        if (todayRec) {
          const recUpdates = {
            attendance_profile_id: targetProfileId,
            updated_at: new Date().toISOString(),
          };
          if (first_scan_enabled) {
            recUpdates.recorded_time_in = buildPhtTimestamp(todayKey, normalizedIn);
          }
          if (second_scan_enabled && todayRec.actual_time_out) {
            recUpdates.recorded_time_out = buildPhtTimestamp(todayKey, normalizedOut);
          }
          await supabase
            .from('attendance_records')
            .update(recUpdates)
            .eq('id', todayRec.id);
        }

        // Also update today's attendance_logs
        if (first_scan_enabled) {
          await supabase
            .from('attendance_logs')
            .update({
              attendance_profile_id: targetProfileId,
              recorded_scan_time: buildPhtTimestamp(todayKey, normalizedIn),
            })
            .eq('intern_id', numericAccountId)
            .eq('scan_type', 'time_in')
            .gte('actual_scan_time', `${todayKey}T00:00:00+08:00`);
        }
      } catch (syncErr) {
        console.warn('Could not sync today attendance record with individual control:', syncErr?.message);
      }
    }

    const eff = parseProfileEffectivity(individualProfileName);

    return {
      success: true,
      mode: 'custom',
      account_id: numericAccountId,
      account_name: accountName,
      profile_id: targetProfileId,
      profile_name: individualProfileName,
      clean_name: eff.cleanName,
      duration_type: durationType,
      start_date: effStartDate,
      end_date: effEndDate,
      duration_label: eff.label,
      time_in: normalizedIn,
      time_out: normalizedOut,
      first_scan_enabled: Boolean(first_scan_enabled),
      second_scan_enabled: Boolean(second_scan_enabled),
    };
  } else if (mode === 'shared') {
    if (!profile_id) {
      const err = new Error('Attendance profile ID is required for shared profile mode');
      err.statusCode = 400;
      throw err;
    }

    // Verify shared profile exists
    const { data: targetProfile, error: profErr } = await supabase
      .from('attendance_profiles')
      .select('id, profile_name, time_in, time_out, first_scan_enabled, second_scan_enabled')
      .eq('id', Number(profile_id))
      .single();

    if (profErr || !targetProfile) {
      const err = new Error('Selected attendance profile does not exist');
      err.statusCode = 404;
      throw err;
    }

    // Delete current assignment
    await supabase
      .from('account_attendance_profiles')
      .delete()
      .eq('account_id', numericAccountId);

    // Clean up old individual profile if orphaned
    if (isCurrentIndividual && currentProfile?.id && currentProfile.id !== Number(profile_id)) {
      const { count } = await supabase
        .from('account_attendance_profiles')
        .select('*', { count: 'exact', head: true })
        .eq('attendance_profile_id', currentProfile.id);

      if (!count || count === 0) {
        await supabase
          .from('attendance_profiles')
          .delete()
          .eq('id', currentProfile.id);
      }
    }

    // Insert new assignment
    const { error: assignErr } = await supabase
      .from('account_attendance_profiles')
      .insert([
        {
          account_id: numericAccountId,
          attendance_profile_id: targetProfile.id,
          assigned_at: new Date().toISOString(),
          assigned_by: assigned_by || null,
        },
      ]);

    if (assignErr) {
      console.error('Error assigning shared profile:', assignErr);
      throw new Error('Failed to assign profile');
    }

    return {
      success: true,
      mode: 'shared',
      account_id: numericAccountId,
      account_name: accountName,
      profile_id: targetProfile.id,
      profile_name: targetProfile.profile_name,
      time_in: targetProfile.time_in,
      time_out: targetProfile.time_out,
      first_scan_enabled: targetProfile.first_scan_enabled,
      second_scan_enabled: targetProfile.second_scan_enabled,
    };
  } else if (mode === 'none') {
    // Delete current assignment
    await supabase
      .from('account_attendance_profiles')
      .delete()
      .eq('account_id', numericAccountId);

    // Clean up old individual profile if orphaned
    if (isCurrentIndividual && currentProfile?.id) {
      const { count } = await supabase
        .from('account_attendance_profiles')
        .select('*', { count: 'exact', head: true })
        .eq('attendance_profile_id', currentProfile.id);

      if (!count || count === 0) {
        await supabase
          .from('attendance_profiles')
          .delete()
          .eq('id', currentProfile.id);
      }
    }

    return {
      success: true,
      mode: 'none',
      account_id: numericAccountId,
      account_name: accountName,
      profile_id: null,
      profile_name: null,
    };
  } else {
    const err = new Error('Invalid mode. Must be "custom", "shared", or "none".');
    err.statusCode = 400;
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────
// SUPERADMIN DTR EDITING & AUDIT LOGGING
// ─────────────────────────────────────────────────────────────

export async function editDtrRecord({
  internId,
  date,
  new_date,
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

  // Validate new_date if provided
  let effectiveDate = date;
  let dateChanged = false;
  if (new_date && new_date !== date) {
    try {
      getPhtDayBoundsUtc(new_date);
    } catch {
      const err = new Error('A valid new attendance date is required (YYYY-MM-DD)');
      err.statusCode = 400;
      throw err;
    }

    // Check if a record already exists on the new date
    const { data: existingOnNewDate } = await supabase
      .from('attendance_records')
      .select('id')
      .eq('account_id', internId)
      .eq('attendance_date', new_date)
      .maybeSingle();

    if (existingOnNewDate) {
      const err = new Error(`An attendance record already exists for date ${new_date}`);
      err.statusCode = 400;
      throw err;
    }

    effectiveDate = new_date;
    dateChanged = true;
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

  const newStatus = status ? status.toLowerCase() : 'approved';

  // Build timestamps for new recorded times (using effectiveDate)
  const newTimeInIso = newTimeInNormalized
    ? buildPhtTimestamp(effectiveDate, newTimeInNormalized)
    : (dateChanged && origTimeInStr ? buildPhtTimestamp(effectiveDate, origTimeInStr) : null);

  const newTimeOutIso = newTimeOutNormalized
    ? buildPhtTimestamp(effectiveDate, newTimeOutNormalized)
    : (dateChanged && origTimeOutStr ? buildPhtTimestamp(effectiveDate, origTimeOutStr) : null);

  // Ensure record exists in attendance_records
  if (!record) {
    const { data: createdRecord, error: createError } = await supabase
      .from('attendance_records')
      .insert([
        {
          account_id: internId,
          attendance_date: effectiveDate,
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

  // Audit: Attendance Date change
  if (dateChanged) {
    historyEntries.push({
      attendance_record_id: recordId,
      account_id: internId,
      field_name: 'Attendance Date',
      original_value: formatDateDisplay(date),
      new_value: formatDateDisplay(effectiveDate),
      modified_by: modified_by || null,
      modified_at: modifiedAt,
      reason: reason.trim(),
    });
  }

  // Audit: Time In change (formatted as 12-hour AM/PM e.g. 08:00 AM -> 08:15 AM)
  const origTimeIn12H = origTimeInStr ? format12HourTime(origTimeInStr) : 'None';
  const newTimeIn12H = newTimeInDisplay ? format12HourTime(newTimeInDisplay) : null;
  if (newTimeIn12H && origTimeIn12H !== newTimeIn12H) {
    historyEntries.push({
      attendance_record_id: recordId,
      account_id: internId,
      field_name: 'Time In',
      original_value: origTimeIn12H,
      new_value: newTimeIn12H,
      modified_by: modified_by || null,
      modified_at: modifiedAt,
      reason: reason.trim(),
    });
  }

  // Audit: Time Out change (formatted as 12-hour AM/PM e.g. 05:00 PM)
  const origTimeOut12H = origTimeOutStr ? format12HourTime(origTimeOutStr) : 'None';
  const newTimeOut12H = newTimeOutDisplay ? format12HourTime(newTimeOutDisplay) : null;
  if (newTimeOut12H && origTimeOut12H !== newTimeOut12H) {
    historyEntries.push({
      attendance_record_id: recordId,
      account_id: internId,
      field_name: 'Time Out',
      original_value: origTimeOut12H,
      new_value: newTimeOut12H,
      modified_by: modified_by || null,
      modified_at: modifiedAt,
      reason: reason.trim(),
    });
  }

  // Audit: Status change
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

  // Update attendance_records (preserving actual_time_in and actual_time_out!)
  const recordUpdates = {
    updated_at: modifiedAt,
    status: newStatus,
  };
  if (dateChanged) recordUpdates.attendance_date = effectiveDate;
  if (newTimeInIso) recordUpdates.recorded_time_in = newTimeInIso;
  if (newTimeOutIso) recordUpdates.recorded_time_out = newTimeOutIso;

  if (recordId) {
    await supabase
      .from('attendance_records')
      .update(recordUpdates)
      .eq('id', recordId);
  }

  // Synchronize attendance_logs (keeping actual_scan_time preserved!)
  if (timeInLog) {
    const logUpdates = { approval_status: newStatus };
    if (newTimeInIso) {
      logUpdates.scan_time = newTimeInIso;
      logUpdates.recorded_scan_time = newTimeInIso;
    } else if (dateChanged && origTimeInStr) {
      const shiftedInIso = buildPhtTimestamp(effectiveDate, origTimeInStr);
      logUpdates.scan_time = shiftedInIso;
      logUpdates.recorded_scan_time = shiftedInIso;
    }
    await supabase
      .from('attendance_logs')
      .update(logUpdates)
      .eq('id', timeInLog.id);
  } else if (newTimeInIso) {
    await supabase
      .from('attendance_logs')
      .insert([
        {
          intern_id: internId,
          scan_type: 'time_in',
          scan_time: newTimeInIso,
          recorded_scan_time: newTimeInIso,
          actual_scan_time: null, // No actual scan took place
          approval_status: newStatus,
          attendance_record_id: recordId,
        },
      ]);
  }

  if (timeOutLog) {
    const logUpdates = { approval_status: newStatus };
    if (newTimeOutIso) {
      logUpdates.scan_time = newTimeOutIso;
      logUpdates.recorded_scan_time = newTimeOutIso;
    } else if (dateChanged && origTimeOutStr) {
      const shiftedOutIso = buildPhtTimestamp(effectiveDate, origTimeOutStr);
      logUpdates.scan_time = shiftedOutIso;
      logUpdates.recorded_scan_time = shiftedOutIso;
    }
    await supabase
      .from('attendance_logs')
      .update(logUpdates)
      .eq('id', timeOutLog.id);
  } else if (newTimeOutIso) {
    await supabase
      .from('attendance_logs')
      .insert([
        {
          intern_id: internId,
          scan_type: 'time_out',
          scan_time: newTimeOutIso,
          recorded_scan_time: newTimeOutIso,
          actual_scan_time: null, // No actual scan took place
          approval_status: newStatus,
          attendance_record_id: recordId,
        },
      ]);
  }

  return {
    success: true,
    modified_fields_count: historyEntries.length,
    attendance_date: effectiveDate,
    recorded_time_in: newTimeInDisplay || origTimeInStr,
    recorded_time_out: newTimeOutDisplay || origTimeOutStr,
    status: newStatus,
  };
}

// ─────────────────────────────────────────────────────────────
// SUPERADMIN DTR DELETION & AUDIT LOGGING
// ─────────────────────────────────────────────────────────────

export async function deleteDtrAttendance({
  internId,
  date,
  reason,
  modified_by,
  target = 'all', // 'attendance' | 'override' | 'all'
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

  try {
    getPhtDayBoundsUtc(date);
  } catch {
    const err = new Error('A valid attendance date is required (YYYY-MM-DD)');
    err.statusCode = 400;
    throw err;
  }

  const { startIso, endExclusiveIso } = getPhtDayBoundsUtc(date);

  // 1. Fetch existing attendance_records row if it exists
  const { data: record, error: recError } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('account_id', internId)
    .eq('attendance_date', date)
    .maybeSingle();

  if (recError) {
    console.error('Error fetching attendance_record for deletion:', recError);
  }

  // 2. Fetch existing attendance_logs for this date
  const { data: logs, error: logsError } = await supabase
    .from('attendance_logs')
    .select('id, scan_type, scan_time, remarks, approval_status, attendance_record_id')
    .eq('intern_id', internId)
    .gte('scan_time', startIso)
    .lt('scan_time', endExclusiveIso);

  if (logsError) {
    console.error('Error fetching attendance_logs for deletion:', logsError);
    throw logsError;
  }

  let allLogs = logs || [];

  // Also query by attendance_record_id if record exists to ensure any linked logs are found
  if (record?.id) {
    const { data: linkedLogs } = await supabase
      .from('attendance_logs')
      .select('id, scan_type, scan_time, remarks, approval_status, attendance_record_id')
      .eq('intern_id', internId)
      .eq('attendance_record_id', record.id);

    if (linkedLogs && linkedLogs.length > 0) {
      const existingIdSet = new Set(allLogs.map(l => l.id));
      for (const log of linkedLogs) {
        if (!existingIdSet.has(log.id)) {
          allLogs.push(log);
        }
      }
    }
  }

  let targetLogs = [];
  if (target === 'override') {
    targetLogs = allLogs.filter(l => typeof l.remarks === 'string' && l.remarks.trim().toUpperCase().startsWith('OVERRIDE:'));
  } else {
    // When deleting attendance ('attendance' or 'all'), remove all attendance entries for the date
    targetLogs = allLogs;
  }

  const targetLogIds = targetLogs.map(l => l.id);

  // 3. Delete attendance photos for targeted logs
  if (targetLogIds.length > 0) {
    try {
      await supabase
        .from('attendance_photos')
        .delete()
        .in('attendance_log_id', targetLogIds);
    } catch (photoErr) {
      console.warn('Notice deleting attendance_photos:', photoErr);
    }

    // 4. Delete targeted logs
    const { error: logsDelErr } = await supabase
      .from('attendance_logs')
      .delete()
      .in('id', targetLogIds);

    if (logsDelErr) {
      console.error('Error deleting attendance_logs:', logsDelErr);
      throw logsDelErr;
    }
  }

  // 5. Delete attendance_records row if target is 'attendance' or 'all',
  // or if target is 'override' and the record contains no actual biometric scans
  let recordDeleted = false;
  const shouldDeleteRecord = target === 'attendance'
    || target === 'all'
    || (target === 'override' && !record?.actual_time_in && !record?.actual_time_out);

  if (shouldDeleteRecord) {
    if (record?.id) {
      // Detach from dtr_edit_history so history is NOT cascade-deleted
      try {
        await supabase
          .from('dtr_edit_history')
          .update({ attendance_record_id: null })
          .eq('attendance_record_id', record.id);
      } catch (detachErr) {
        console.warn('Notice detaching dtr_edit_history:', detachErr);
      }

      const { error: recDelErr } = await supabase
        .from('attendance_records')
        .delete()
        .eq('id', record.id);

      if (recDelErr) {
        console.error('Error deleting attendance_record by id:', recDelErr);
      } else {
        recordDeleted = true;
      }
    }

    // Clean up any remaining attendance_records for this intern and date
    const { error: cleanRecErr } = await supabase
      .from('attendance_records')
      .delete()
      .eq('account_id', internId)
      .eq('attendance_date', date);

    if (!cleanRecErr) {
      recordDeleted = true;
    }
  }

  // 6. Write audit log into dtr_edit_history
  const modifiedAt = new Date().toISOString();
  const fieldName = target === 'override'
    ? 'Schedule Override'
    : 'Attendance Record';

  const origDetails = [];
  if (record) {
    origDetails.push(`Status: ${record.status || 'N/A'}`);
    if (record.recorded_time_in) origDetails.push(`In: ${format12HourTime(formatPhtTime(record.recorded_time_in))}`);
    if (record.recorded_time_out) origDetails.push(`Out: ${format12HourTime(formatPhtTime(record.recorded_time_out))}`);
  }
  if (targetLogs.length > 0) {
    origDetails.push(`${targetLogs.length} scan log(s) removed`);
  }
  const originalValue = origDetails.length > 0 ? origDetails.join(', ') : 'Active Record/Override';

  try {
    await supabase.from('dtr_edit_history').insert([{
      attendance_record_id: null,
      account_id: internId,
      field_name: fieldName,
      original_value: originalValue,
      new_value: 'Deleted / Cleared',
      modified_by: modified_by || null,
      modified_at: modifiedAt,
      reason: reason.trim(),
    }]);
  } catch (auditErr) {
    console.warn('Failed to insert dtr_edit_history audit log:', auditErr);
  }

  return {
    success: true,
    internId,
    date,
    target,
    deletedLogsCount: targetLogIds.length,
    deletedRecord: recordDeleted,
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
