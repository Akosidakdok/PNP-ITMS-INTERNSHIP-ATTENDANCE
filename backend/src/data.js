import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from './supabaseClient.js';

const INTERN_ROLE = 'intern';
const ADMIN_ROLE = 'admin';

export async function getDepartments() {
  const { data: departments, error } = await supabase
    .from('departments')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw error;

  const { data: interns, error: internsError } = await supabase
    .from('accounts')
    .select('department_id')
    .eq('role', INTERN_ROLE);

  if (internsError) throw internsError;

  const counts = interns.reduce((acc, intern) => {
    const id = intern.department_id || 0;
    acc[id] = (acc[id] || 0) + 1;
    return acc;
  }, {});

  return departments.map((department) => ({
    ...department,
    intern_count: counts[department.id] || 0,
  }));
}

export async function createDepartment(payload) {
  const { data, error } = await supabase
    .from('departments')
    .insert([{ ...payload }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateDepartment(id, payload) {
  const { data, error } = await supabase
    .from('departments')
    .update({ ...payload })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteDepartment(id) {
  const { error } = await supabase
    .from('departments')
    .delete()
    .eq('id', id);

  if (error) throw error;
  return { success: true };
}

export async function findDepartmentById(id) {
  const { data, error } = await supabase
    .from('departments')
    .select('*')
    .eq('id', id)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function getInterns({ search, page = 1, limit = 10 } = {}) {
  let query = supabase
    .from('accounts')
    .select(
      'id, username, full_name, email, role, school, course, department_id, department_name, status, start_date, end_date, required_hours, rendered_hours, student_id, year_level, phone, home_address, emergency_name, emergency_relation, emergency_phone',
      { count: 'exact' }
    )
    .eq('role', INTERN_ROLE)
    .order('full_name', { ascending: true });

  if (search) {
    query = query.or(`full_name.ilike.%${search}%,username.ilike.%${search}%,email.ilike.%${search}%`);
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;
  return { interns: data || [], total: count || 0 };
}

export async function getInternById(id) {
  const { data, error } = await supabase
    .from('accounts')
    .select('id, username, full_name, email, role, school, course, department_id, department_name, status, start_date, end_date, required_hours, rendered_hours, student_id, year_level, phone, home_address, emergency_name, emergency_relation, emergency_phone')
    .eq('id', id)
    .eq('role', INTERN_ROLE)
    .single();

  if (error) throw error;
  return data;
}

function normalizeDepartmentName(departmentId, departmentName) {
  if (departmentId) {
    return departmentId;
  }
  return null;
}

export async function createIntern(payload) {
  const { password, department_id, ...rest } = payload;
  if (!password) throw new Error('Password is required');

  const password_hash = await bcrypt.hash(password, 10);
  const department = department_id ? await findDepartmentById(Number(department_id)) : null;
  const departmentName = department?.name || rest.department_name || null;

  const { data, error } = await supabase
    .from('accounts')
    .insert([{ ...rest, password_hash, role: INTERN_ROLE, department_id, department_name: departmentName }])
    .select('id, username, full_name, email, role, school, course, department_id, department_name, status, start_date, end_date, required_hours, rendered_hours, student_id, year_level, phone, home_address, emergency_name, emergency_relation, emergency_phone')
    .single();

  if (error) throw error;
  return data;
}

export async function updateIntern(id, payload) {
  const { password, department_id, ...rest } = payload;
  const updates = { ...rest };

  if (password) {
    updates.password_hash = await bcrypt.hash(password, 10);
  }

  if (department_id) {
    const department = await findDepartmentById(department_id);
    updates.department_name = department?.name || rest.department_name || null;
    updates.department_id = department_id;
  }

  const { data, error } = await supabase
    .from('accounts')
    .update(updates)
    .eq('id', id)
    .eq('role', INTERN_ROLE)
    .select('id, username, full_name, email, role, school, course, department_id, department_name, status, start_date, end_date, required_hours, rendered_hours, student_id, year_level, phone, home_address, emergency_name, emergency_relation, emergency_phone')
    .single();

  if (error) throw error;
  return data;
}

export async function deleteIntern(id) {
  const { error } = await supabase
    .from('accounts')
    .delete()
    .eq('id', id)
    .eq('role', INTERN_ROLE);

  if (error) throw error;
  return { success: true };
}

export async function resetInternPassword(id, newPassword) {
  const password_hash = await bcrypt.hash(newPassword, 10);
  const { error } = await supabase
    .from('accounts')
    .update({ password_hash })
    .eq('id', id)
    .eq('role', INTERN_ROLE);

  if (error) throw error;
  return { success: true };
}

export async function getCurrentUserProfile(userId) {
  const { data, error } = await supabase
    .from('accounts')
    .select('id, username, full_name, email, role, school, course, department_id, department_name, status, start_date, end_date, required_hours, rendered_hours, student_id, year_level, phone, home_address, emergency_name, emergency_relation, emergency_phone')
    .eq('id', userId)
    .single();

  if (error) throw error;
  return data;
}

export async function updateCurrentUserProfile(userId, updates) {
  const payload = { ...updates };
  if (payload.department_id) {
    const department = await findDepartmentById(payload.department_id);
    payload.department_name = department?.name || payload.department_name || null;
  }

  const { data, error } = await supabase
    .from('accounts')
    .update(payload)
    .eq('id', userId)
    .select('id, username, full_name, email, role, school, course, department_id, department_name, status, start_date, end_date, required_hours, rendered_hours, student_id, year_level, phone, home_address, emergency_name, emergency_relation, emergency_phone')
    .single();

  if (error) throw error;
  return data;
}

export async function changePassword(userId, currentPassword, newPassword) {
  const { data, error } = await supabase
    .from('accounts')
    .select('password_hash')
    .eq('id', userId)
    .single();

  if (error) throw error;
  const isValid = await bcrypt.compare(currentPassword, data.password_hash);
  if (!isValid) throw new Error('Current password is incorrect');

  const newHash = await bcrypt.hash(newPassword, 10);
  const { error: updateError } = await supabase
    .from('accounts')
    .update({ password_hash: newHash })
    .eq('id', userId);

  if (updateError) throw updateError;
  return { success: true };
}

export async function getAttendanceLogs({ status, date, page = 1, limit = 15 } = {}) {
  let query = supabase
    .from('attendance_logs')
    .select('*', { count: 'exact' })
    .order('scan_time', { ascending: false });

  if (status) {
    query = query.eq('approval_status', status);
  }

  if (date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    query = query.gte('scan_time', start.toISOString()).lte('scan_time', end.toISOString());
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const { data, error, count } = await query.range(from, to);

  if (error) throw error;
  return { logs: data || [], total: count || 0 };
}

export async function setAttendanceApproval(attendanceId, status, remarks) {
  const { data, error } = await supabase
    .from('attendance_logs')
    .update({ approval_status: status, remarks })
    .eq('id', attendanceId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getAdminDashboardStats() {
  const today = new Date();
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setHours(23, 59, 59, 999);

  const [internsRes, attendanceRes, pendingDocsRes, departmentsRes] = await Promise.all([
    supabase.from('accounts').select('id', { count: 'exact', head: false }).eq('role', INTERN_ROLE),
    supabase.from('attendance_logs').select('id, intern_id, scan_time, approval_status', { count: 'exact' })
      .gte('scan_time', start.toISOString())
      .lte('scan_time', end.toISOString()),
    supabase.from('documents').select('id', { count: 'exact' }).eq('status', 'pending'),
    supabase.from('departments').select('id', { count: 'exact', head: false })
  ]);

  if (internsRes.error) throw internsRes.error;
  if (attendanceRes.error) throw attendanceRes.error;
  if (pendingDocsRes.error) throw pendingDocsRes.error;
  if (departmentsRes.error) throw departmentsRes.error;

  const todayLogs = attendanceRes.data || [];
  const presentSet = new Set(todayLogs
    .filter((log) => log.approval_status !== 'rejected')
    .map((log) => log.intern_id));

  const approvedToday = todayLogs.filter((log) => log.approval_status === 'approved').length;
  const pendingAttendance = todayLogs.filter((log) => log.approval_status === 'pending').length;

  const { data: recentAttendance, error: recentAttendanceError } = await supabase
    .from('attendance_logs')
    .select('*')
    .order('scan_time', { ascending: false })
    .limit(5);

  if (recentAttendanceError) throw recentAttendanceError;

  const { data: recentDocuments, error: recentDocumentsError } = await supabase
    .from('documents')
    .select('*')
    .order('upload_date', { ascending: false })
    .limit(3);

  if (recentDocumentsError) throw recentDocumentsError;

  return {
    stats: {
      total_interns: internsRes.count || 0,
      present_today: presentSet.size,
      pending_attendance: pendingAttendance,
      approved_today: approvedToday,
      total_departments: departmentsRes.count || 0,
      pending_documents: pendingDocsRes.count || 0,
    },
    recentAttendance: recentAttendance || [],
    recentDocuments: recentDocuments || [],
  };
}

export async function getAttendanceReport({ month, year, department_id } = {}) {
  const filters = { role: INTERN_ROLE };
  let internQuery = supabase
    .from('accounts')
    .select('id, full_name, school, course, department_name, department_id, required_hours, rendered_hours')
    .eq('role', INTERN_ROLE)
    .order('full_name', { ascending: true });

  if (department_id) {
    internQuery = internQuery.eq('department_id', department_id);
  }

  const { data: interns, error: internsError } = await internQuery;
  if (internsError) throw internsError;

  let logQuery = supabase
    .from('attendance_logs')
    .select('intern_id, scan_time, approval_status');

  if (month && year) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59, 999);
    logQuery = logQuery.gte('scan_time', start.toISOString()).lte('scan_time', end.toISOString());
  }

  const { data: logs, error: logsError } = await logQuery;
  if (logsError) throw logsError;

  const attendanceByIntern = logs.reduce((acc, log) => {
    const dateKey = log.scan_time.slice(0, 10);
    const key = `${log.intern_id}-${dateKey}`;
    acc[key] = true;
    return acc;
  }, {});

  const dailyCounts = Object.keys(attendanceByIntern).reduce((acc, key) => {
    const internId = Number(key.split('-')[0]);
    acc[internId] = (acc[internId] || 0) + 1;
    return acc;
  }, {});

  return interns.map((intern) => ({
    id: intern.id,
    full_name: intern.full_name,
    school: intern.school,
    department_name: intern.department_name,
    days_present: dailyCounts[intern.id] || 0,
    total_hours: Number(intern.rendered_hours || 0),
    required_hours: Number(intern.required_hours || 0),
    rendered_hours: Number(intern.rendered_hours || 0),
  }));
}

export async function getDtrRecords(userId, { month, year, limit = 31 } = {}) {
  const MNL_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8 in milliseconds

  // Shift a UTC Date forward by 8 hours so UTC methods read Manila clock time
  function toMNLDate(date) {
    return new Date(date.getTime() + MNL_OFFSET_MS);
  }

  // Return HH:MM from a Date already shifted to Manila clock
  function toHHMM(mnlDate) {
    if (!mnlDate) return null;
    return mnlDate.toISOString().slice(11, 16);
  }

  // Convert any raw UTC Date to a Manila HH:MM display string
  function mnlTimeStr(rawUTC) {
    if (!rawUTC) return null;
    return toHHMM(toMNLDate(rawUTC));
  }

  let query = supabase
    .from('attendance_logs')
    .select('scan_time, scan_type, approval_status, remarks')
    .eq('intern_id', userId)
    .order('scan_time', { ascending: true });

  if (month && year) {
    // Boundaries in Manila time (Manila midnight = UTC - 8 h)
    const startUTC = new Date(Date.UTC(year, month - 1, 1,  0,  0,  0,   0) - MNL_OFFSET_MS);
    const endUTC   = new Date(Date.UTC(year, month,     0, 23, 59, 59, 999) - MNL_OFFSET_MS);
    query = query.gte('scan_time', startUTC.toISOString()).lte('scan_time', endUTC.toISOString());
  } else {
    const since = new Date(Date.now() - limit * 24 * 60 * 60 * 1000);
    query = query.gte('scan_time', since.toISOString());
  }

  const { data: logs, error } = await query;
  if (error) throw error;

  // Group by Manila calendar date (YYYY-MM-DD)
  const grouped = logs.reduce((acc, log) => {
    const mnlDate = toMNLDate(new Date(log.scan_time));
    const dateKey = mnlDate.toISOString().slice(0, 10);
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(log);
    return acc;
  }, {});

  return Object.entries(grouped).map(([date, entries]) => {
    // Sort scans chronologically; take at most 4 slots
    entries.sort((a, b) => new Date(a.scan_time) - new Date(b.scan_time));
    const [s1, s2, s3, s4] = entries;

    // Positional slot assignment: AM-in, AM-out, PM-in, PM-out
    const amInRaw  = s1?.scan_type === 'time_in'  ? new Date(s1.scan_time) : null;
    const amOutRaw = s2?.scan_type === 'time_out' ? new Date(s2.scan_time) : null;
    const pmInRaw  = s3?.scan_type === 'time_in'  ? new Date(s3.scan_time) : null;
    const pmOutRaw = s4?.scan_type === 'time_out' ? new Date(s4.scan_time) : null;

    // ── Time-floor rules (Manila clock) ─────────────────────────────────────
    // AM Time In: any scan strictly before 08:00 MNL → register as 08:00 MNL
    let effectiveAmIn = null;
    if (amInRaw) {
      const m = toMNLDate(amInRaw);
      effectiveAmIn = m.getUTCHours() < 8
        ? new Date(`${date}T08:00:00+08:00`)   // UTC = date T00:00:00Z
        : amInRaw;
    }

    // PM Time In: scan at or before 13:00 MNL → register as 13:00 MNL (no grace)
    let effectivePmIn = null;
    if (pmInRaw) {
      const m = toMNLDate(pmInRaw);
      const h = m.getUTCHours(), min = m.getUTCMinutes();
      effectivePmIn = (h < 13 || (h === 13 && min === 0))
        ? new Date(`${date}T13:00:00+08:00`)   // UTC = date T05:00:00Z
        : pmInRaw;
    }

    // PM Time Out: honored as-is (overtime counted)
    const effectivePmOut = pmOutRaw;

    // ── Total hours calculation ──────────────────────────────────────────────
    // Manila noon anchor for AM session end
    const noon = new Date(`${date}T12:00:00+08:00`); // UTC = date T04:00:00Z

    let totalHours = 0;

    if (effectiveAmIn && effectivePmIn && effectivePmOut) {
      // Full day: AM session (effectiveAmIn → noon) + PM session (effectivePmIn → effectivePmOut)
      const amSession = Math.max(0, (noon - effectiveAmIn) / 3600000);
      const pmSession = Math.max(0, (effectivePmOut - effectivePmIn) / 3600000);
      totalHours = amSession + pmSession;
    } else if (effectiveAmIn && amOutRaw) {
      // AM only (scan 1 + 2 present, no PM)
      const amEnd = amOutRaw < noon ? amOutRaw : noon;
      totalHours = Math.max(0, (amEnd - effectiveAmIn) / 3600000);
    } else if (effectivePmIn && effectivePmOut) {
      // PM only (rare edge case)
      totalHours = Math.max(0, (effectivePmOut - effectivePmIn) / 3600000);
    }

    // ── Statuses ─────────────────────────────────────────────────────────────
    const amStatus      = s1?.approval_status || 'pending';
    const pmStatus      = s4?.approval_status || s3?.approval_status || 'pending';
    const allStatuses   = entries.map(e => e.approval_status).filter(Boolean);
    let overallStatus   = 'pending';
    if (allStatuses.length && allStatuses.every(s => s === 'approved')) overallStatus = 'approved';
    if (allStatuses.some(s => s === 'rejected')) overallStatus = 'rejected';

    return {
      date,
      // Display times in Manila (HH:MM) — caps already applied
      am_time_in:  mnlTimeStr(effectiveAmIn),
      am_time_out: mnlTimeStr(amOutRaw),
      pm_time_in:  mnlTimeStr(effectivePmIn),
      pm_time_out: mnlTimeStr(effectivePmOut),
      // Per-slot statuses
      am_status:   amStatus,
      pm_status:   pmStatus,
      // Overall for the day
      approval_status: overallStatus,
      total_hours: Number(totalHours.toFixed(2)),
      // Backward-compat fields used by MyDTR summary stats
      time_in:  mnlTimeStr(effectiveAmIn),
      time_out: mnlTimeStr(effectivePmOut),
    };
  }).sort((a, b) => b.date.localeCompare(a.date));
}


export async function getNotifications(userId, isAdmin) {
  let query = supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false });

  if (!isAdmin) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query;
  if (error) throw error;
  const notifications = data || [];
  const unread_count = notifications.filter((n) => !n.is_read).length;
  return { notifications, unread_count };
}

export async function markNotificationRead(notificationId, userId, isAdmin) {
  let query = supabase.from('notifications').update({ is_read: true }).eq('id', notificationId);
  if (!isAdmin) query = query.eq('user_id', userId);
  const { error } = await query;
  if (error) throw error;
  return { success: true };
}

export async function markAllNotificationsRead(userId, isAdmin) {
  let query = supabase.from('notifications').update({ is_read: true });
  if (!isAdmin) query = query.eq('user_id', userId);
  const { error } = await query;
  if (error) throw error;
  return { success: true };
}

export async function getEvaluations(userId, isAdmin) {
  let query = supabase
    .from('evaluations')
    .select('*')
    .order('evaluation_date', { ascending: false });

  if (!isAdmin) {
    query = query.eq('intern_id', userId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function createEvaluation(payload, evaluatorId, evaluatorName) {
  const row = {
    ...payload,
    evaluator_id: evaluatorId,
    evaluator_name: evaluatorName,
    evaluation_date: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('evaluations')
    .insert([row])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateEvaluation(id, payload) {
  const { data, error } = await supabase
    .from('evaluations')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getDocuments(userId, isAdmin, status) {
  let query = supabase
    .from('documents')
    // Select all columns from documents, and the full_name from the joined accounts table
    .select(`
      *,
      account:accounts(full_name)
    `)
    .order('upload_date', { ascending: false });

  if (!isAdmin) {
    query = query.eq('intern_id', userId);
  }

  if (status) {
    query = query.eq('status', status);
  }

  const { data: documents, error } = await query;
  if (error) throw error;

  // Augment documents with their public URL from Supabase Storage
  return (documents || []).map(doc => {
    const { data: publicUrlData } = supabase
      .storage
      .from('documents') // Your bucket name
      .getPublicUrl(doc.file_path);

    // Un-nest the account object to make `full_name` a top-level property
    return {
      ...doc,
      full_name: doc.account?.full_name || 'Unknown Intern',
      public_url: publicUrlData.publicUrl,
    };
  });
}

export async function updateDocumentStatus(id, status, adminRemarks) {
  const { data, error } = await supabase
    .from('documents')
    .update({ status, admin_remarks: adminRemarks })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function createDocument({ userId, file, document_type }) {
  if (!file) throw new Error('File upload is required');
  const { originalname, mimetype, size, buffer } = file;
  const fileExtension = originalname.split('.').pop();
  const newFileName = `${uuidv4()}.${fileExtension}`;
  const filePath = `user-documents/${userId}/${newFileName}`;

  // 1. Upload file to Supabase Storage
  const { error: uploadError } = await supabase
    .storage
    .from('documents') // Your bucket name
    .upload(filePath, buffer, {
      contentType: mimetype,
      upsert: false,
    });

  if (uploadError) {
    console.error('Supabase Storage Error:', uploadError);
    throw new Error('Failed to upload file to storage. Check backend logs for details.');
  }

  // 2. Save metadata to the database
  const { data, error } = await supabase
    .from('documents')
    .insert([{
      intern_id: userId,
      document_type,
      original_name: originalname,
      file_name: newFileName,
      file_type: mimetype.split('/').pop(),
      file_size: size,
      file_path: filePath,
      upload_date: new Date().toISOString(),
      status: 'pending',
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteDocument(id, userId, isAdmin) {
  // 1. Get the document to find its file_path
  const { data: doc, error: findError } = await supabase
    .from('documents')
    .select('file_path, intern_id')
    .eq('id', id)
    .single();

  if (findError) throw findError;
  if (!isAdmin && doc.intern_id !== userId) throw new Error('Permission denied');

  // 2. Delete the file from Supabase Storage
  const { error: storageError } = await supabase.storage.from('documents').remove([doc.file_path]);
  if (storageError) {
    console.warn(`Could not delete file from storage: ${storageError.message}`);
  }

  // 3. Delete the record from the database
  const { error } = await supabase.from('documents').delete().eq('id', id);
  if (error) throw error;
  return { success: true };
}
