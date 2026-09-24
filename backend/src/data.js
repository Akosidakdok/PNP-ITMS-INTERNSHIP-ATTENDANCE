
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from './supabaseClient.js';
import { getPhtDateKey, getPhtDayBoundsUtc } from './utils/attendanceTime.js';
import { buildDtrRecords, summarizeDtrRecords } from './utils/dtrRecords.js';
import { getAssignedProfileForAccount } from './services/attendanceControlService.js';
import { validateUploadFile } from './utils/fileValidation.js';

const INTERN_ROLE = 'intern';
const ADMIN_ROLE = 'admin';
const ALLOWED_DOCUMENT_TYPES = new Set([
  'Endorsement Letter',
  'Curriculum Vitae/Resume',
  'Memorandum of Agreement (MOA)',
  'Personal Data Sheet (PDS)',
  'National Police Clearance',
  'Directorate for Intelligence Clearance',
  '2x2 and 1x1 Pictures',
  'Other',
]);
const INTERN_LIST_FIELDS = 'id, username, full_name, first_name, middle_name, last_name, name_suffix, email, role, school, school_id, course, division_id, division_name, status, start_date, end_date, required_hours, rendered_hours, student_id, year_level, phone, home_address, emergency_name, emergency_relation, emergency_phone, face_registered, face_registered_at, self_face_enrollment_available';
const INTERN_MUTATION_FIELDS = 'id, username, full_name, first_name, middle_name, last_name, name_suffix, email, role, school, school_id, course, division_id, division_name, status, start_date, end_date, required_hours, rendered_hours, student_id, year_level, phone, home_address, emergency_name, emergency_relation, emergency_phone';
const SELF_PROFILE_EDITABLE_FIELDS = new Set([
  'email',
  'phone',
  'home_address',
  'emergency_name',
  'emergency_relation',
  'emergency_phone',
]);
const EVALUATION_CREATE_FIELDS = new Set([
  'intern_id',
  'overall_score',
  'overall_rating',
  'comments',
  'work_quality',
  'punctuality',
  'teamwork',
  'communication',
  'initiative',
]);
const EVALUATION_UPDATE_FIELDS = new Set([
  'overall_score',
  'overall_rating',
  'comments',
  'work_quality',
  'punctuality',
  'teamwork',
  'communication',
  'initiative',
]);
const EVALUATION_SCORE_FIELDS = [
  'overall_score',
  'work_quality',
  'punctuality',
  'teamwork',
  'communication',
  'initiative',
];
const EVALUATION_RATINGS = new Set([
  'Outstanding',
  'Very Satisfactory',
  'Satisfactory',
  'Fair',
  'Needs Improvement',
  'Poor',
]);

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function positiveId(value, label = 'ID') {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw validationError(`Valid ${label} is required`);
  return id;
}

function normalizedName(value, label) {
  const name = String(value ?? '').trim();
  if (!name) throw validationError(`${label} is required`);
  if (name.length > 200) throw validationError(`${label} must be 200 characters or fewer`);
  return name;
}

function normalizedOptionalText(value, label, maxLength = 500) {
  if (value === undefined || value === null) return value === null ? null : undefined;
  const text = String(value).trim();
  if (text.length > maxLength) throw validationError(`${label} must be ${maxLength} characters or fewer`);
  return text;
}

function validatePassword(password, label = 'Password') {
  if (typeof password !== 'string' || password.length < 8) {
    throw validationError(`${label} must be at least 8 characters`);
  }
  if (password.length > 128) throw validationError(`${label} must be 128 characters or fewer`);
}

function validateEmail(email) {
  const normalized = String(email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 254) {
    throw validationError('A valid email address is required');
  }
  return normalized;
}

function validateDateInput(value, label) {
  if (value === undefined || value === null || value === '') return value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    throw validationError(`${label} must use YYYY-MM-DD format`);
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== String(value)) {
    throw validationError(`${label} is not a valid calendar date`);
  }
  return value;
}

function assertAllowedFields(payload, allowedFields, label) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw validationError(`${label} payload must be an object`);
  }
  const unsupported = Object.keys(payload).filter(field => !allowedFields.has(field));
  if (unsupported.length > 0) throw validationError(`Unsupported ${label} field(s): ${unsupported.join(', ')}`);
}

const ACCOUNT_INPUT_FIELDS = new Set([
  'username', 'password', 'password_hash', 'full_name', 'first_name', 'middle_name', 'last_name', 'name_suffix',
  'email', 'phone', 'home_address', 'emergency_name', 'emergency_relation', 'emergency_phone', 'school',
  'school_id', 'course', 'division_id', 'division_name', 'department_id', 'department_name', 'status',
  'start_date', 'end_date', 'required_hours', 'student_id', 'year_level', 'face_embedding', 'face_photo',
  'face_registered', 'face_registered_at', 'self_face_enrollment_available', 'rendered_hours', 'rendered_minutes',
  'role', 'id', 'created_at',
]);

function normalizeDivisionPayload(payload, { partial = false } = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw validationError('Division payload must be an object');
  }
  const allowed = new Set(['name', 'description', 'head_name']);
  const unsupported = Object.keys(payload).filter(field => !allowed.has(field));
  if (unsupported.length > 0) throw validationError(`Unsupported division field(s): ${unsupported.join(', ')}`);

  const normalized = {};
  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'name')) {
    normalized.name = normalizedName(payload.name, 'Division name');
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'description')) {
    normalized.description = normalizedOptionalText(payload.description, 'Division description');
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'head_name')) {
    normalized.head_name = normalizedOptionalText(payload.head_name, 'Division head name', 200);
  }
  if (Object.keys(normalized).length === 0) throw validationError('At least one division field is required');
  return normalized;
}

function normalizeSchoolPayload(payload, { partial = false } = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw validationError('School payload must be an object');
  }
  const unsupported = Object.keys(payload).filter(field => field !== 'name');
  if (unsupported.length > 0) throw validationError(`Unsupported school field(s): ${unsupported.join(', ')}`);
  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'name')) {
    return { name: normalizedName(payload.name, 'School name') };
  }
  throw validationError('School name is required');
}

function pickEvaluationFields(payload, allowedFields) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    const error = new Error('Evaluation payload must be an object');
    error.statusCode = 400;
    throw error;
  }

  const unsupportedFields = Object.keys(payload).filter(field => !allowedFields.has(field));
  if (unsupportedFields.length > 0) {
    const error = new Error(`Unsupported evaluation field(s): ${unsupportedFields.join(', ')}`);
    error.statusCode = 400;
    throw error;
  }

  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  );
}

async function hydrateDivisionNames(accounts = []) {
  if (!Array.isArray(accounts) || accounts.length === 0) return accounts;

  const divisionIds = [...new Set(
    accounts
      .map(account => account?.division_id ?? account?.department_id)
      .map(Number)
      .filter(id => Number.isInteger(id) && id > 0)
  )];

  if (divisionIds.length === 0) {
    return accounts.map(account => ({
      ...account,
      division_id: account?.division_id ?? account?.department_id ?? null,
      division_name: account?.division_name ?? account?.department_name ?? null,
    }));
  }

  let { data: divisions, error } = await supabase
    .from('divisions')
    .select('id, name')
    .in('id', divisionIds);

  // Keep the response compatible with deployments that still use the old
  // table while the division migration is being rolled out.
  if (error) {
    const fallback = await supabase
      .from('departments')
      .select('id, name')
      .in('id', divisionIds);
    if (!fallback.error) {
      divisions = fallback.data;
      error = null;
    }
  }

  if (error) throw error;

  const namesById = new Map((divisions || []).map(division => [Number(division.id), division.name]));
  return accounts.map(account => {
    const divisionId = account?.division_id ?? account?.department_id ?? null;
    return {
      ...account,
      division_id: divisionId,
      // Prefer the canonical division row over the denormalized account copy.
      division_name: namesById.get(Number(divisionId))
        || account?.division_name
        || account?.department_name
        || null,
    };
  });
}

