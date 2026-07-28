
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from './supabaseClient.js';

const INTERN_ROLE = 'intern';
const ADMIN_ROLE = 'admin';

export async function getDivisions() {
  let { data: divisions, error } = await supabase
    .from('divisions')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    const fallback = await supabase.from('departments').select('*').order('name', { ascending: true });
    if (!fallback.error) {
      divisions = fallback.data;
      error = null;
    }
  }

  if (error) throw error;

  const { data: interns, error: internsError } = await supabase
    .from('accounts')
    .select('*')
    .eq('role', INTERN_ROLE);

  if (internsError) throw internsError;

  const counts = (interns || []).reduce((acc, intern) => {
    const id = intern.division_id || intern.department_id || 0;
    acc[id] = (acc[id] || 0) + 1;
    return acc;
  }, {});

  return (divisions || []).map((div) => ({
    ...div,
    intern_count: counts[div.id] || 0,
  }));
}

export async function getDepartments() {
  return getDivisions();
}

export async function createDivision(payload) {
  let { data, error } = await supabase
    .from('divisions')
    .insert([{ ...payload }])
    .select()
    .single();

  if (error) {
    const fallback = await supabase.from('departments').insert([{ ...payload }]).select().single();
    if (!fallback.error) {
      data = fallback.data;
      error = null;
    }
  }

  if (error) throw error;
  return data;
}

export async function createDepartment(payload) {
  return createDivision(payload);
}

export async function updateDivision(id, payload) {
  let { data, error } = await supabase
    .from('divisions')
    .update({ ...payload })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    const fallback = await supabase.from('departments').update({ ...payload }).eq('id', id).select().single();
    if (!fallback.error) {
      data = fallback.data;
      error = null;
    }
  }

  if (error) throw error;
  return data;
}

export async function updateDepartment(id, payload) {
  return updateDivision(id, payload);
}

export async function deleteDivision(id) {
  let { error } = await supabase
    .from('divisions')
    .delete()
    .eq('id', id);

  if (error) {
    const fallback = await supabase.from('departments').delete().eq('id', id);
    if (!fallback.error) error = null;
  }

  if (error) throw error;
  return { success: true };
}

export async function deleteDepartment(id) {
  return deleteDivision(id);
}

