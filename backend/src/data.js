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

export async function getSchools() {
  const { data: schools, error } = await supabase
    .from('schools')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw error;
  
  const { data: interns, error: internsError } = await supabase
    .from('accounts')
    .select('school_id')
    .eq('role', INTERN_ROLE);

  if (internsError) throw internsError;

  const counts = interns.reduce((acc, intern) => {
    const id = intern.school_id || 0;
    if (id) {
      acc[id] = (acc[id] || 0) + 1;
    }
    return acc;
  }, {});

  return schools.map((school) => ({
    ...school,
    intern_count: counts[school.id] || 0,
  }));
}

export async function createSchool(payload) {
  const { data, error } = await supabase
    .from('schools')
    .insert([{ ...payload }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateSchool(id, payload) {
  const { data, error } = await supabase
    .from('schools')
    .update({ ...payload })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteSchool(id) {
  const { error } = await supabase
    .from('schools')
    .delete()
    .eq('id', id);

  if (error) throw error;
  return { success: true };
}

export async function findSchoolById(id) {
  const { data, error } = await supabase
    .from('schools')
    .select('*')
    .eq('id', id)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function getInterns({ search, page = 1, limit = 10, department_id, school_id } = {}) {
  let query = supabase
    .from('accounts')
    .select(
      'id, username, full_name, email, role, school, school_id, course, department_id, department_name, status, start_date, end_date, required_hours, rendered_hours, student_id, year_level, phone, home_address, emergency_name, emergency_relation, emergency_phone',
      { count: 'exact' }
    )
    .eq('role', INTERN_ROLE)
    .order('full_name', { ascending: true });

  if (search) {
    query = query.or(`full_name.ilike.%${search}%,username.ilike.%${search}%,email.ilike.%${search}%`);
  }

  if (department_id) {
    query = query.eq('department_id', department_id);
  }

  if (school_id) {
    query = query.eq('school_id', school_id);
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
  const { password, department_id, school_id, ...rest } = payload;
  if (!password) throw new Error('Password is required');

  const password_hash = await bcrypt.hash(password, 10);
  
  const deptId = department_id && department_id !== '' ? Number(department_id) : null;
  const department = deptId ? await findDepartmentById(deptId) : null;
  
  const deptId = department_id && department_id !== '' ? Number(department_id) : null;
  const department = deptId ? await findDepartmentById(deptId) : null;
  const departmentName = department?.name || rest.department_name || null;

  const schId = school_id && school_id !== '' ? Number(school_id) : null;
  const school = schId ? await findSchoolById(schId) : null;
  const schId = school_id && school_id !== '' ? Number(school_id) : null;
  const school = schId ? await findSchoolById(schId) : null;
  const schoolName = school?.name || rest.school || null;

  const { data, error } = await supabase
    .from('accounts')
    .insert([{ ...rest, password_hash, role: INTERN_ROLE, department_id: deptId, department_name: departmentName, school_id: schId, school: schoolName }])
    .insert([{ ...rest, password_hash, role: INTERN_ROLE, department_id: deptId, department_name: departmentName, school_id: schId, school: schoolName }])
    .select('id, username, full_name, email, role, school, school_id, course, department_id, department_name, status, start_date, end_date, required_hours, rendered_hours, student_id, year_level, phone, home_address, emergency_name, emergency_relation, emergency_phone')
    .single();

  if (error) throw error;
  return data;
}

export async function updateIntern(id, payload) {
  const { password, department_id, school_id, ...rest } = payload;
  const updates = { ...rest };

  if (password) {
    updates.password_hash = await bcrypt.hash(password, 10);
  }

  if (department_id !== undefined) {
    const deptId = department_id && department_id !== '' ? Number(department_id) : null;
    const department = deptId ? await findDepartmentById(deptId) : null;
    updates.department_name = department?.name || null;
    updates.department_id = deptId;
  if (department_id !== undefined) {
    const deptId = department_id && department_id !== '' ? Number(department_id) : null;
    const department = deptId ? await findDepartmentById(deptId) : null;
    updates.department_name = department?.name || null;
    updates.department_id = deptId;
  }

  if (school_id !== undefined) {
    const schId = school_id && school_id !== '' ? Number(school_id) : null;
    const school = schId ? await findSchoolById(schId) : null;
    updates.school = school?.name || null;
    updates.school_id = schId;
  if (school_id !== undefined) {
    const schId = school_id && school_id !== '' ? Number(school_id) : null;
    const school = schId ? await findSchoolById(schId) : null;
    updates.school = school?.name || null;
    updates.school_id = schId;
  }

  const { data, error } = await supabase
    .from('accounts')
    .update(updates)
    .eq('id', id)
    .eq('role', INTERN_ROLE)
    .select('id, username, full_name, email, role, school, school_id, course, department_id, department_name, status, start_date, end_date, required_hours, rendered_hours, student_id, year_level, phone, home_address, emergency_name, emergency_relation, emergency_phone')
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

export async function getAttendanceLogs({ status, date, page = 1, limit = 15, department_id } = {}) {
export async function getAttendanceLogs({ status, date, page = 1, limit = 15, department_id } = {}) {
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

  if (department_id) {
    // Get intern IDs for this department
    const { data: accounts } = await supabase.from('accounts').select('id').eq('department_id', department_id).eq('role', 'intern');
    const internIds = accounts ? accounts.map(a => a.id) : [];
    if (internIds.length === 0) {
      return { logs: [], total: 0 };
    }
    query = query.in('intern_id', internIds);
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const { data, error, count } = await query.range(from, to);

  if (error) throw error;

  const internIds = [...new Set((data || []).map(log => log.intern_id).filter(Boolean))];
  let accountsMap = {};
  if (internIds.length > 0) {
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('id, full_name, department_name')
      .in('id', internIds);
    if (!accountsError && accounts) {
      accountsMap = accounts.reduce((acc, accObj) => {
        acc[accObj.id] = accObj;
        return acc;
      }, {});
    }
  }

  const mappedData = (data || []).map(log => {
    const accObj = accountsMap[log.intern_id];
    return {
      ...log,
      full_name: accObj?.full_name || log.intern_name,
      department_name: accObj?.department_name
    };
  });

  return { logs: mappedData, total: count || 0 };
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

  const internIds = [...new Set((recentAttendance || []).map(log => log.intern_id).filter(Boolean))];
  let accountsMap = {};
  if (internIds.length > 0) {
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('id, full_name, department_name')
      .in('id', internIds);
    if (!accountsError && accounts) {
      accountsMap = accounts.reduce((acc, accObj) => {
        acc[accObj.id] = accObj;
        return acc;
      }, {});
    }
  }

  const mappedRecent = (recentAttendance || []).map(log => {
    const accObj = accountsMap[log.intern_id];
    return {
      ...log,
      full_name: accObj?.full_name || log.intern_name,
      department_name: accObj?.department_name
    };
  });

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
    recentAttendance: mappedRecent,
    recentDocuments: recentDocuments || [],
  };
}

export async function getSupervisorDashboardStats(user) {
  if (!user || user.role !== 'supervisor' || !user.department_id) {
    throw new Error('Permission denied or supervisor is not assigned to a department.');
  }

  const departmentId = user.department_id;

  // Get all intern IDs in the supervisor's department
  const { data: departmentInterns, error: deptInternsError } = await supabase
    .from('accounts')
    .select('id')
    .eq('role', 'intern')
    .eq('department_id', departmentId);

  if (deptInternsError) throw deptInternsError;
  const departmentInternIds = departmentInterns.map(i => i.id);

  let pendingAttendanceCount = 0;
  let pendingDocumentsCount = 0;
  let recentAttendance = [];
  let presentToday = 0;
  let approvedToday = 0;

  if (departmentInternIds.length > 0) {
    const today = new Date();
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setHours(23, 59, 59, 999);

    // Get today's attendance logs for the department's interns
    const { data: todayLogsData, error: todayLogsError } = await supabase
      .from('attendance_logs')
      .select('id, intern_id, scan_time, approval_status')
      .in('intern_id', departmentInternIds)
      .gte('scan_time', start.toISOString())
      .lte('scan_time', end.toISOString());
    
    if (todayLogsError) throw todayLogsError;
    const todayLogs = todayLogsData || [];
    
    const presentSet = new Set(todayLogs
      .filter((log) => log.approval_status !== 'rejected')
      .map((log) => log.intern_id));
      
    presentToday = presentSet.size;
    approvedToday = todayLogs.filter((log) => log.approval_status === 'approved').length;

    // Get pending attendance logs for the department's interns
    const { count: pendingLogsCount, error: pendingLogsError } = await supabase
      .from('attendance_logs')
      .select('id', { count: 'exact', head: true })
      .in('intern_id', departmentInternIds)
      .eq('approval_status', 'pending');

    if (pendingLogsError) throw pendingLogsError;
    pendingAttendanceCount = pendingLogsCount || 0;

    // Get pending documents for the department's interns
    const { count: pendingDocsCount, error: pendingDocsError } = await supabase
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .in('intern_id', departmentInternIds)
      .eq('status', 'pending');

    if (pendingDocsError) throw pendingDocsError;
    pendingDocumentsCount = pendingDocsCount || 0;

    // Get recent attendance logs for the department's interns
    const { data: recentLogs, error: recentLogsError } = await supabase
      .from('attendance_logs')
      .select('*')
      .in('intern_id', departmentInternIds)
      .order('scan_time', { ascending: false })
      .limit(5);

    if (recentLogsError) throw recentLogsError;
    recentAttendance = recentLogs || [];
  }

  let accountsMap = {};
  if (departmentInternIds.length > 0) {
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('id, full_name, department_name')
      .in('id', departmentInternIds);
    if (!accountsError && accounts) {
      accountsMap = accounts.reduce((acc, accObj) => {
        acc[accObj.id] = accObj;
        return acc;
      }, {});
    }
  }

  const mappedRecent = (recentAttendance || []).map(log => {
    const accObj = accountsMap[log.intern_id];
    return {
      ...log,
      full_name: accObj?.full_name || log.intern_name,
      department_name: accObj?.department_name
    };
  });

  return {
    stats: {
      total_interns: departmentInternIds.length,
      present_today: presentToday,
      pending_attendance: pendingAttendanceCount,
      approved_today: approvedToday,
      pending_documents: pendingDocumentsCount,
      department_name: user.department_name || 'Your Department',
    },
    recentAttendance: mappedRecent,
    departmentInterns: departmentInterns || [],
  };
}

export async function getAttendanceReport({ month, year, department_id } = {}) {
  const filters = { role: INTERN_ROLE };
  let internQuery = supabase
    .from('accounts')
    .select('id, full_name, school, course, department_name, department_id, required_hours')
    .eq('role', INTERN_ROLE)
    .order('full_name', { ascending: true });

  if (department_id) {
    internQuery = internQuery.eq('department_id', department_id);
  }

  const { data: interns, error: internsError } = await internQuery;
  if (internsError) throw internsError;

  const reportData = await Promise.all(
    interns.map(async (intern) => {
      const mNum = month ? Number(month) : undefined;
      const yNum = year ? Number(year) : undefined;

      // 1. Get DTR records for the selected month/year
      const monthlyDtr = await getDtrRecords(intern.id, { month: mNum, year: yNum });
      
      // 2. Get all-time DTR records for cumulative approved hours (limit 500 days)
      const allTimeDtr = await getDtrRecords(intern.id, { limit: 500 });

      // Sum of hours for the selected month
      const monthlyTotalHours = monthlyDtr.reduce((sum, r) => sum + (r.total_hours || 0), 0);

      // Sum of approved hours for all-time (determines overall progress)
      const cumulativeApprovedHours = allTimeDtr
        .filter(r => r.approval_status === 'approved')
        .reduce((sum, r) => sum + (r.total_hours || 0), 0);

      // Days present = number of days with DTR logs in the selected month
      const daysPresent = monthlyDtr.length;

      return {
        id: intern.id,
        full_name: intern.full_name,
        school: intern.school,
        department_name: intern.department_name,
        days_present: daysPresent,
        total_hours: Number(monthlyTotalHours.toFixed(2)),
        required_hours: Number(intern.required_hours || 0),
        rendered_hours: Number(cumulativeApprovedHours.toFixed(2)),
      };
    })
  );

  return reportData;
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

  function computeStandardDtrRecord(date, entries) {
    // Sort scans chronologically; take at most 4 slots
    const sorted = [...entries].sort((a, b) => new Date(a.scan_time) - new Date(b.scan_time));
    const [s1, s2, s3, s4] = sorted;

    // Positional slot assignment: AM-in, AM-out, PM-in, PM-out
    const amInRaw  = s1?.scan_type === 'time_in'  ? new Date(s1.scan_time) : null;
    const amOutRaw = s2?.scan_type === 'time_out' ? new Date(s2.scan_time) : null;
    const pmInRaw  = s3?.scan_type === 'time_in'  ? new Date(s3.scan_time) : null;
    const pmOutRaw = s4?.scan_type === 'time_out' ? new Date(s4.scan_time) : null;

    // ── Time-floor rules (Manila clock) ─────────────────────────────────────
    let effectiveAmIn = null;
    if (amInRaw) {
      const m = toMNLDate(amInRaw);
      effectiveAmIn = m.getUTCHours() < 8
        ? new Date(`${date}T08:00:00+08:00`)
        : amInRaw;
    }

    let effectivePmIn = null;
    if (pmInRaw) {
      const m = toMNLDate(pmInRaw);
      const h = m.getUTCHours(), min = m.getUTCMinutes();
      effectivePmIn = (h < 13 || (h === 13 && min === 0))
        ? new Date(`${date}T13:00:00+08:00`)
        : pmInRaw;
    }

    const effectivePmOut = pmOutRaw;
    const noon = new Date(`${date}T12:00:00+08:00`);

    let totalHours = 0;
    if (effectiveAmIn && effectivePmIn && effectivePmOut) {
      const amSession = Math.max(0, (noon - effectiveAmIn) / 3600000);
      const pmSession = Math.max(0, (effectivePmOut - effectivePmIn) / 3600000);
      totalHours = amSession + pmSession;
    } else if (effectiveAmIn && amOutRaw) {
      const amEnd = amOutRaw < noon ? amOutRaw : noon;
      totalHours = Math.max(0, (amEnd - effectiveAmIn) / 3600000);
    } else if (effectivePmIn && effectivePmOut) {
      totalHours = Math.max(0, (effectivePmOut - effectivePmIn) / 3600000);
    }

    const amStatus      = s1?.approval_status || 'pending';
    const pmStatus      = s4?.approval_status || s3?.approval_status || 'pending';
    const allStatuses   = entries.map(e => e.approval_status).filter(Boolean);
    let overallStatus   = 'pending';
    if (allStatuses.length && allStatuses.every(s => s === 'approved')) overallStatus = 'approved';
    if (allStatuses.some(s => s === 'rejected')) overallStatus = 'rejected';

    return {
      date,
      am_time_in:  mnlTimeStr(effectiveAmIn),
      am_time_out: mnlTimeStr(amOutRaw),
      pm_time_in:  mnlTimeStr(effectivePmIn),
      pm_time_out: mnlTimeStr(effectivePmOut),
      am_status:   amStatus,
      pm_status:   pmStatus,
      approval_status: overallStatus,
      total_hours: Number(totalHours.toFixed(2)),
      time_in:  mnlTimeStr(effectiveAmIn),
      time_out: mnlTimeStr(effectivePmOut),
    };
  }

  return Object.entries(grouped).map(([date, entries]) => {
    // Check if there is an override log for this day
    const overrideLog = entries.find(l => l.remarks && l.remarks.startsWith('OVERRIDE:'));
    if (overrideLog) {
      const parts = overrideLog.remarks.split(':');
      const overrideType = parts[1]; // 'SUSPENDED', 'EXCUSED', or 'HOURS'
      
      if (overrideType === 'SUSPENDED') {
        const textRemarks = parts.slice(2).join(':');
        return {
          date,
          am_time_in: null,
          am_time_out: null,
          pm_time_in: null,
          pm_time_out: null,
          am_status: 'approved',
          pm_status: 'approved',
          approval_status: 'approved',
          total_hours: 0,
          time_in: null,
          time_out: null,
          remarks: textRemarks || 'Suspension',
          is_override: true,
          override_type: 'suspended',
          override_remarks: textRemarks
        };
      } else if (overrideType === 'EXCUSED') {
        const textRemarks = parts.slice(2).join(':');
        return {
          date,
          am_time_in: null,
          am_time_out: null,
          pm_time_in: null,
          pm_time_out: null,
          am_status: 'approved',
          pm_status: 'approved',
          approval_status: 'approved',
          total_hours: 8.0, // Credited hours
          time_in: null,
          time_out: null,
          remarks: textRemarks || 'Excused',
          is_override: true,
          override_type: 'excused',
          override_remarks: textRemarks
        };
      } else if (overrideType === 'HOURS') {
        const customHrs = Number(parts[2]) || 0;
        const textRemarks = parts.slice(3).join(':');
        // Filter out override log to compute scans normally
        const normalScans = entries.filter(l => l.id !== overrideLog.id);
        const standardRecord = computeStandardDtrRecord(date, normalScans);
        return {
          ...standardRecord,
          total_hours: customHrs,
          remarks: textRemarks || 'Hours Overridden',
          is_override: true,
          override_type: 'hours',
          override_hours: customHrs,
          override_remarks: textRemarks
        };
      } else if (overrideType === 'OTHERS') {
        const customHrs = Number(parts[2]) || 0;
        const textRemarks = parts.slice(3).join(':');
        return {
          date,
          am_time_in: null,
          am_time_out: null,
          pm_time_in: null,
          pm_time_out: null,
          am_status: 'approved',
          pm_status: 'approved',
          approval_status: 'approved',
          total_hours: customHrs,
          time_in: null,
          time_out: null,
          remarks: textRemarks || 'Others',
          is_override: true,
          override_type: 'others',
          override_hours: customHrs,
          override_remarks: textRemarks
        };
      }
    }

    return computeStandardDtrRecord(date, entries);
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

export async function getEvaluations(userId, isAdmin, department_id = null) {
  let query = supabase
    .from('evaluations')
    .select('*')
    .order('evaluation_date', { ascending: false });

  if (!isAdmin) {
    query = query.eq('intern_id', userId);
  }

  if (department_id) {
    const { data: accounts } = await supabase.from('accounts').select('id').eq('department_id', department_id).eq('role', 'intern');
    const internIds = accounts ? accounts.map(a => a.id) : [];
    if (internIds.length === 0) {
      return [];
    }
    query = query.in('intern_id', internIds);
  }

  const { data, error } = await query;
  if (error) throw error;

  const evaluations = data || [];
  const internIds = [...new Set(evaluations.map(e => e.intern_id).filter(Boolean))];
  let accountsMap = {};
  if (internIds.length > 0) {
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('id, full_name')
      .in('id', internIds);
    if (!accountsError && accounts) {
      accountsMap = accounts.reduce((acc, accObj) => {
        acc[accObj.id] = accObj;
        return acc;
      }, {});
    }
  }

  return evaluations.map(e => ({
    ...e,
    full_name: accountsMap[e.intern_id]?.full_name || 'Unknown Intern'
  }));
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

export async function getDocuments(userId, isAdmin, { status, search, department_id } = {}) {
export async function getDocuments(userId, isAdmin, { status, search, department_id } = {}) {
  let query = supabase
    .from('documents')
    // Select all columns from documents, and the full_name from the joined accounts table
    .select(`
      *,
      account:accounts!inner(full_name, department_id)
    `)
    .order('upload_date', { ascending: false });

  if (!isAdmin) {
    query = query.eq('intern_id', userId);
  }

  if (department_id) {
    query = query.eq('account.department_id', department_id);
  }

  if (status) {
    query = query.eq('status', status);
  }

  if (department_id) {
    const { data: interns } = await supabase
      .from('accounts')
      .select('id')
      .eq('role', 'intern')
      .eq('department_id', department_id);
    const internIds = (interns || []).map(i => i.id);
    if (internIds.length > 0) {
      query = query.in('intern_id', internIds);
    } else {
      query = query.in('intern_id', [-1]);
    }
  }

  // Add search capability for document name and type.
  // Note: Searching by intern name here would require a more complex query or a database view.
  if (search) {
    query = query.or(`original_name.ilike.%${search}%,document_type.ilike.%${search}%`);
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

export async function getCalendarEvents({ year, month }) {
  if (!year || !month) throw new Error('Year and month are required');

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);

  const { data, error } = await supabase
    .from('calendar_events')
    .select(`
      *,
      creator:accounts(full_name)
    `)
    .gte('event_date', startDate.toISOString().slice(0, 10))
    .lte('event_date', endDate.toISOString().slice(0, 10))
    .order('event_date', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function createCalendarEvent(payload, userId) {
  const eventRow = {
    title: payload.title,
    description: payload.description || '',
    event_date: payload.event_date,
    event_type: payload.event_type,
    created_by: userId,
    created_at: new Date().toISOString(),
  };

  const { data: event, error } = await supabase
    .from('calendar_events')
    .insert([eventRow])
    .select()
    .single();

  if (error) throw error;

  if (event) {
    try {
      const { data: interns, error: internsError } = await supabase
        .from('accounts')
        .select('id')
        .eq('role', INTERN_ROLE)
        .eq('status', 'active');

      if (internsError) throw internsError;

      if (interns && interns.length > 0) {
        const notifications = interns.map((intern) => ({
          user_id: intern.id,
          title: `New ${event.event_type}: ${event.title}`,
          message: `A new ${event.event_type} has been posted on the calendar for ${event.event_date}.`,
          created_at: new Date().toISOString(),
        }));

        const { error: notificationError } = await supabase.from('notifications').insert(notifications);
        if (notificationError) throw notificationError;
      }
    } catch (notificationError) {
      console.error('Failed to create notifications for new calendar event:', notificationError.message);
    }
  }

  return event;
}

export async function updateCalendarEvent(id, payload) {
  const { data, error } = await supabase
    .from('calendar_events')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCalendarEvent(id) {
  const { error } = await supabase
    .from('calendar_events')
    .delete()
    .eq('id', id);

  if (error) throw error;
  return { success: true };
}

export async function getSupervisors({ search, page = 1, limit = 10, department_id } = {}) {
  let query = supabase
    .from('accounts')
    .select(
      'id, username, full_name, email, role, department_id, department_name, status, phone, home_address',
      { count: 'exact' }
    )
    .eq('role', 'supervisor')
    .order('full_name', { ascending: true });

  if (search) {
    query = query.or(`full_name.ilike.%${search}%,username.ilike.%${search}%,email.ilike.%${search}%`);
  }

  if (department_id) {
    query = query.eq('department_id', department_id);
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;
  return { supervisors: data || [], total: count || 0 };
}

export async function getSupervisorById(id) {
  const { data, error } = await supabase
    .from('accounts')
    .select('id, username, full_name, email, role, department_id, department_name, status, phone, home_address')
    .eq('id', id)
    .eq('role', 'supervisor')
    .single();

  if (error) throw error;
  return data;
}

export async function createSupervisor(payload) {
  const { password, department_id, ...rest } = payload;
  if (!password) throw new Error('Password is required');

  const password_hash = await bcrypt.hash(password, 10);
  const deptId = department_id && department_id !== '' ? Number(department_id) : null;
  const department = deptId ? await findDepartmentById(deptId) : null;
  const deptId = department_id && department_id !== '' ? Number(department_id) : null;
  const department = deptId ? await findDepartmentById(deptId) : null;
  const departmentName = department?.name || rest.department_name || null;

  const { data, error } = await supabase
    .from('accounts')
    .insert([{ ...rest, password_hash, role: 'supervisor', department_id: deptId, department_name: departmentName }])
    .insert([{ ...rest, password_hash, role: 'supervisor', department_id: deptId, department_name: departmentName }])
    .select('id, username, full_name, email, role, department_id, department_name, status, phone, home_address')
    .single();

  if (error) throw error;
  return data;
}

export async function updateSupervisor(id, payload) {
  const { password, department_id, ...rest } = payload;
  const updates = { ...rest };

  if (password) {
    updates.password_hash = await bcrypt.hash(password, 10);
  }

  if (department_id !== undefined) {
    const deptId = department_id && department_id !== '' ? Number(department_id) : null;
    const department = deptId ? await findDepartmentById(deptId) : null;
    updates.department_name = department?.name || null;
    updates.department_id = deptId;
  if (department_id !== undefined) {
    const deptId = department_id && department_id !== '' ? Number(department_id) : null;
    const department = deptId ? await findDepartmentById(deptId) : null;
    updates.department_name = department?.name || null;
    updates.department_id = deptId;
  }

  const { data, error } = await supabase
    .from('accounts')
    .update(updates)
    .eq('id', id)
    .eq('role', 'supervisor')
    .select('id, username, full_name, email, role, department_id, department_name, status, phone, home_address')
    .single();

  if (error) throw error;
  return data;
}

export async function deleteSupervisor(id) {
  const { error } = await supabase
    .from('accounts')
    .delete()
    .eq('id', id)
    .eq('role', 'supervisor');

  if (error) throw error;
  return { success: true };
}

export async function resetSupervisorPassword(id, newPassword) {
  const password_hash = await bcrypt.hash(newPassword, 10);
  const { error } = await supabase
    .from('accounts')
    .update({ password_hash })
    .eq('id', id)
    .eq('role', 'supervisor');

  if (error) throw error;
  return { success: true };
}