function normalizeEvaluationFields(fields) {
  const normalized = { ...fields };
  for (const field of EVALUATION_SCORE_FIELDS) {
    if (normalized[field] === undefined || normalized[field] === null || normalized[field] === '') continue;
    const value = Number(normalized[field]);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      const validationError = new Error(`${field} must be a number between 0 and 100`);
      validationError.statusCode = 400;
      throw validationError;
    }
    normalized[field] = value;
  }

  if (normalized.overall_rating !== undefined
    && !EVALUATION_RATINGS.has(String(normalized.overall_rating))) {
    const validationError = new Error('Invalid evaluation rating');
    validationError.statusCode = 400;
    throw validationError;
  }

  return normalized;
}

async function addCalculatedRenderedHours(interns = []) {
  const internIds = interns.map(intern => intern.id).filter(Boolean);
  if (internIds.length === 0) return interns;

  const { data: logs, error } = await supabase
    .from('attendance_logs')
    .select('id, intern_id, scan_time, scan_type, approval_status, remarks')
    .in('intern_id', internIds)
    .order('scan_time', { ascending: true });

  if (error) throw error;

  const logsByIntern = new Map(internIds.map(id => [String(id), []]));
  for (const log of logs || []) {
    const key = String(log.intern_id);
    if (!logsByIntern.has(key)) logsByIntern.set(key, []);
    logsByIntern.get(key).push(log);
  }

  return interns.map(intern => {
    const records = buildDtrRecords(logsByIntern.get(String(intern.id)) || []);
    const summary = summarizeDtrRecords(records);
    return {
      ...intern,
      rendered_minutes: summary.approved_minutes,
      rendered_hours: summary.approved_hours,
    };
  });
}

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
  const normalizedPayload = normalizeDivisionPayload(payload);
  let { data, error } = await supabase
    .from('divisions')
    .insert([normalizedPayload])
    .select()
    .single();

  if (error) {
    const fallback = await supabase.from('departments').insert([normalizedPayload]).select().single();
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
  const normalizedId = positiveId(id, 'division ID');
  const normalizedPayload = normalizeDivisionPayload(payload, { partial: true });
  let { data, error } = await supabase
    .from('divisions')
    .update(normalizedPayload)
    .eq('id', normalizedId)
    .select()
    .single();

  if (error) {
    const fallback = await supabase.from('departments').update(normalizedPayload).eq('id', normalizedId).select().single();
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
  const normalizedId = positiveId(id, 'division ID');
  let { error } = await supabase
    .from('divisions')
    .delete()
    .eq('id', normalizedId);

  if (error) {
    const fallback = await supabase.from('departments').delete().eq('id', normalizedId);
    if (!fallback.error) error = null;
  }

  if (error) throw error;
  return { success: true };
}

export async function deleteDepartment(id) {
  return deleteDivision(id);
}

export async function findDivisionById(id) {
  const normalizedId = positiveId(id, 'division ID');
  let { data, error } = await supabase
    .from('divisions')
    .select('*')
    .eq('id', normalizedId)
    .single();

  if (error) {
    const fallback = await supabase.from('departments').select('*').eq('id', normalizedId).single();
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
  const normalizedPayload = normalizeSchoolPayload(payload);
  const { data, error } = await supabase
    .from('schools')
    .insert([normalizedPayload])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateSchool(id, payload) {
  const normalizedId = positiveId(id, 'school ID');
  const normalizedPayload = normalizeSchoolPayload(payload, { partial: true });
  const { data, error } = await supabase
    .from('schools')
    .update(normalizedPayload)
    .eq('id', normalizedId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteSchool(id) {
  const normalizedId = positiveId(id, 'school ID');
  const { error } = await supabase
    .from('schools')
    .delete()
    .eq('id', normalizedId);

  if (error) throw error;
  return { success: true };
}

export async function findSchoolById(id) {
  const normalizedId = positiveId(id, 'school ID');
  const { data, error } = await supabase
    .from('schools')
    .select('*')
    .eq('id', normalizedId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function getInterns({ search, page = 1, limit = 10, division_id, department_id, school_id, status, sortBy = 'full_name', sortOrder = 'asc' } = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 10));
  let query = supabase
    .from('accounts')
    .select(INTERN_LIST_FIELDS, { count: 'exact' })
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

  if (status && status !== 'all') {
    if (status === 'active') {
      query = query.neq('status', 'archived');
    } else {
      query = query.eq('status', status);
    }
  } else if (status !== 'all') {
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

  const from = (safePage - 1) * safeLimit;
  const to = from + safeLimit - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;
  const interns = await hydrateDivisionNames(await addCalculatedRenderedHours(data || []));
  return { interns, total: count || 0 };
}

export async function getInternById(id) {
  const normalizedId = positiveId(id, 'intern ID');
  const legacyFields = 'id, username, full_name, first_name, middle_name, last_name, name_suffix, email, role, school, course, department_id, department_name, status, start_date, end_date, required_hours, rendered_hours, student_id, year_level, phone, home_address, emergency_name, emergency_relation, emergency_phone';
  try {
    const { data, error } = await supabase
      .from('accounts')
      .select(`${INTERN_LIST_FIELDS}`)
      .eq('id', normalizedId)
      .eq('role', INTERN_ROLE)
      .single();
    if (error) throw error;
    const [intern] = await hydrateDivisionNames(await addCalculatedRenderedHours([{
      ...data,
      division_id: data.division_id ?? data.department_id ?? null,
      division_name: data.division_name ?? data.department_name ?? null,
    }]));
    if (intern) {
      try {
        intern.assigned_profile = await getAssignedProfileForAccount(intern.id);
      } catch {
        intern.assigned_profile = null;
      }
    }
    return intern;
  } catch (err) {
    const { data, error } = await supabase
      .from('accounts')
      .select(legacyFields)
      .eq('id', normalizedId)
      .eq('role', INTERN_ROLE)
      .single();
    if (error) throw error;
    const [intern] = await hydrateDivisionNames(await addCalculatedRenderedHours([{
      ...data,
      division_id: data.division_id ?? data.department_id ?? null,
      division_name: data.division_name ?? data.department_name ?? null,
      face_registered: false,
      face_registered_at: null,
      self_face_enrollment_available: false,
    }]));
    if (intern) {
      try {
        intern.assigned_profile = await getAssignedProfileForAccount(intern.id);
      } catch {
        intern.assigned_profile = null;
      }
    }
    return intern;
  }
}

export async function createIntern(payload) {
  assertAllowedFields(payload, ACCOUNT_INPUT_FIELDS, 'intern');
  const {
    password,
    division_id,
    department_id,
    school_id,
    role: _role,
    password_hash: _passwordHash,
    face_embedding: _faceEmbedding,
    face_photo: _facePhoto,
    face_registered: _faceRegistered,
    face_registered_at: _faceRegisteredAt,
    self_face_enrollment_available: _selfFaceEnrollmentAvailable,
    rendered_hours: _renderedHours,
    rendered_minutes: _renderedMinutes,
    id: _id,
    created_at: _createdAt,
    ...rest
  } = payload;
  if (!rest.first_name?.trim() || !rest.last_name?.trim()) {
    throw validationError('First name and last name are required');
  }
  rest.username = String(rest.username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,50}$/.test(rest.username)) {
    throw validationError('Username must be 3-50 characters using letters, numbers, dots, underscores, or hyphens');
  }
  rest.email = validateEmail(rest.email);
  if (rest.first_name || rest.last_name) {
    rest.full_name = [rest.first_name, rest.middle_name, rest.last_name, rest.name_suffix].filter(Boolean).join(' ');
  }
  validatePassword(password, 'Initial password');

  if (rest.status && !['active', 'inactive', 'archived'].includes(rest.status)) {
    throw validationError('Invalid intern status');
  }
  validateDateInput(rest.start_date, 'Start date');
  validateDateInput(rest.end_date, 'End date');
  if (rest.start_date && rest.end_date && rest.end_date < rest.start_date) {
    throw validationError('End date cannot be before start date');
  }
  if (rest.required_hours !== undefined && (!Number.isFinite(Number(rest.required_hours)) || Number(rest.required_hours) < 0 || Number(rest.required_hours) > 10000)) {
    throw validationError('Required hours must be between 0 and 10000');
  }

  const suppliedDivisionName = rest.division_name || rest.department_name || null;
  delete rest.division_name;
  delete rest.department_name;

  const password_hash = await bcrypt.hash(password, 10);
  
  const rawDivId = division_id || department_id;
  const divId = rawDivId ? positiveId(rawDivId, 'division ID') : null;
  const division = divId ? await findDivisionById(divId) : null;
  if (divId && !division) throw validationError('Selected division was not found');
  const divName = division?.name || suppliedDivisionName;

  const schId = school_id && school_id !== '' ? Number(school_id) : null;
  const school = schId ? await findSchoolById(schId) : null;
  if (schId && !school) throw validationError('Selected school was not found');
  const schoolName = school?.name || rest.school || null;

  const { data, error } = await supabase
    .from('accounts')
    .insert([{
      ...rest,
      password_hash,
      role: INTERN_ROLE,
      division_id: divId,
      division_name: divName,
      school_id: schId,
      school: schoolName,
      self_face_enrollment_available: true,
    }])
    .select(INTERN_MUTATION_FIELDS)
    .single();

  if (error) throw error;
  return data;
}

export async function updateIntern(id, payload) {
  const normalizedId = positiveId(id, 'intern ID');
  assertAllowedFields(payload, ACCOUNT_INPUT_FIELDS, 'intern');
  const {
    password,
    division_id,
    department_id,
    school_id,
    role: _role,
    password_hash: _passwordHash,
    face_embedding: _faceEmbedding,
    face_photo: _facePhoto,
    face_registered: _faceRegistered,
    face_registered_at: _faceRegisteredAt,
    self_face_enrollment_available: _selfFaceEnrollmentAvailable,
    rendered_hours: _renderedHours,
    rendered_minutes: _renderedMinutes,
    id: _id,
    created_at: _createdAt,
    ...rest
  } = payload;
  if (rest.email !== undefined) rest.email = validateEmail(rest.email);
  if (rest.username !== undefined) {
    rest.username = String(rest.username).trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,50}$/.test(rest.username)) {
      throw validationError('Username must be 3-50 characters using letters, numbers, dots, underscores, or hyphens');
    }
  }
  if (rest.status !== undefined && !['active', 'inactive', 'archived'].includes(rest.status)) {
    throw validationError('Invalid intern status');
  }
  validateDateInput(rest.start_date, 'Start date');
  validateDateInput(rest.end_date, 'End date');
  if (rest.start_date && rest.end_date && rest.end_date < rest.start_date) {
    throw validationError('End date cannot be before start date');
  }
  if (rest.required_hours !== undefined && (!Number.isFinite(Number(rest.required_hours)) || Number(rest.required_hours) < 0 || Number(rest.required_hours) > 10000)) {
    throw validationError('Required hours must be between 0 and 10000');
  }
  if (password !== undefined && password !== '') validatePassword(password, 'Password');

  const suppliedDivisionName = rest.division_name || rest.department_name || null;
  delete rest.division_name;
  delete rest.department_name;
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

  // `department_id` is kept as a request alias for older clients, but the
  // current accounts schema uses division_id. Never send the legacy alias to
  // Supabase: in some deployed schemas it is a generated/read-only column.
  const rawDivisionId = division_id !== undefined ? division_id : department_id;
  if (rawDivisionId !== undefined) {
    const divisionId = rawDivisionId && rawDivisionId !== '' ? positiveId(rawDivisionId, 'division ID') : null;
    const division = divisionId ? await findDivisionById(divisionId) : null;
    if (divisionId && !division) throw validationError('Selected division was not found');
    updates.division_id = divisionId;
    updates.division_name = divisionId ? (division?.name || suppliedDivisionName) : null;
  }

  if (school_id !== undefined) {
    const schId = school_id && school_id !== '' ? positiveId(school_id, 'school ID') : null;
    const school = schId ? await findSchoolById(schId) : null;
    if (schId && !school) throw validationError('Selected school was not found');
    updates.school_id = schId;
    updates.school = school?.name || rest.school || null;
  }

  const { data, error } = await supabase
    .from('accounts')
    .update(updates)
    .eq('id', normalizedId)
    .eq('role', INTERN_ROLE)
    .select('id, username, full_name, first_name, middle_name, last_name, name_suffix, email, role, school, school_id, course, division_id, division_name, status, start_date, end_date, required_hours, rendered_hours, student_id, year_level, phone, home_address, emergency_name, emergency_relation, emergency_phone')
    .single();

  if (error) throw error;
  return data;
}

export async function updateInternUsername(id, username) {
  const normalizedUsername = typeof username === 'string' ? username.trim().toLowerCase() : '';
  if (!normalizedUsername) throw new Error('Username is required');
  if (normalizedUsername.length < 3 || normalizedUsername.length > 50) {
    throw new Error('Username must be between 3 and 50 characters');
  }
  if (!/^[a-z0-9._-]+$/.test(normalizedUsername)) {
    throw new Error('Username may contain only letters, numbers, dots, underscores, and hyphens');
  }

  const { data: existing, error: lookupError } = await supabase
    .from('accounts')
    .select('id')
    .eq('username', normalizedUsername)
    .neq('id', id)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) {
    const error = new Error('Username is already in use');
    error.statusCode = 409;
    throw error;
  }

  const { data, error } = await supabase
    .from('accounts')
    .update({ username: normalizedUsername })
    .eq('id', id)
    .eq('role', INTERN_ROLE)
    .select(INTERN_MUTATION_FIELDS)
    .single();

  if (error) {
    if (error.code === '23505') {
      const conflict = new Error('Username is already in use');
      conflict.statusCode = 409;
      throw conflict;
    }
    throw error;
  }
  return data;
}

export async function updateCurrentUserUsername(id, username) {
  const normalizedUsername = typeof username === 'string' ? username.trim().toLowerCase() : '';
  if (!normalizedUsername) throw new Error('Username is required');
  if (normalizedUsername.length < 3 || normalizedUsername.length > 50) {
    throw new Error('Username must be between 3 and 50 characters');
  }
  if (!/^[a-z0-9._-]+$/.test(normalizedUsername)) {
    throw new Error('Username may contain only letters, numbers, dots, underscores, and hyphens');
  }

  const { data: existing, error: lookupError } = await supabase
    .from('accounts')
    .select('id')
    .eq('username', normalizedUsername)
    .neq('id', id)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) {
    const error = new Error('Username is already in use');
    error.statusCode = 409;
    throw error;
  }

  const { data, error } = await supabase
    .from('accounts')
    .update({ username: normalizedUsername })
    .eq('id', id)
    .eq('role', 'superadmin')
    .select('id, username, full_name, email, role')
    .single();

  if (error) {
    if (error.code === '23505') {
      const conflict = new Error('Username is already in use');
      conflict.statusCode = 409;
      throw conflict;
    }
    throw error;
  }
  return data;
}

export async function deleteIntern(id) {
  const normalizedId = positiveId(id, 'intern ID');
  const { error } = await supabase
    .from('accounts')
    .delete()
    .eq('id', normalizedId)
    .eq('role', INTERN_ROLE);

  if (error) throw error;
  return { success: true };
}

export async function resetInternPassword(id, newPassword) {
  const normalizedId = positiveId(id, 'intern ID');
  validatePassword(newPassword, 'New password');
  const password_hash = await bcrypt.hash(newPassword, 10);
  const { error } = await supabase
    .from('accounts')
    .update({ password_hash })
    .eq('id', normalizedId)
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
      .select(`${baseFields}, face_registered, face_registered_at, self_face_enrollment_available`)
      .eq('id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    const [intern] = await hydrateDivisionNames(await addCalculatedRenderedHours([data]));
    if (intern) {
      try {
        intern.assigned_profile = await getAssignedProfileForAccount(intern.id);
      } catch {
        intern.assigned_profile = null;
      }
    }
    return intern;
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
    const [intern] = await hydrateDivisionNames(await addCalculatedRenderedHours([{
      ...data,
      face_registered: false,
      face_registered_at: null,
      self_face_enrollment_available: false,
    }]));
    if (intern) {
      try {
        intern.assigned_profile = await getAssignedProfileForAccount(intern.id);
      } catch {
        intern.assigned_profile = null;
      }
    }
    return intern;
  }
}

export async function updateCurrentUserProfile(userId, updates) {
  const payload = Object.fromEntries(
    Object.entries(updates || {}).filter(([key]) => SELF_PROFILE_EDITABLE_FIELDS.has(key))
  );
  if (Object.keys(payload).length === 0) {
    throw validationError('No editable profile fields were provided');
  }
  if (payload.email !== undefined) payload.email = validateEmail(payload.email);
  for (const field of ['phone', 'home_address', 'emergency_name', 'emergency_relation', 'emergency_phone']) {
    if (payload[field] !== undefined) payload[field] = normalizedOptionalText(payload[field], field.replaceAll('_', ' '), 500);
  }

  const baseFields = INTERN_LIST_FIELDS;
  try {
    const { data, error } = await supabase
      .from('accounts')
      .update(payload)
      .eq('id', userId)
      .eq('role', INTERN_ROLE)
      .select(baseFields)
      .single();

    if (error) throw error;
    const [intern] = await hydrateDivisionNames(await addCalculatedRenderedHours([data]));
    return intern;
  } catch (err) {
    const { data, error } = await supabase
      .from('accounts')
      .update(payload)
      .eq('id', userId)
      .eq('role', INTERN_ROLE)
      .select(INTERN_MUTATION_FIELDS)
      .single();

    if (error) throw error;
    const [intern] = await hydrateDivisionNames(await addCalculatedRenderedHours([{
      ...data,
      face_registered: false,
      face_registered_at: null,
      self_face_enrollment_available: false,
    }]));
    return intern;
  }
}

export async function changePassword(userId, currentPassword, newPassword) {
  if (typeof currentPassword !== 'string' || !currentPassword) throw validationError('Current password is required');
  validatePassword(newPassword, 'New password');
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
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 15));
  if (status && !['pending', 'approved', 'rejected'].includes(status)) throw validationError('Invalid attendance status');
  if (date) validateDateInput(date, 'Attendance date');
  let query = supabase
    .from('attendance_logs')
    .select('*, attendance_photos(photo)', { count: 'exact' })
    .or('remarks.is.null,remarks.not.like.OVERRIDE:%')
    .order('scan_time', { ascending: false });

  if (status) {
    query = query.eq('approval_status', status);
  }

  if (date) {
    const { startIso, endExclusiveIso } = getPhtDayBoundsUtc(date);
    query = query.gte('scan_time', startIso).lt('scan_time', endExclusiveIso);
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

  const from = (safePage - 1) * safeLimit;
  const to = from + safeLimit - 1;
  const { data, error, count } = await query.range(from, to);

  if (error) throw error;

  const internIds = [...new Set((data || []).map(log => log.intern_id).filter(Boolean))];
  let accountsMap = {};
  if (internIds.length > 0) {
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('id, full_name, division_id, division_name')
      .in('id', internIds);
    if (!accountsError && accounts) {
      const canonicalAccounts = await hydrateDivisionNames(accounts);
      accountsMap = canonicalAccounts.reduce((acc, accObj) => {
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

export async function removeRejectedAttendanceForRescan(attendanceId) {
  const { data: attendance, error: attendanceError } = await supabase
    .from('attendance_logs')
    .select('id, intern_id, scan_type, scan_time, approval_status')
    .eq('id', attendanceId)
    .single();

  if (attendanceError || !attendance) {
    const notFoundError = new Error('Attendance record not found');
    notFoundError.statusCode = 404;
    throw notFoundError;
  }

  if (attendance.approval_status !== 'rejected') {
    const stateError = new Error('Only rejected attendance records can be removed for rescanning');
    stateError.statusCode = 409;
    throw stateError;
  }

  const scanDate = new Date(attendance.scan_time);
  if (getPhtDateKey(scanDate) !== getPhtDateKey()) {
    const dateError = new Error("Only today's rejected attendance can be removed for rescanning");
    dateError.statusCode = 409;
    throw dateError;
  }

  const { startIso, endExclusiveIso } = getPhtDayBoundsUtc(scanDate);

  const { data: latest, error: latestError } = await supabase
    .from('attendance_logs')
    .select('id')
    .eq('intern_id', attendance.intern_id)
    .or('remarks.is.null,remarks.not.like.OVERRIDE:%')
    .gte('scan_time', startIso)
    .lt('scan_time', endExclusiveIso)
    .order('scan_time', { ascending: false })
    .limit(1)
    .single();

  if (latestError || Number(latest?.id) !== Number(attendance.id)) {
    const orderError = new Error("Only the intern's latest attendance entry can be removed for rescanning");
    orderError.statusCode = 409;
    throw orderError;
  }

  const { error: photoDeleteError } = await supabase
    .from('attendance_photos')
    .delete()
    .eq('attendance_log_id', attendance.id);

  if (photoDeleteError) throw photoDeleteError;

  const { data: removed, error: removeError } = await supabase
    .from('attendance_logs')
    .delete()
    .eq('id', attendance.id)
    .eq('approval_status', 'rejected')
    .select('id, intern_id, scan_type, scan_time')
    .single();

  if (removeError) throw removeError;
  return { removed };
}

export async function deleteAttendanceEntry(attendanceId) {
  const normalizedId = Number(attendanceId);
  if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
    const validationError = new Error('Invalid attendance entry');
    validationError.statusCode = 400;
    throw validationError;
  }

  const { data: attendance, error: attendanceError } = await supabase
    .from('attendance_logs')
    .select('id')
    .eq('id', normalizedId)
    .maybeSingle();

  if (attendanceError) throw attendanceError;
  if (!attendance) {
    const notFoundError = new Error('Attendance record not found');
    notFoundError.statusCode = 404;
    throw notFoundError;
  }

  const { error: photoDeleteError } = await supabase
    .from('attendance_photos')
    .delete()
    .eq('attendance_log_id', normalizedId);

  if (photoDeleteError) throw photoDeleteError;

  const { data: removed, error: removeError } = await supabase
    .from('attendance_logs')
    .delete()
    .eq('id', normalizedId)
    .select('id, intern_id, scan_type, scan_time, approval_status')
    .single();

  if (removeError) throw removeError;
  return { removed };
}

export async function getAdminDashboardStats() {
  const { startIso, endExclusiveIso } = getPhtDayBoundsUtc();

  const [internsRes, attendanceRes, pendingDocsRes, divisionsRes] = await Promise.all([
    supabase.from('accounts').select('id', { count: 'exact', head: false }).eq('role', INTERN_ROLE),
    supabase.from('attendance_logs').select('id, intern_id, scan_time, approval_status', { count: 'exact' })
      .or('remarks.is.null,remarks.not.like.OVERRIDE:%')
      .gte('scan_time', startIso)
      .lt('scan_time', endExclusiveIso),
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
    .or('remarks.is.null,remarks.not.like.OVERRIDE:%')
    .order('scan_time', { ascending: false })
    .limit(5);

  if (recentAttendanceError) throw recentAttendanceError;

  const internIds = [...new Set((recentAttendance || []).map(log => log.intern_id).filter(Boolean))];
  let accountsMap = {};
  if (internIds.length > 0) {
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('id, full_name, division_id, division_name')
      .in('id', internIds);
    if (!accountsError && accounts) {
      const canonicalAccounts = await hydrateDivisionNames(accounts);
      accountsMap = canonicalAccounts.reduce((acc, accObj) => {
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
  const divId = user?.division_id || user?.department_id;
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
    const { startIso, endExclusiveIso } = getPhtDayBoundsUtc();

    const { data: todayLogsData, error: todayLogsError } = await supabase
      .from('attendance_logs')
      .select('id, intern_id, scan_time, approval_status')
      .in('intern_id', departmentInternIds)
      .or('remarks.is.null,remarks.not.like.OVERRIDE:%')
      .gte('scan_time', startIso)
      .lt('scan_time', endExclusiveIso);
    
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
      .or('remarks.is.null,remarks.not.like.OVERRIDE:%')
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
      .or('remarks.is.null,remarks.not.like.OVERRIDE:%')
      .order('scan_time', { ascending: false })
      .limit(5);

    if (recentLogsError) throw recentLogsError;
    recentAttendance = recentLogs || [];
  }

  let accountsMap = {};
  if (departmentInternIds.length > 0) {
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('id, full_name, division_id, division_name')
      .in('id', departmentInternIds);
    if (!accountsError && accounts) {
      const canonicalAccounts = await hydrateDivisionNames(accounts);
      accountsMap = canonicalAccounts.reduce((acc, accObj) => {
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

  const { data: rawInterns, error: internsError } = await internQuery;
  if (internsError) throw internsError;
  const interns = await hydrateDivisionNames(rawInterns || []);

  const reportData = await Promise.all(
    interns.map(async (intern) => {
      const mNum = month ? Number(month) : undefined;
      const yNum = year ? Number(year) : undefined;

      const monthlyDtr = await getDtrRecords(intern.id, { month: mNum, year: yNum });
      const allTimeDtr = await getDtrRecords(intern.id, { allTime: true });
      const monthlySummary = summarizeDtrRecords(monthlyDtr);
      const cumulativeSummary = summarizeDtrRecords(allTimeDtr);

      return {
        id: intern.id,
        full_name: intern.full_name,
        school: intern.school,
        division_name: intern.division_name,
        department_name: intern.division_name,
        days_present: monthlySummary.days_present,
        total_minutes: monthlySummary.worked_minutes,
        approved_minutes: monthlySummary.approved_minutes,
        total_hours: monthlySummary.worked_hours,
        required_hours: Number(intern.required_hours || 0),
        rendered_minutes: cumulativeSummary.approved_minutes,
        rendered_hours: cumulativeSummary.approved_hours,
      };
    })
  );

  return reportData;
}

export async function getDtrRecords(userId, { month, year, limit = 31, allTime = false } = {}) {
  const buildQuery = (selectFields) => {
    let q = supabase
      .from('attendance_logs')
      .select(selectFields)
      .eq('intern_id', userId)
      .order('scan_time', { ascending: true });

    if (month !== undefined || year !== undefined) {
      const monthNumber = Number(month);
      const yearNumber = Number(year);
      if (
        !Number.isInteger(monthNumber)
        || monthNumber < 1
        || monthNumber > 12
        || !Number.isInteger(yearNumber)
      ) {
        const validationError = new Error('A valid DTR month and year are required');
        validationError.statusCode = 400;
        throw validationError;
      }

      const startKey = `${yearNumber}-${String(monthNumber).padStart(2, '0')}-01`;
      const nextMonth = new Date(Date.UTC(yearNumber, monthNumber, 1));
      const nextMonthKey = nextMonth.toISOString().slice(0, 10);
      const { startIso } = getPhtDayBoundsUtc(startKey);
      const { startIso: endExclusiveIso } = getPhtDayBoundsUtc(nextMonthKey);
      q = q.gte('scan_time', startIso).lt('scan_time', endExclusiveIso);
    } else if (!allTime) {
      const normalizedLimit = Math.max(1, Math.floor(Number(limit) || 31));
      const firstIncludedDay = new Date(Date.now() - (normalizedLimit - 1) * 24 * 60 * 60 * 1000);
      const { startIso } = getPhtDayBoundsUtc(firstIncludedDay);
      q = q.gte('scan_time', startIso);
    }
    return q;
  };

  let { data: logs, error } = await buildQuery('id, intern_id, scan_time, actual_scan_time, scan_type, approval_status, remarks');
  if (error) {
    const fallback = await buildQuery('id, intern_id, scan_time, scan_type, approval_status, remarks');
    if (fallback.error) throw fallback.error;
    logs = fallback.data;
  }
  return buildDtrRecords(logs || []);
}

export function getDtrSummary(records = []) {
  return summarizeDtrRecords(records);
}


export async function setDtrOverride(internId, { date, type, hours = 0, remarks = '' }) {
  if (!internId || !date || !type) {
    const validationError = new Error('Intern ID, date, and override type are required');
    validationError.statusCode = 400;
    throw validationError;
  }

  const formattedType = String(type).toUpperCase();
  const allowedTypes = new Set(['NONE', 'SUSPENDED', 'EXCUSED', 'HOURS', 'OTHERS']);
  if (!allowedTypes.has(formattedType)) {
    const validationError = new Error('Unsupported DTR override type');
    validationError.statusCode = 400;
    throw validationError;
  }

  try {
    getPhtDayBoundsUtc(date);
  } catch {
    const validationError = new Error('A valid override date is required');
    validationError.statusCode = 400;
    throw validationError;
  }

  const numericHours = Number(hours);
  if (
    (formattedType === 'HOURS' || formattedType === 'OTHERS')
    && (!Number.isFinite(numericHours) || numericHours < 0 || numericHours > 8)
  ) {
    const validationError = new Error('Custom credited hours must be between 0 and 8');
    validationError.statusCode = 400;
    throw validationError;
  }

  const creditedHours = formattedType === 'EXCUSED'
    ? 8
    : formattedType === 'SUSPENDED' || formattedType === 'NONE'
      ? 0
      : numericHours;
  const cleanRemarks = String(remarks || '').trim();
  const overrideRemark = `OVERRIDE:${formattedType}:${creditedHours}:${cleanRemarks}`;
  const scanTime = new Date(`${date}T08:00:00+08:00`).toISOString();

  const { data: intern, error: internError } = await supabase
    .from('accounts')
    .select('full_name')
    .eq('id', internId)
    .eq('role', INTERN_ROLE)
    .single();
  if (internError || !intern) {
    const notFoundError = new Error('Intern account not found');
    notFoundError.statusCode = 404;
    throw notFoundError;
  }
  const internName = intern.full_name || 'Intern';

  const { startIso, endExclusiveIso } = getPhtDayBoundsUtc(date);
  const { data: existingLogs, error: existingError } = await supabase
    .from('attendance_logs')
    .select('id, remarks')
    .eq('intern_id', internId)
    .gte('scan_time', startIso)
    .lt('scan_time', endExclusiveIso);
  if (existingError) throw existingError;

  const previousOverrideIds = (existingLogs || [])
    .filter(log => typeof log.remarks === 'string' && log.remarks.startsWith('OVERRIDE:'))
    .map(log => log.id);

  if (formattedType === 'NONE') {
    if (previousOverrideIds.length === 0) {
      return { cleared: true, removed_count: 0 };
    }
    const { error: removeError } = await supabase
      .from('attendance_logs')
      .delete()
      .in('id', previousOverrideIds);
    if (removeError) throw removeError;
    return { cleared: true, removed_count: previousOverrideIds.length };
  }

  const overridePayload = {
    intern_id: internId,
    intern_name: internName,
    scan_type: 'time_in',
    scan_time: scanTime,
    approval_status: 'approved',
    remarks: overrideRemark,
  };

  if (previousOverrideIds.length > 0) {
    const [primaryOverrideId, ...duplicateOverrideIds] = previousOverrideIds;
    const { data, error } = await supabase
      .from('attendance_logs')
      .update(overridePayload)
      .eq('id', primaryOverrideId)
      .select()
      .single();
    if (error) throw error;

    if (duplicateOverrideIds.length > 0) {
      const { error: removeDuplicateError } = await supabase
        .from('attendance_logs')
        .delete()
        .in('id', duplicateOverrideIds);
      if (removeDuplicateError) throw removeDuplicateError;
    }
    return data;
  }

  const { data, error } = await supabase
    .from('attendance_logs')
    .insert([overridePayload])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function setBulkDtrOverride({ internIds, date, type, hours = 0, remarks = '' }) {
  if (!Array.isArray(internIds) || !internIds.length || !date || !type) {
    const validationError = new Error('Intern IDs list, date, and override type are required');
    validationError.statusCode = 400;
    throw validationError;
  }

  const results = [];
  for (const internId of internIds) {
    const res = await setDtrOverride(internId, { date, type, hours, remarks });
    results.push(res);
  }
  return { success: true, count: results.length };
}

export async function ensureCalendarNotificationsForUser(userId) {
  if (!userId) return;
  try {
    const { data: markerData } = await supabase
      .from('notifications')
      .select('message, created_at')
      .eq('user_id', userId)
      .eq('title', '__CLEARED__')
      .order('created_at', { ascending: false })
      .limit(1);

    const clearedAt = markerData && markerData.length > 0
      ? new Date(markerData[0].message || markerData[0].created_at).getTime()
      : 0;

    const { data: events, error: eventsError } = await supabase
      .from('calendar_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (eventsError || !events || events.length === 0) return;

    const { data: existingNotifs, error: notifError } = await supabase
      .from('notifications')
      .select('title')
      .eq('user_id', userId);

    if (notifError) return;

    const existingTitles = new Set((existingNotifs || []).map((n) => n.title.toLowerCase().trim()));
    const newNotifs = [];

    for (const event of events) {
      const eventTime = new Date(event.created_at).getTime();
      if (clearedAt > 0 && eventTime <= clearedAt) {
        continue;
      }

      const typeLabel = event.event_type ? event.event_type.charAt(0).toUpperCase() + event.event_type.slice(1) : 'Announcement';
      const notifTitle = `New ${typeLabel}: ${event.title}`;
      const altTitle = `New ${event.event_type}: ${event.title}`;

      if (!existingTitles.has(notifTitle.toLowerCase().trim()) && !existingTitles.has(altTitle.toLowerCase().trim())) {
        const notifMessage = event.description
          ? `${event.description}${event.event_date ? ` (Date: ${event.event_date})` : ''}`
          : `A new ${event.event_type || 'announcement'} has been posted on the calendar for ${event.event_date}.`;

        newNotifs.push({
          user_id: userId,
          title: notifTitle,
          message: notifMessage,
          is_read: false,
          created_at: event.created_at || new Date().toISOString(),
        });
        existingTitles.add(notifTitle.toLowerCase().trim());
      }
    }

    if (newNotifs.length > 0) {
      await supabase.from('notifications').insert(newNotifs);
    }
  } catch (err) {
    console.error('Error ensuring calendar notifications for user:', err?.message || err);
  }
}

export async function getNotifications(userId, isAdmin) {
  if (!isAdmin && userId) {
    await ensureCalendarNotificationsForUser(userId);
  }

  let query = supabase
    .from('notifications')
    .select('*')
    .neq('title', '__CLEARED__')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  const { data, error } = await query;
  if (error) throw error;
  const notifications = data || [];
  const unread_count = notifications.filter((n) => !n.is_read).length;
  return { notifications, unread_count };
}

export async function markNotificationRead(notificationId, userId, isAdmin) {
  const query = supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', positiveId(notificationId, 'notification ID'))
    .eq('user_id', userId);
  const { error } = await query;
  if (error) throw error;
  return { success: true };
}

export async function markAllNotificationsRead(userId, isAdmin) {
  const query = supabase
    .from('notifications')
    .update({ is_read: true })
    .neq('title', '__CLEARED__')
    .eq('user_id', userId);
  const { error } = await query;
  if (error) throw error;
  return { success: true };
}

export async function clearNotifications(userId, isAdmin) {
  if (userId) {
    const { error: delError } = await supabase
      .from('notifications')
      .delete()
      .eq('user_id', userId);

    if (delError) throw delError;

    const { error: markerError } = await supabase.from('notifications').insert([{
      user_id: userId,
      title: '__CLEARED__',
      message: new Date().toISOString(),
      is_read: true,
      created_at: new Date().toISOString(),
    }]);
    if (markerError) throw markerError;

    return { success: true };
  }

  return { success: true };
}

export async function getEvaluations(
  userId,
  canViewAll,
  division_id = null,
  department_id = null,
  includeArchived = false,
  { page = 1, limit = 15 } = {},
) {
  let query = supabase
    .from('evaluations')
    .select('*', { count: 'exact' })
    .order('evaluation_date', { ascending: false });

  // Archived evaluations are restricted to the admin evaluation-management view.
  if (!canViewAll || !includeArchived) {
    query = query.is('archived_at', null);
  }

  if (!canViewAll) {
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
      return { evaluations: [], total: 0, page, limit };
    }
    query = query.in('intern_id', internIds);
  }

  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 15));
  const from = (safePage - 1) * safeLimit;
  const to = from + safeLimit - 1;
  const { data, error, count } = await query.range(from, to);
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

  return {
    evaluations: evaluations.map(e => ({
    ...e,
    full_name: accountsMap[e.intern_id]?.full_name || 'Unknown Intern'
    })),
    total: count || 0,
    page: safePage,
    limit: safeLimit,
  };
}

export async function createEvaluation(payload, evaluatorId, evaluatorName) {
  const fields = normalizeEvaluationFields(pickEvaluationFields(payload, EVALUATION_CREATE_FIELDS));
  const internId = Number(fields.intern_id);
  if (!Number.isInteger(internId) || internId <= 0) {
    const error = new Error('A valid intern is required');
    error.statusCode = 400;
    throw error;
  }

  const row = {
    ...fields,
    intern_id: internId,
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
  const updates = normalizeEvaluationFields(pickEvaluationFields(payload, EVALUATION_UPDATE_FIELDS));
  if (Object.keys(updates).length === 0) {
    const error = new Error('At least one editable evaluation field is required');
    error.statusCode = 400;
    throw error;
  }

  const { data, error } = await supabase
    .from('evaluations')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function setEvaluationArchived(id, archived, actorId, reason = '') {
  const updates = archived
    ? {
        archived_at: new Date().toISOString(),
        archived_by: actorId,
        archive_reason: String(reason || '').trim() || null,
      }
    : {
        archived_at: null,
        archived_by: null,
        archive_reason: null,
      };

  const { data, error } = await supabase
    .from('evaluations')
    .update(updates)
    .eq('id', normalizedId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteEvaluation(id) {
  const { data, error } = await supabase
    .from('evaluations')
    .delete()
    .eq('id', normalizedId)
    .select('id')
    .single();

  if (error) throw error;
  return data;
}

export async function getDocuments(
  userId,
  isAdmin,
  { status, search, division_id, department_id, intern_id, page = 1, limit = 15 } = {},
) {
  let query = supabase
    .from('documents')
    .select('*, account:accounts(full_name)', { count: 'exact' })
    .order('upload_date', { ascending: false });

  if (!isAdmin) {
    query = query.eq('intern_id', userId);
  } else if (intern_id) {
    query = query.eq('intern_id', Number(intern_id));
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

  if (status && status !== 'all') {
    if (!['pending', 'accepted', 'revision'].includes(status)) throw validationError('Invalid document status');
    query = query.eq('status', status);
  }

  if (search) {
    query = query.or(`original_name.ilike.%${search}%,document_type.ilike.%${search}%`);
  }

  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 15));
  const from = (safePage - 1) * safeLimit;
  const to = from + safeLimit - 1;
  const { data: documents, error, count } = await query.range(from, to);
  if (error) throw error;

  const mappedDocuments = await Promise.all((documents || []).map(async doc => {
    const { data: signedUrlData, error: signedUrlError } = await supabase
      .storage
      .from('documents')
      .createSignedUrl(doc.file_path, 15 * 60);

    if (signedUrlError) {
      console.warn(`Could not create signed document URL: ${signedUrlError.message}`);
    }
    return {
      ...doc,
      full_name: doc.account?.full_name || 'Unknown Intern',
      public_url: signedUrlData?.signedUrl || '',
      url_expires_in: 15 * 60,
    };
  }));

  return {
    documents: mappedDocuments,
    total: count || 0,
    page: safePage,
    limit: safeLimit,
  };
}

export async function updateDocumentStatus(id, status, adminRemarks) {
  const normalizedId = positiveId(id, 'document ID');
  if (!['pending', 'accepted', 'revision'].includes(status)) throw validationError('Invalid document status');
  const remarks = normalizedOptionalText(adminRemarks, 'Admin remarks', 2000) || '';
  const { data, error } = await supabase
    .from('documents')
    .update({ status, admin_remarks: remarks })
    .eq('id', normalizedId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function createDocument({ userId, file, document_type }) {
  const { originalName, extension } = validateUploadFile(file);
  if (!ALLOWED_DOCUMENT_TYPES.has(document_type)) {
    const validationError = new Error('Unsupported document type');
    validationError.statusCode = 400;
    throw validationError;
  }
  const { mimetype, size, buffer } = file;
  const newFileName = `${uuidv4()}.${extension}`;
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
      original_name: originalName,
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
  const normalizedId = positiveId(id, 'document ID');
  const { data: doc, error: findError } = await supabase
    .from('documents')
    .select('file_path, intern_id')
    .eq('id', normalizedId)
    .single();

  if (findError) throw findError;
  if (!isAdmin && doc.intern_id !== userId) throw new Error('Permission denied');

  const { error: storageError } = await supabase.storage.from('documents').remove([doc.file_path]);
  if (storageError) {
    console.warn(`Could not delete file from storage: ${storageError.message}`);
  }

  const { error } = await supabase.from('documents').delete().eq('id', normalizedId);
  if (error) throw error;
  return { success: true };
}

export async function getCalendarEvents({ year, month }) {
  const yearNumber = Number(year);
  const monthNumber = Number(month);
  if (!Number.isInteger(yearNumber) || yearNumber < 2000 || yearNumber > 2100 || !Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
    throw validationError('A valid calendar year and month are required');
  }

  const pad = (n) => String(n).padStart(2, '0');
  const startStr = `${yearNumber}-${pad(monthNumber)}-01`;
  const lastDay = new Date(Date.UTC(yearNumber, monthNumber, 0)).getUTCDate();
  const endStr = `${yearNumber}-${pad(monthNumber)}-${pad(lastDay)}`;

  const { data, error } = await supabase
    .from('calendar_events')
    .select(`*, creator:accounts(full_name)`)
    .gte('event_date', startStr)
    .lte('event_date', endStr)
    .order('event_date', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function assertCalendarEventMutationAccess(eventId, user) {
  const normalizedId = Number(eventId);
  if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
    const validationError = new Error('Valid calendar event ID is required');
    validationError.statusCode = 400;
    throw validationError;
  }

  const { data: event, error } = await supabase
    .from('calendar_events')
    .select('id, created_by')
    .eq('id', normalizedId)
    .single();

  if (error || !event) {
    const notFoundError = new Error('Calendar event not found');
    notFoundError.statusCode = 404;
    throw notFoundError;
  }

  if (user?.role === 'supervisor' && Number(event.created_by) !== Number(user.id)) {
    const permissionError = new Error('Supervisors may only manage calendar events they created');
    permissionError.statusCode = 403;
    throw permissionError;
  }

  return event;
}

export async function broadcastCalendarEventNotification(event) {
  if (!event) return;
  try {
    const { data: interns, error: internsError } = await supabase
      .from('accounts')
      .select('id')
      .eq('role', INTERN_ROLE)
      .eq('status', 'active');

    if (internsError) throw internsError;
    if (!interns || interns.length === 0) return;

    const typeLabel = event.event_type ? event.event_type.charAt(0).toUpperCase() + event.event_type.slice(1) : 'Announcement';
    const notifTitle = `New ${typeLabel}: ${event.title}`;
    const notifMessage = event.description
      ? `${event.description}${event.event_date ? ` (Date: ${event.event_date})` : ''}`
      : `A new ${event.event_type || 'announcement'} has been posted on the calendar for ${event.event_date}.`;

    const notifications = interns.map((intern) => ({
      user_id: intern.id,
      title: notifTitle,
      message: notifMessage,
      is_read: false,
      created_at: new Date().toISOString(),
    }));

    const { error: notificationError } = await supabase.from('notifications').insert(notifications);
    if (notificationError) throw notificationError;
  } catch (err) {
    console.error('Failed to create notifications for calendar event:', err?.message || err);
  }
}

export async function createCalendarEvent(payload, userId) {
  const allowedTypes = new Set(['holiday', 'announcement', 'memo', 'suspension']);
  const title = String(payload?.title || '').trim();
  const eventDate = String(payload?.event_date || '').trim();
  const eventType = String(payload?.event_type || '').trim();
  if (!title || !eventDate || !allowedTypes.has(eventType)) {
    const validationError = new Error('Title, valid event date, and event type are required');
    validationError.statusCode = 400;
    throw validationError;
  }
  validateDateInput(eventDate, 'Event date');

  const eventRow = {
    title,
    description: String(payload.description || '').trim(),
    event_date: eventDate,
    event_type: eventType,
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
    await broadcastCalendarEventNotification(event);
  }

  return event;
}

export async function updateCalendarEvent(id, payload) {
  const allowedTypes = new Set(['holiday', 'announcement', 'memo', 'suspension']);
  const updates = {};
  if (payload?.title !== undefined) updates.title = String(payload.title || '').trim();
  if (payload?.description !== undefined) updates.description = String(payload.description || '').trim();
  if (payload?.event_date !== undefined) updates.event_date = String(payload.event_date || '').trim();
  if (payload?.event_type !== undefined) updates.event_type = String(payload.event_type || '').trim();

  if (updates.title === '' || updates.event_date === '' || (updates.event_type && !allowedTypes.has(updates.event_type))) {
    const validationError = new Error('Calendar event fields are invalid');
    validationError.statusCode = 400;
    throw validationError;
  }
  if (updates.event_date !== undefined) validateDateInput(updates.event_date, 'Event date');
  if (Object.keys(updates).length === 0) {
    const validationError = new Error('At least one calendar event field is required');
    validationError.statusCode = 400;
    throw validationError;
  }

  const { data, error } = await supabase
    .from('calendar_events')
    .update(updates)
    .eq('id', positiveId(id, 'calendar event ID'))
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCalendarEvent(id) {
  const normalizedId = positiveId(id, 'calendar event ID');
  const { error } = await supabase
    .from('calendar_events')
    .delete()
    .eq('id', normalizedId);

  if (error) throw error;
  return { success: true };
}

export async function getSupervisors({ search, page = 1, limit = 10, division_id, department_id } = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 10));
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

  const from = (safePage - 1) * safeLimit;
  const to = from + safeLimit - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;
  return { supervisors: data || [], total: count || 0 };
}

export async function getAdminAccounts() {
  const { data, error } = await supabase
    .from('accounts')
    .select('id, username, full_name, email, phone, status, role, created_at')
    .eq('role', ADMIN_ROLE)
    .order('full_name', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function createAdminAccount(payload = {}) {
  const {
    username,
    password,
    full_name,
    email,
    phone = null,
    status = 'active',
  } = payload;

  if (!username?.trim() || !password || !full_name?.trim() || !email?.trim()) {
    const validationError = new Error('Username, password, full name, and email are required');
    validationError.statusCode = 400;
    throw validationError;
  }
  const normalizedUsername = username.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,50}$/.test(normalizedUsername)) {
    throw validationError('Username must be 3-50 characters using letters, numbers, dots, underscores, or hyphens');
  }
  validatePassword(password);
  const normalizedEmail = validateEmail(email);
  if (!['active', 'inactive', 'archived'].includes(status)) throw validationError('Invalid account status');

  const password_hash = await bcrypt.hash(password, 10);
  const { data, error } = await supabase
    .from('accounts')
    .insert([{
      username: normalizedUsername,
      password_hash,
      full_name: full_name.trim(),
      email: normalizedEmail,
      phone: phone?.trim() || null,
      status,
      role: ADMIN_ROLE,
    }])
    .select('id, username, full_name, email, phone, status, role, created_at')
    .single();

  if (error) throw error;
  return data;
}

export async function getSupervisorById(id) {
  const normalizedId = positiveId(id, 'supervisor ID');
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', normalizedId)
    .eq('role', 'supervisor')
    .single();

  if (error) throw error;
  return data;
}

export async function createSupervisor(payload) {
  assertAllowedFields(payload, ACCOUNT_INPUT_FIELDS, 'supervisor');
  const { password, division_id, department_id, role: _role, id: _id, created_at: _createdAt, password_hash: _passwordHash, ...rest } = payload;
  if (!rest.full_name?.trim() && !(rest.first_name?.trim() && rest.last_name?.trim())) {
    throw validationError('Full name is required');
  }
  rest.username = String(rest.username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,50}$/.test(rest.username)) {
    throw validationError('Username must be 3-50 characters using letters, numbers, dots, underscores, or hyphens');
  }
  rest.email = validateEmail(rest.email);
  if (rest.first_name || rest.last_name) {
    rest.full_name = [rest.first_name, rest.middle_name, rest.last_name, rest.name_suffix].filter(Boolean).join(' ');
  }
  validatePassword(password, 'Initial password');

  const password_hash = await bcrypt.hash(password, 10);
  const rawDivId = division_id || department_id;
  const divId = rawDivId && rawDivId !== '' ? positiveId(rawDivId, 'division ID') : null;
  const division = divId ? await findDivisionById(divId) : null;
  if (divId && !division) throw validationError('Selected division was not found');
  const divName = division?.name || rest.division_name || rest.department_name || null;
  delete rest.division_name;
  delete rest.department_name;

  const { data, error } = await supabase
    .from('accounts')
    .insert([{ ...rest, password_hash, role: 'supervisor', division_id: divId, division_name: divName }])
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function updateSupervisor(id, payload) {
  const normalizedId = positiveId(id, 'supervisor ID');
  assertAllowedFields(payload, ACCOUNT_INPUT_FIELDS, 'supervisor');
  const { password, division_id, department_id, role: _role, id: _id, created_at: _createdAt, password_hash: _passwordHash, ...rest } = payload;
  if (rest.email !== undefined) rest.email = validateEmail(rest.email);
  if (rest.username !== undefined) {
    rest.username = String(rest.username).trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,50}$/.test(rest.username)) {
      throw validationError('Username must be 3-50 characters using letters, numbers, dots, underscores, or hyphens');
    }
  }
  if (rest.first_name || rest.last_name) {
    rest.full_name = [rest.first_name, rest.middle_name, rest.last_name, rest.name_suffix].filter(Boolean).join(' ');
  }
  const suppliedDivisionName = rest.division_name || rest.department_name || null;
  delete rest.division_name;
  delete rest.department_name;
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

  if (password !== undefined && password !== '') {
    validatePassword(password, 'Password');
    updates.password_hash = await bcrypt.hash(password, 10);
  }

  const rawDivId = division_id !== undefined ? division_id : department_id;
  if (rawDivId !== undefined) {
    const divId = rawDivId && rawDivId !== '' ? positiveId(rawDivId, 'division ID') : null;
    const division = divId ? await findDivisionById(divId) : null;
    if (divId && !division) throw validationError('Selected division was not found');
    updates.division_name = divId ? (division?.name || suppliedDivisionName) : null;
    updates.division_id = divId;
  }

  const { data, error } = await supabase
    .from('accounts')
    .update(updates)
    .eq('id', normalizedId)
    .eq('role', 'supervisor')
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function deleteSupervisor(id) {
  const normalizedId = positiveId(id, 'supervisor ID');
  const { error } = await supabase
    .from('accounts')
    .delete()
    .eq('id', normalizedId)
    .eq('role', 'supervisor');

  if (error) throw error;
  return { success: true };
}

export async function resetSupervisorPassword(id, newPassword) {
  const normalizedId = positiveId(id, 'supervisor ID');
  validatePassword(newPassword, 'New password');
  const password_hash = await bcrypt.hash(newPassword, 10);
  const { error } = await supabase
    .from('accounts')
    .update({ password_hash })
    .eq('id', normalizedId)
    .eq('role', 'supervisor');

  if (error) throw error;
  return { success: true };
}

export async function bulkMarkHoliday({ date, holiday_name }) {
  if (!date) {
    const validationError = new Error('Holiday date is required');
    validationError.statusCode = 400;
    throw validationError;
  }

  const finalRemarks = holiday_name ? `Holiday: ${holiday_name}` : 'Holiday';

  const { data: interns, error: internError } = await supabase
    .from('accounts')
    .select('id, full_name')
    .eq('role', INTERN_ROLE)
    .eq('status', 'active');

  if (internError) throw internError;
  if (!interns || interns.length === 0) return { count: 0 };
  return setBulkDtrOverride({
    internIds: interns.map(intern => intern.id),
    date,
    type: 'suspended',
    hours: 0,
    remarks: finalRemarks,
  });
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
  const allowedFields = new Set([
    'title', 'description', 'group_name', 'division_id', 'status', 'progress',
    'leader_id', 'members', 'github_repo', 'demo_url'
  ]);
  const updates = {
    ...Object.fromEntries(Object.entries(payload || {}).filter(([key]) => allowedFields.has(key))),
    updated_at: new Date().toISOString()
  };
  if (updates.progress !== undefined) {
    updates.progress = Math.min(100, Math.max(0, Number(updates.progress)));
  }

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
  const { originalName, extension } = validateUploadFile(file);
  const { mimetype, size, buffer } = file;
  const newFileName = `${uuidv4()}.${extension}`;
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
      original_name: originalName,
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
      .select('id, full_name, division_name, division_id, role, status')
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