export async function findDivisionById(id) {
  let { data, error } = await supabase
    .from('divisions')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    const fallback = await supabase.from('departments').select('*').eq('id', id).single();
    if (!fallback.error) {
      data = fallback.data;
      error = null;
    }
  }

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function findDepartmentById(id) {
  return findDivisionById(id);
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

  const counts = (interns || []).reduce((acc, intern) => {
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

export async function getInterns({ search, page = 1, limit = 10, division_id, department_id, school_id, status, sortBy = 'full_name', sortOrder = 'asc' } = {}) {
  let query = supabase
    .from('accounts')
    .select('*', { count: 'exact' })
    .eq('role', INTERN_ROLE);

  if (search) {
    query = query.or(`full_name.ilike.%${search}%,username.ilike.%${search}%,email.ilike.%${search}%,school.ilike.%${search}%,division_name.ilike.%${search}%`);
  }

  const divId = division_id || department_id;
  if (divId) {
    query = query.eq('division_id', divId);
  }

  if (school_id) {
    query = query.eq('school_id', school_id);
  }

  if (status) {
    if (status === 'active') {
      query = query.neq('status', 'archived');
    } else {
      query = query.eq('status', status);
    }
  } else {
    query = query.neq('status', 'archived');
  }

  const isAscending = sortOrder === 'asc';
  if (sortBy === 'division' || sortBy === 'department') {
    query = query.order('division_name', { ascending: isAscending });
  } else if (sortBy === 'school') {
    query = query.order('school', { ascending: isAscending });
  } else {
    query = query.order(sortBy || 'full_name', { ascending: isAscending });
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;
  return { interns: data || [], total: count || 0 };
}

export async function getInternById(id) {
  const baseFields = 'id, username, full_name, first_name, middle_name, last_name, name_suffix, email, role, school, course, department_id, department_name, status, start_date, end_date, required_hours, rendered_hours, student_id, year_level, phone, home_address, emergency_name, emergency_relation, emergency_phone';
  try {
    const { data, error } = await supabase
      .from('accounts')
      .select(`${baseFields}, face_registered, face_registered_at`)
      .eq('id', id)
      .eq('role', INTERN_ROLE)
      .single();
    if (error) throw error;
    return data;
  } catch (err) {
    const { data, error } = await supabase
      .from('accounts')
      .select(baseFields)
      .eq('id', id)
      .eq('role', INTERN_ROLE)
      .single();
    if (error) throw error;
    return { ...data, face_registered: false, face_registered_at: null };
  }
}

export async function createIntern(payload) {
  const { password, division_id, department_id, school_id, ...rest } = payload;
  if (rest.first_name || rest.last_name) {
    rest.full_name = [rest.first_name, rest.middle_name, rest.last_name, rest.name_suffix].filter(Boolean).join(' ');
  }
  if (!password) throw new Error('Password is required');

  const password_hash = await bcrypt.hash(password, 10);
  
  const divId = division_id || department_id ? Number(division_id || department_id) : null;
  const division = divId ? await findDivisionById(divId) : null;
  const divName = division?.name || rest.division_name || null;

  const schId = school_id && school_id !== '' ? Number(school_id) : null;
  const school = schId ? await findSchoolById(schId) : null;
  const schoolName = school?.name || rest.school || null;

  const { data, error } = await supabase
    .from('accounts')
    .insert([{ ...rest, password_hash, role: INTERN_ROLE, division_id: divId, division_name: divName, school_id: schId, school: schoolName }])
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function updateIntern(id, payload) {
  const { password, division_id, department_id, school_id, ...rest } = payload;
  if (rest.first_name || rest.last_name) {
    rest.full_name = [rest.first_name, rest.middle_name, rest.last_name, rest.name_suffix].filter(Boolean).join(' ');
  }
  const updates = { ...rest };
  if (rest.first_name !== undefined || rest.last_name !== undefined) {
    const fn = rest.first_name || '';
    const mn = rest.middle_name || '';
    const ln = rest.last_name || '';
    const sn = rest.name_suffix || '';
    if (fn || ln) {
      updates.full_name = [fn, mn, ln, sn].filter(Boolean).join(' ');
    }
  }

  if (password) {
    updates.password_hash = await bcrypt.hash(password, 10);
  }

  if (department_id !== undefined) {
    const deptId = department_id && department_id !== '' ? Number(department_id) : null;
    const department = deptId ? await findDepartmentById(deptId) : null;
    updates.department_id = deptId;
    updates.department_name = department?.name || rest.department_name || null;
  }

  if (school_id !== undefined) {
    const schId = school_id && school_id !== '' ? Number(school_id) : null;
    const school = schId ? await findSchoolById(schId) : null;
    updates.school_id = schId;
    updates.school = school?.name || rest.school || null;
  }

  const { data, error } = await supabase
    .from('accounts')
    .update(updates)
    .eq('id', id)
    .eq('role', INTERN_ROLE)
    .select('id, username, full_name, first_name, middle_name, last_name, name_suffix, email, role, school, school_id, course, division_id, division_name, status, start_date, end_date, required_hours, rendered_hours, student_id, year_level, phone, home_address, emergency_name, emergency_relation, emergency_phone')
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
  if (!userId) return null;
  const baseFields = 'id, username, full_name, first_name, middle_name, last_name, name_suffix, email, role, school, school_id, course, division_id, division_name, status, start_date, end_date, required_hours, rendered_hours, student_id, year_level, phone, home_address, emergency_name, emergency_relation, emergency_phone';
  const legacyFields = 'id, username, full_name, first_name, middle_name, last_name, name_suffix, email, role, school, course, department_id, department_name, status, start_date, end_date, required_hours, rendered_hours, student_id, year_level, phone, home_address, emergency_name, emergency_relation, emergency_phone';
  try {
    const { data, error } = await supabase
      .from('accounts')
      .select(`${baseFields}, face_registered, face_registered_at`)
      .eq('id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data;
  } catch (err) {
    const { data, error } = await supabase
      .from('accounts')
      .select(legacyFields)
      .eq('id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return { ...data, face_registered: false, face_registered_at: null };
  }
}

export async function updateCurrentUserProfile(userId, updates) {
  const payload = { ...updates };
  const rawDivId = payload.division_id !== undefined ? payload.division_id : payload.department_id;
  if (rawDivId !== undefined) {
    const division = await findDivisionById(rawDivId);
    payload.division_id = rawDivId;
    payload.division_name = division?.name || payload.division_name || null;
    delete payload.department_id;
    delete payload.department_name;
  }

  const baseFields = 'id, username, full_name, first_name, middle_name, last_name, name_suffix, email, role, school, course, department_id, department_name, status, start_date, end_date, required_hours, rendered_hours, student_id, year_level, phone, home_address, emergency_name, emergency_relation, emergency_phone';
  try {
    const { data, error } = await supabase
      .from('accounts')
      .update(payload)
      .eq('id', userId)
      .select(`${baseFields}, face_registered, face_registered_at`)
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    const { data, error } = await supabase
      .from('accounts')
      .update(payload)
      .eq('id', userId)
      .select(baseFields)
      .single();

    if (error) throw error;
    return { ...data, face_registered: false, face_registered_at: null };
  }
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

export async function getAttendanceLogs({ status, date, page = 1, limit = 15, division_id, department_id } = {}) {
  let query = supabase
    .from('attendance_logs')
    .select('*, attendance_photos(photo)', { count: 'exact' })
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

  const divId = division_id || department_id;
  if (divId) {
    const { data: accounts } = await supabase.from('accounts').select('id').eq('division_id', divId).eq('role', 'intern');
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
      .select('id, full_name, division_name')
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
    const photo = log.attendance_photos?.[0]?.photo || null;
    return {
      ...log,
      photo,
      full_name: accObj?.full_name || log.intern_name,
      division_name: accObj?.division_name,
      department_name: accObj?.division_name
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

  const [internsRes, attendanceRes, pendingDocsRes, divisionsRes] = await Promise.all([
    supabase.from('accounts').select('id', { count: 'exact', head: false }).eq('role', INTERN_ROLE),
    supabase.from('attendance_logs').select('id, intern_id, scan_time, approval_status', { count: 'exact' })
      .gte('scan_time', start.toISOString())
      .lte('scan_time', end.toISOString()),
    supabase.from('documents').select('id', { count: 'exact' }).eq('status', 'pending'),
    supabase.from('divisions').select('id', { count: 'exact', head: false })
  ]);

  if (internsRes.error) throw internsRes.error;
  if (attendanceRes.error) throw attendanceRes.error;
  if (pendingDocsRes.error) throw pendingDocsRes.error;
  if (divisionsRes.error) throw divisionsRes.error;

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
      .select('id, full_name, division_name')
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
      division_name: accObj?.division_name,
      department_name: accObj?.division_name
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
      total_divisions: divisionsRes.count || 0,
      total_departments: divisionsRes.count || 0,
      pending_documents: pendingDocsRes.count || 0,
    },
    recentAttendance: mappedRecent,
    recentDocuments: recentDocuments || [],
  };
}

export async function getSupervisorDashboardStats(user) {
  const divId = user.division_id || user.department_id;
  if (!user || user.role !== 'supervisor' || !divId) {
    throw new Error('Permission denied or supervisor is not assigned to a division.');
  }

  const { data: departmentInterns, error: deptInternsError } = await supabase
    .from('accounts')
    .select('id')
    .eq('role', 'intern')
    .eq('division_id', divId);

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

    const { count: pendingLogsCount, error: pendingLogsError } = await supabase
      .from('attendance_logs')
      .select('id', { count: 'exact', head: true })
      .in('intern_id', departmentInternIds)
      .eq('approval_status', 'pending');

    if (pendingLogsError) throw pendingLogsError;
    pendingAttendanceCount = pendingLogsCount || 0;

    const { count: pendingDocsCount, error: pendingDocsError } = await supabase
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .in('intern_id', departmentInternIds)
      .eq('status', 'pending');

    if (pendingDocsError) throw pendingDocsError;
    pendingDocumentsCount = pendingDocsCount || 0;

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
      .select('id, full_name, division_name')
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
      division_name: accObj?.division_name,
      department_name: accObj?.division_name
    };
  });

  return {
    stats: {
      total_interns: departmentInternIds.length,
      present_today: presentToday,
      pending_attendance: pendingAttendanceCount,
      approved_today: approvedToday,
      pending_documents: pendingDocumentsCount,
      division_name: user.division_name || user.department_name || 'Your Division',
      department_name: user.division_name || user.department_name || 'Your Division',
    },
    recentAttendance: mappedRecent,
    departmentInterns: departmentInterns || [],
  };
}

export async function getAttendanceReport({ month, year, division_id, department_id } = {}) {
  const divId = division_id || department_id;
  let internQuery = supabase
    .from('accounts')
    .select('id, full_name, school, course, division_name, division_id, required_hours')
    .eq('role', INTERN_ROLE)
    .order('full_name', { ascending: true });

  if (divId) {
    internQuery = internQuery.eq('division_id', divId);
  }

  const { data: interns, error: internsError } = await internQuery;
  if (internsError) throw internsError;

  const reportData = await Promise.all(
    interns.map(async (intern) => {
      const mNum = month ? Number(month) : undefined;
      const yNum = year ? Number(year) : undefined;

      const monthlyDtr = await getDtrRecords(intern.id, { month: mNum, year: yNum });
      const allTimeDtr = await getDtrRecords(intern.id, { limit: 500 });

      const monthlyTotalHours = monthlyDtr.reduce((sum, r) => sum + (r.total_hours || 0), 0);

      const cumulativeApprovedHours = allTimeDtr
        .filter(r => r.approval_status === 'approved')
        .reduce((sum, r) => sum + (r.total_hours || 0), 0);

      const daysPresent = monthlyDtr.length;

      return {
        id: intern.id,
        full_name: intern.full_name,
        school: intern.school,
        division_name: intern.division_name,
        department_name: intern.division_name,
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
  const MNL_OFFSET_MS = 8 * 60 * 60 * 1000;

  function toMNLDate(date) {
    return new Date(date.getTime() + MNL_OFFSET_MS);
  }

  function toHHMM(mnlDate) {
    if (!mnlDate) return null;
    return mnlDate.toISOString().slice(11, 16);
  }

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
    const startUTC = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0) - MNL_OFFSET_MS);
    const endUTC = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999) - MNL_OFFSET_MS);
    query = query.gte('scan_time', startUTC.toISOString()).lte('scan_time', endUTC.toISOString());
  } else {
    const since = new Date(Date.now() - limit * 24 * 60 * 60 * 1000);
    query = query.gte('scan_time', since.toISOString());
  }

  const { data: logs, error } = await query;
  if (error) throw error;

  const grouped = logs.reduce((acc, log) => {
    const mnlDate = toMNLDate(new Date(log.scan_time));
    const dateKey = mnlDate.toISOString().slice(0, 10);
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(log);
    return acc;
  }, {});

  function computeStandardDtrRecord(date, entries) {
    const sorted = [...entries].sort((a, b) => new Date(a.scan_time) - new Date(b.scan_time));
    const [s1, s2, s3, s4] = sorted;

    const amInRaw = s1?.scan_type === 'time_in' ? new Date(s1.scan_time) : null;
    const amOutRaw = s2?.scan_type === 'time_out' ? new Date(s2.scan_time) : null;
    const pmInRaw = s3?.scan_type === 'time_in' ? new Date(s3.scan_time) : null;
    const pmOutRaw = s4?.scan_type === 'time_out' ? new Date(s4.scan_time) : null;

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

    const amStatus = s1?.approval_status || 'pending';
    const pmStatus = s4?.approval_status || s3?.approval_status || 'pending';
    const allStatuses = entries.map(e => e.approval_status).filter(Boolean);
    let overallStatus = 'pending';
    if (allStatuses.length && allStatuses.every(s => s === 'approved')) overallStatus = 'approved';
    if (allStatuses.some(s => s === 'rejected')) overallStatus = 'rejected';

    return {
      date,
      am_time_in: mnlTimeStr(effectiveAmIn),
      am_time_out: mnlTimeStr(amOutRaw),
      pm_time_in: mnlTimeStr(effectivePmIn),
      pm_time_out: mnlTimeStr(effectivePmOut),
      am_status: amStatus,
      pm_status: pmStatus,
      approval_status: overallStatus,
      total_hours: Number(totalHours.toFixed(2)),
      time_in: mnlTimeStr(effectiveAmIn),
      time_out: mnlTimeStr(effectivePmOut),
    };
  }

  return Object.entries(grouped).map(([date, entries]) => {
    const overrideLog = entries.find(l => l.remarks && l.remarks.startsWith('OVERRIDE:'));
    if (overrideLog) {
      const parts = overrideLog.remarks.split(':');
      const overrideType = parts[1];

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
          total_hours: 8.0,
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

export async function setDtrOverride(internId, { date, type, hours = 0, remarks = '' }) {
  if (!internId || !date || !type) {
    throw new Error('Intern ID, date, and override type are required');
  }
  const formattedType = type.toUpperCase();
  const overrideRemark = `OVERRIDE:${formattedType}:${hours}:${remarks}`;
  const scanTime = new Date(`${date}T08:00:00+08:00`).toISOString();

  const { data: intern } = await supabase.from('accounts').select('full_name').eq('id', internId).single();
  const internName = intern?.full_name || 'Intern';

  const { data, error } = await supabase
    .from('attendance_logs')
    .insert([{
      intern_id: internId,
      intern_name: internName,
      scan_type: 'time_in',
      scan_time: scanTime,
      approval_status: 'approved',
      remarks: overrideRemark
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function setBulkDtrOverride({ internIds, date, type, hours = 0, remarks = '' }) {
  if (!Array.isArray(internIds) || !internIds.length || !date || !type) {
    throw new Error('Intern IDs list, date, and override type are required');
  }

  const results = [];
  for (const internId of internIds) {
    const res = await setDtrOverride(internId, { date, type, hours, remarks });
    results.push(res);
  }
  return { success: true, count: results.length };
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
  if (!isAdmin) {
    query = query.eq('user_id', userId);
  } else {
    query = query.neq('id', 0);
  }
  const { error } = await query;
  if (error) throw error;
  return { success: true };
}

export async function getEvaluations(userId, isAdmin, division_id = null, department_id = null) {
  let query = supabase
    .from('evaluations')
    .select('*')
    .order('evaluation_date', { ascending: false });

  if (!isAdmin) {
    query = query.eq('intern_id', userId);
  }

  const divId = division_id || department_id;
  if (divId) {
    const { data: accounts } = await supabase
      .from('accounts')
      .select('id')
      .eq('division_id', divId)
      .eq('role', 'intern');
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

export async function getDocuments(userId, isAdmin, { status, search, division_id, department_id } = {}) {
  let query = supabase
    .from('documents')
    .select('*, account:accounts(full_name)')
    .order('upload_date', { ascending: false });

  if (!isAdmin) {
    query = query.eq('intern_id', userId);
  }

  const divId = division_id || department_id;
  if (divId) {
    const { data: interns } = await supabase
      .from('accounts')
      .select('id')
      .eq('role', 'intern')
      .eq('division_id', divId);
    const internIds = (interns || []).map(i => i.id);
    if (internIds.length > 0) {
      query = query.in('intern_id', internIds);
    } else {
      query = query.in('intern_id', [-1]);
    }
  }

  if (status) {
    query = query.eq('status', status);
  }

  if (search) {
    query = query.or(`original_name.ilike.%${search}%,document_type.ilike.%${search}%`);
  }

  const { data: documents, error } = await query;
  if (error) throw error;

  return (documents || []).map(doc => {
    const { data: publicUrlData } = supabase
      .storage
      .from('documents')
      .getPublicUrl(doc.file_path);

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

  const { error: uploadError } = await supabase
    .storage
    .from('documents')
    .upload(filePath, buffer, {
      contentType: mimetype,
      upsert: false,
    });

  if (uploadError) {
    console.error('Supabase Storage Error:', uploadError);
    throw new Error('Failed to upload file to storage. Check backend logs for details.');
  }

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
  const { data: doc, error: findError } = await supabase
    .from('documents')
    .select('file_path, intern_id')
    .eq('id', id)
    .single();

  if (findError) throw findError;
  if (!isAdmin && doc.intern_id !== userId) throw new Error('Permission denied');

  const { error: storageError } = await supabase.storage.from('documents').remove([doc.file_path]);
  if (storageError) {
    console.warn(`Could not delete file from storage: ${storageError.message}`);
  }

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
    .select(`*, creator:accounts(full_name)`)
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

export async function getSupervisors({ search, page = 1, limit = 10, division_id, department_id } = {}) {
  let query = supabase
    .from('accounts')
    .select('*', { count: 'exact' })
    .eq('role', 'supervisor')
    .order('full_name', { ascending: true });

  if (search) {
    query = query.or(`full_name.ilike.%${search}%,username.ilike.%${search}%,email.ilike.%${search}%`);
  }

  const divId = division_id || department_id;
  if (divId) {
    query = query.eq('division_id', divId);
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
    .select('*')
    .eq('id', id)
    .eq('role', 'supervisor')
    .single();

  if (error) throw error;
  return data;
}

export async function createSupervisor(payload) {
  const { password, division_id, department_id, ...rest } = payload;
  if (rest.first_name || rest.last_name) {
    rest.full_name = [rest.first_name, rest.middle_name, rest.last_name, rest.name_suffix].filter(Boolean).join(' ');
  }
  if (!password) throw new Error('Password is required');

  const password_hash = await bcrypt.hash(password, 10);
  const rawDivId = division_id || department_id;
  const divId = rawDivId && rawDivId !== '' ? Number(rawDivId) : null;
  const division = divId ? await findDivisionById(divId) : null;
  const divName = division?.name || rest.division_name || rest.department_name || null;

  const { data, error } = await supabase
    .from('accounts')
    .insert([{ ...rest, password_hash, role: 'supervisor', division_id: divId, division_name: divName }])
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function updateSupervisor(id, payload) {
  const { password, division_id, department_id, ...rest } = payload;
  if (rest.first_name || rest.last_name) {
    rest.full_name = [rest.first_name, rest.middle_name, rest.last_name, rest.name_suffix].filter(Boolean).join(' ');
  }
  const updates = { ...rest };
  if (rest.first_name !== undefined || rest.last_name !== undefined) {
    const fn = rest.first_name || '';
    const mn = rest.middle_name || '';
    const ln = rest.last_name || '';
    const sn = rest.name_suffix || '';
    if (fn || ln) {
      updates.full_name = [fn, mn, ln, sn].filter(Boolean).join(' ');
    }
  }

  if (password) {
    updates.password_hash = await bcrypt.hash(password, 10);
  }

  const rawDivId = division_id !== undefined ? division_id : department_id;
  if (rawDivId !== undefined) {
    const divId = rawDivId && rawDivId !== '' ? Number(rawDivId) : null;
    const division = divId ? await findDivisionById(divId) : null;
    updates.division_name = division?.name || null;
    updates.division_id = divId;
  }

  const { data, error } = await supabase
    .from('accounts')
    .update(updates)
    .eq('id', id)
    .eq('role', 'supervisor')
    .select('*')
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

export async function bulkMarkHoliday({ date, holiday_name }) {
  if (!date) throw new Error('Holiday date is required');

  const finalRemarks = holiday_name ? `Holiday: ${holiday_name}` : 'Holiday';

  const { data: interns, error: internError } = await supabase
    .from('accounts')
    .select('id, full_name')
    .eq('role', INTERN_ROLE)
    .eq('status', 'active');

  if (internError) throw internError;
  if (!interns || interns.length === 0) return { count: 0 };

  const startOfDay = `${date}T00:00:00.000Z`;
  const endOfDay = `${date}T23:59:59.999Z`;

  const { data: existingLogs, error: fetchError } = await supabase
    .from('attendance_logs')
    .select('id')
    .gte('scan_time', startOfDay)
    .lte('scan_time', endOfDay);

  if (fetchError) throw fetchError;

  if (existingLogs && existingLogs.length > 0) {
    const idsToDelete = existingLogs.map(l => l.id);
    await supabase.from('attendance_logs').delete().in('id', idsToDelete);
  }

  const logsToInsert = interns.map(intern => ({
    intern_id: intern.id,
    intern_name: intern.full_name,
    scan_type: 'time_in',
    scan_time: new Date(`${date}T08:00:00Z`).toISOString(),
    approval_status: 'approved',
    remarks: finalRemarks
  }));

  const { data, error } = await supabase
    .from('attendance_logs')
    .insert(logsToInsert)
    .select();

  if (error) throw error;
  return { count: data.length };
}

/* ==========================================================================
   INTERN PROJECT TRACKING & PROJECT DIRECTORY FUNCTIONS
   ========================================================================== */

export async function getProjects({ search, status, division_id, group_name } = {}) {
  let query = supabase
    .from('intern_projects')
    .select('*')
    .order('updated_at', { ascending: false });

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  if (division_id) {
    query = query.eq('division_id', division_id);
  }

  if (group_name) {
    query = query.ilike('group_name', `%${group_name}%`);
  }

  if (search) {
    query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%,group_name.ilike.%${search}%`);
  }

  const { data: projects, error } = await query;
  if (error) {
    console.warn('Could not query intern_projects table:', error.message);
    return [];
  }

  const projectList = projects || [];
  if (projectList.length === 0) return [];

  const leaderIds = Array.from(new Set(projectList.map(p => p.leader_id).filter(Boolean)));
  let leadersMap = {};
  if (leaderIds.length > 0) {
    const { data: leaders } = await supabase
      .from('accounts')
      .select('id, full_name, email, division_name')
      .in('id', leaderIds);
    (leaders || []).forEach(l => {
      leadersMap[l.id] = l;
    });
  }

  const projectIds = projectList.map(p => p.id);
  const { data: files } = await supabase
    .from('project_files')
    .select('*')
    .in('project_id', projectIds)
    .order('upload_date', { ascending: false });

  const filesByProject = (files || []).reduce((acc, file) => {
    const { data: publicUrlData } = supabase.storage.from('documents').getPublicUrl(file.file_path);
    const enrichedFile = {
      ...file,
      public_url: publicUrlData?.publicUrl || ''
    };
    if (!acc[file.project_id]) acc[file.project_id] = [];
    acc[file.project_id].push(enrichedFile);
    return acc;
  }, {});

  return projectList.map(p => {
    const leader = leadersMap[p.leader_id];
    return {
      ...p,
      leader_name: leader?.full_name || 'Unassigned',
      leader_email: leader?.email || '',
      leader_division: leader?.division_name || '',
      files: filesByProject[p.id] || []
    };
  });
}

export async function getProjectById(id) {
  const { data: project, error } = await supabase
    .from('intern_projects')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !project) {
    throw new Error(error?.message || 'Project not found');
  }

  let leader_name = 'Unassigned';
  if (project.leader_id) {
    const { data: leader } = await supabase
      .from('accounts')
      .select('full_name')
      .eq('id', project.leader_id)
      .single();
    if (leader) leader_name = leader.full_name;
  }

  const { data: files } = await supabase
    .from('project_files')
    .select('*')
    .eq('project_id', id)
    .order('upload_date', { ascending: false });

  const enrichedFiles = (files || []).map(file => {
    const { data: publicUrlData } = supabase.storage.from('documents').getPublicUrl(file.file_path);
    return {
      ...file,
      public_url: publicUrlData?.publicUrl || ''
    };
  });

  return {
    ...project,
    leader_name,
    files: enrichedFiles
  };
}

export async function createProject(payload, userId) {
  const { title, description, group_name, division_id, status, progress, members, github_repo, demo_url, leader_id } = payload;
  if (!title || !group_name) {
    throw new Error('Project title and group name are required');
  }

  const { data, error } = await supabase
    .from('intern_projects')
    .insert([{
      title,
      description: description || '',
      group_name,
      division_id: division_id ? Number(division_id) : null,
      status: status || 'in_progress',
      progress: progress !== undefined ? Math.min(100, Math.max(0, Number(progress))) : 0,
      leader_id: leader_id ? Number(leader_id) : userId,
      members: members || [],
      github_repo: github_repo || null,
      demo_url: demo_url || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateProject(id, payload) {
  const updates = { ...payload, updated_at: new Date().toISOString() };
  if (updates.progress !== undefined) {
    updates.progress = Math.min(100, Math.max(0, Number(updates.progress)));
  }

  delete updates.id;
  delete updates.leader;
  delete updates.files;

  const { data, error } = await supabase
    .from('intern_projects')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteProject(id, userId, isAdmin) {
  const { data: project, error: findErr } = await supabase
    .from('intern_projects')
    .select('leader_id')
    .eq('id', id)
    .single();

  if (findErr) throw findErr;
  if (!isAdmin && project.leader_id !== userId) {
    throw new Error('Permission denied: Only project leader or admins can delete this project');
  }

  const { data: files } = await supabase.from('project_files').select('file_path').eq('project_id', id);
  if (files && files.length > 0) {
    const paths = files.map(f => f.file_path);
    await supabase.storage.from('documents').remove(paths);
  }

  const { error } = await supabase.from('intern_projects').delete().eq('id', id);
  if (error) throw error;

  return { success: true };
}

export async function uploadProjectFile({ projectId, userId, uploaderName, file, fileCategory }) {
  if (!file) throw new Error('File upload is required');
  const { originalname, mimetype, size, buffer } = file;
  const fileExtension = originalname.split('.').pop();
  const newFileName = `${uuidv4()}.${fileExtension}`;
  const filePath = `project-files/${projectId}/${newFileName}`;

  const { error: uploadError } = await supabase
    .storage
    .from('documents')
    .upload(filePath, buffer, {
      contentType: mimetype,
      upsert: false,
    });

  if (uploadError) {
    console.error('Supabase Storage Upload Error:', uploadError);
    throw new Error('Failed to upload file to storage.');
  }

  const { data, error } = await supabase
    .from('project_files')
    .insert([{
      project_id: Number(projectId),
      uploaded_by: userId,
      uploader_name: uploaderName || 'Intern',
      file_category: fileCategory || 'documentation',
      original_name: originalname,
      file_name: newFileName,
      file_type: mimetype.split('/').pop(),
      file_size: size,
      file_path: filePath,
      upload_date: new Date().toISOString()
    }])
    .select()
    .single();

  if (error) throw error;

  const { data: publicUrlData } = supabase.storage.from('documents').getPublicUrl(filePath);

  return {
    ...data,
    public_url: publicUrlData?.publicUrl || ''
  };
}

export async function deleteProjectFile(fileId, userId, isAdmin) {
  const { data: file, error: findError } = await supabase
    .from('project_files')
    .select('file_path, uploaded_by')
    .eq('id', fileId)
    .single();

  if (findError) throw findError;
  if (!isAdmin && file.uploaded_by !== userId) {
    throw new Error('Permission denied to delete this file');
  }

  await supabase.storage.from('documents').remove([file.file_path]);

  const { error } = await supabase.from('project_files').delete().eq('id', fileId);
  if (error) throw error;

  return { success: true };
}

export async function getProjectDirectoryStats() {
  const { data: projects, error } = await supabase.from('intern_projects').select('status, progress, group_name');
  if (error) {
    console.warn('Could not fetch project directory stats:', error.message);
    return {
      total_projects: 0,
      completed_projects: 0,
      in_progress_projects: 0,
      review_projects: 0,
      total_files: 0,
      total_groups: 0
    };
  }

  const { count: totalFiles } = await supabase.from('project_files').select('*', { count: 'exact', head: true });

  const list = projects || [];
  const completed = list.filter(p => p.status === 'completed' || p.progress === 100).length;
  const inProgress = list.filter(p => p.status === 'in_progress').length;
  const inReview = list.filter(p => p.status === 'review').length;
  const totalProjects = list.length;
  const groups = Array.from(new Set(list.map(p => p.group_name).filter(Boolean)));

  return {
    total_projects: totalProjects,
    completed_projects: completed,
    in_progress_projects: inProgress,
    review_projects: inReview,
    total_files: totalFiles || 0,
    total_groups: groups.length
  };
}

export async function getProjectMemberList() {
  try {
    const { data, error } = await supabase
      .from('accounts')
      .select('id, full_name, email, division_name, division_id, role, status')
      .eq('role', 'intern')
      .order('full_name', { ascending: true });

    if (error) {
      console.warn('Could not fetch intern project member list:', error.message);
      return [];
    }

    return (data || []).filter(u => !u.status || u.status.toLowerCase() !== 'inactive');
  } catch (err) {
    console.warn('Error in getProjectMemberList:', err.message);
    return [];
  }
}

