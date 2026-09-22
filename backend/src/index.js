import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { loginUser } from './auth.js';
import { getActiveQrCode, regenerateQrCode, scanAttendance, getTodayScanStatus } from './attendance.js';
import { registerUserFace } from './services/faceVerificationService.js';
import {
  createRenewalRequest,
  getInternFaceWorkflow,
  getRenewalRequestsForStaff,
  reviewRenewalRequest,
  setRenewalRequestDismissed,
  dismissResolvedRenewalRequests,
  getEnrollmentHistoryForStaff,
  validateEnrollmentReason
} from './services/faceEnrollmentWorkflowService.js';
import { authMiddleware, adminMiddleware, adminOnlyMiddleware, superadminMiddleware } from './middleware.js';
import {
  listAttendanceProfiles,
  createAttendanceProfile,
  updateAttendanceProfile,
  toggleAttendanceProfileStatus,
  getAccountsWithProfiles,
  assignProfileToAccounts,
  removeAccountProfileAssignment,
  editDtrRecord,
  getDtrEditHistory,
} from './services/attendanceControlService.js';
import {
  getAdminDashboardStats,
  getDivisions,
  createDivision,
  updateDivision,
  deleteDivision,
  getDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  getInterns,
  getInternById,
  getCurrentUserProfile,
  updateCurrentUserProfile,
  createIntern,
  updateIntern,
  updateInternUsername,
  updateCurrentUserUsername,
  deleteIntern,
  resetInternPassword,
  changePassword,
  getAttendanceLogs,
  setAttendanceApproval,
  removeRejectedAttendanceForRescan,
  deleteAttendanceEntry,
  getAttendanceReport,
  getDtrRecords,
  getDtrSummary,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getEvaluations,
  createEvaluation,
  updateEvaluation,
  getDocuments,
  createDocument,
  updateDocumentStatus,
  deleteDocument,
  getCalendarEvents,
  createCalendarEvent,
  getSupervisorDashboardStats,
  updateCalendarEvent,
  deleteCalendarEvent,
  getSupervisors,
  getAdminAccounts,
  createAdminAccount,
  getSupervisorById,
  createSupervisor,
  updateSupervisor,
  deleteSupervisor,
  resetSupervisorPassword,
  getSchools,
  createSchool,
  updateSchool,
  deleteSchool,
  setDtrOverride,
  setBulkDtrOverride
} from './data.js';
import { getPhtDayBoundsUtc } from './utils/attendanceTime.js';
import {
  getProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  uploadProjectFile,
  deleteProjectFile,
  getProjectDirectoryStats,
  getProjectMemberList,
  setProjectArchived,
  getProjectAudit,
} from './services/projectService.js';
import { sendWelcomeEmail } from './mailer.js';
import { supabase } from './supabaseClient.js';
import {
  acceptLegalDocuments,
  getActiveLegalDocuments,
  getLegalAcceptanceSummary,
  getLegalAcceptanceStatus,
} from './services/legalService.js';
import {
  assertSupervisorCanAccessIntern,
  assertSupervisorCanAccessInterns,
  assertSupervisorCanAccessResource,
  getCurrentSupervisorDivisionId,
  authorizeProjectCreation,
  assertCanUpdateProject,
  assertCanDeleteProject,
  assertCanArchiveProject,
  assertCanRestoreProject,
  assertCanUploadProjectFile,
  assertCanDeleteProjectFile,
  getVerifiedProjectAccess,
  sanitizeProjectUpdatePayload
} from './authorization.js';

const app = express();
const port = process.env.PORT || 3000;
const host = process.env.HOST || '0.0.0.0';

// Use memoryStorage for multer to pass file buffer to Supabase Storage
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const SELF_PROFILE_FIELDS = new Set([
  'email',
  'phone',
  'home_address',
  'emergency_name',
  'emergency_relation',
  'emergency_phone',
]);

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.use((req, res, next) => {
  if (req.url.startsWith('/api')) {
    req.url = req.url.replace(/^\/api/, '');
  }
  next();
});

app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const result = await loginUser(username, password);
    result.legal_status = await getLegalAcceptanceStatus(result.user.id);
    return res.json(result);
  } catch (error) {
    if (error.retryAfterSeconds) {
      res.set('Retry-After', String(error.retryAfterSeconds));
    }
    return res.status(error.statusCode || 401).json({
      error: error.message,
      code: error.code || 'LOGIN_FAILED',
      ...(error.retryAfterSeconds
        ? { retry_after_seconds: error.retryAfterSeconds }
        : {})
    });
  }
});

app.post('/auth/change-password', authMiddleware, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Both current and new password are required' });
  }

  try {
    await changePassword(req.user.id, current_password, new_password);
    return res.json({ success: true });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.patch('/auth/username', authMiddleware, superadminMiddleware, async (req, res) => {
  try {
    const user = await updateCurrentUserUsername(req.user.id, req.body?.username);
    return res.json({ user });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ error: error.message });
  }
});

app.get('/auth/me', authMiddleware, async (req, res) => {
  try {
    const profile = await getCurrentUserProfile(req.user?.id);
    if (!profile) {
      return res.status(401).json({ error: 'User account not found' });
    }
    const legal_status = await getLegalAcceptanceStatus(req.user.id);
    return res.json({ user: profile, legal_status });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/legal/documents/active', async (req, res) => {
  try {
    const documents = await getActiveLegalDocuments();
    return res.json({ documents });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/legal/acceptance-status', authMiddleware, async (req, res) => {
  try {
    const status = await getLegalAcceptanceStatus(req.user.id);
    return res.json(status);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/legal/accept', authMiddleware, async (req, res) => {
  try {
    const acceptances = await acceptLegalDocuments(req.user.id, req.body?.acceptances, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    return res.json({ success: true, acceptances });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.get('/admin/legal/acceptance-status', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const accounts = await getLegalAcceptanceSummary();
    return res.json({ accounts });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/admin/dashboard-stats', authMiddleware, adminOnlyMiddleware, async (req, res) => {
  try {
    const stats = await getAdminDashboardStats();
    return res.json(stats);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/supervisor/dashboard-stats', authMiddleware, async (req, res) => {
  if (req.user.role !== 'supervisor') return res.status(403).json({ error: 'Permission denied' });
  try {
    const userProfile = await getCurrentUserProfile(req.user.id);
    const stats = await getSupervisorDashboardStats(userProfile);
    return res.json(stats);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/attendance/logs', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    let divId = req.query.division_id || req.query.department_id ? Number(req.query.division_id || req.query.department_id) : undefined;
    if (req.user.role === 'supervisor') {
      divId = await getCurrentSupervisorDivisionId(req.user);
    }
    const logs = await getAttendanceLogs({ status: req.query.status, date: req.query.date, page: Number(req.query.page) || 1, limit: Number(req.query.limit) || 15, division_id: divId });
    return res.json(logs);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.patch('/attendance/:id/:action', authMiddleware, adminMiddleware, async (req, res) => {
  const { id, action } = req.params;
  const remarks = req.body.remarks || '';
  const status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : null;

  if (!status) {
    return res.status(400).json({ error: 'Invalid action' });
  }

  try {
    await assertSupervisorCanAccessResource(
      req.user,
      'attendance_logs',
      id,
      'attendance records'
    );
    const attendance = await setAttendanceApproval(Number(id), status, remarks);
    return res.json({ success: true, attendance });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.get('/divisions', authMiddleware, async (req, res) => {
  try {
    const divisions = await getDivisions();
    return res.json({ divisions, departments: divisions });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/divisions', authMiddleware, adminOnlyMiddleware, async (req, res) => {
  try {
    const division = await createDivision(req.body);
    return res.json({ division, department: division });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/divisions/:id', authMiddleware, adminOnlyMiddleware, async (req, res) => {
  try {
    const division = await updateDivision(Number(req.params.id), req.body);
    return res.json({ division, department: division });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/divisions/:id', authMiddleware, adminOnlyMiddleware, async (req, res) => {
  try {
    const result = await deleteDivision(Number(req.params.id));
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/departments', authMiddleware, async (req, res) => {
  try {
    const departments = await getDepartments();
    return res.json({ departments, divisions: departments });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/departments', authMiddleware, adminOnlyMiddleware, async (req, res) => {
  try {
    const department = await createDepartment(req.body);
    return res.json({ department, division: department });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/departments/:id', authMiddleware, adminOnlyMiddleware, async (req, res) => {
  try {
    const department = await updateDepartment(Number(req.params.id), req.body);
    return res.json({ department, division: department });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/departments/:id', authMiddleware, adminOnlyMiddleware, async (req, res) => {
  try {
    const result = await deleteDepartment(Number(req.params.id));
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/schools', authMiddleware, async (req, res) => {
  try {
    const schools = await getSchools();
    return res.json({ schools });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/schools', authMiddleware, adminOnlyMiddleware, async (req, res) => {
  try {
    const school = await createSchool(req.body);
    return res.json({ school });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/schools/:id', authMiddleware, adminOnlyMiddleware, async (req, res) => {
  try {
    const school = await updateSchool(Number(req.params.id), req.body);
    return res.json({ school });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/schools/:id', authMiddleware, adminOnlyMiddleware, async (req, res) => {
  try {
    const result = await deleteSchool(Number(req.params.id));
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/admin/reports/attendance', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    let divId = req.query.division_id || req.query.department_id ? Number(req.query.division_id || req.query.department_id) : undefined;
    if (req.user.role === 'supervisor') {
      divId = await getCurrentSupervisorDivisionId(req.user);
    }
    const report = await getAttendanceReport({ month: Number(req.query.month), year: Number(req.query.year), division_id: divId });
    return res.json({ report });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.get('/interns', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    let divId = req.query.division_id || req.query.department_id ? Number(req.query.division_id || req.query.department_id) : undefined;
    
    // Enforce division exclusivity for supervisors
    if (req.user.role === 'supervisor') {
      divId = await getCurrentSupervisorDivisionId(req.user);
    }

    const result = await getInterns({
      search: req.query.search,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 10,
      division_id: divId,
      status: req.query.status,
      school_id: req.query.school_id ? Number(req.query.school_id) : undefined
    });
    return res.json(result);
  } catch (error) {
    console.error('Error in GET /interns:', error);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.get('/interns/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const internId = Number(req.params.id);
    await assertSupervisorCanAccessIntern(req.user, internId, 'intern profiles');
    const intern = await getInternById(internId);
    return res.json({ intern });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.get('/interns/me/profile', authMiddleware, async (req, res) => {
  if (req.user.role !== 'intern') {
    return res.status(403).json({ error: 'Intern access required' });
  }
  try {
    const intern = await getCurrentUserProfile(req.user.id);
    return res.json({ intern });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/interns/me/profile', authMiddleware, async (req, res) => {
  if (req.user.role !== 'intern') {
    return res.status(403).json({ error: 'Intern access required' });
  }
  const suppliedFields = Object.keys(req.body || {});
  const forbiddenFields = suppliedFields.filter(field => !SELF_PROFILE_FIELDS.has(field));
  if (forbiddenFields.length > 0) {
    return res.status(400).json({ error: `Profile fields cannot be changed: ${forbiddenFields.join(', ')}` });
  }
  try {
    const intern = await updateCurrentUserProfile(req.user.id, req.body);
    return res.json({ intern });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/interns', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    let internPayload = req.body;
    if (req.user.role === 'supervisor') {
      const supervisorDivisionId = await getCurrentSupervisorDivisionId(req.user);
      internPayload = {
        ...req.body,
        division_id: supervisorDivisionId,
      };
      delete internPayload.division_name;
      delete internPayload.department_id;
      delete internPayload.department_name;
    }
    const intern = await createIntern(internPayload);
    
    // Send welcome email asynchronously
    if (intern.email) {
      const name = intern.first_name ? `${intern.first_name} ${intern.last_name}` : intern.full_name;
      sendWelcomeEmail(intern.email, name, intern.username, internPayload.password);
    }
    
    return res.json({ intern });
  } catch (error) {
    console.error('Error creating intern:', error);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.put('/interns/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const internId = Number(req.params.id);
    if (req.user.role === 'supervisor') {
      await assertSupervisorCanAccessIntern(req.user, internId, 'intern records');
      req.body = { ...req.body };
      delete req.body.division_id;
      delete req.body.division_name;
      delete req.body.department_id;
      delete req.body.department_name;
    }
    const intern = await updateIntern(internId, req.body);
    return res.json({ intern });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.patch('/interns/:id/username', authMiddleware, adminOnlyMiddleware, async (req, res) => {
  try {
    const internId = Number(req.params.id);
    if (!Number.isInteger(internId) || internId <= 0) {
      return res.status(400).json({ error: 'Invalid intern ID' });
    }
    const intern = await updateInternUsername(internId, req.body?.username);
    return res.json({ intern });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ error: error.message });
  }
});

app.delete('/interns/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const internId = Number(req.params.id);
    await assertSupervisorCanAccessIntern(req.user, internId, 'intern records');
    const result = await deleteIntern(internId);
    return res.json(result);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.post('/interns/:id/reset-password', authMiddleware, adminMiddleware, async (req, res) => {
  const { new_password } = req.body;
  if (!new_password) {
    return res.status(400).json({ error: 'New password is required' });
  }

  try {
    const internId = Number(req.params.id);
    await assertSupervisorCanAccessIntern(req.user, internId, 'intern passwords');
    const result = await resetInternPassword(internId, new_password);
    return res.json(result);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.get('/supervisors', authMiddleware, adminOnlyMiddleware, async (req, res) => {
  try {
    const rawDivId = req.query.division_id || req.query.department_id;
    const result = await getSupervisors({
      search: req.query.search,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 10,
      division_id: rawDivId ? Number(rawDivId) : undefined
    });
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/supervisors/:id', authMiddleware, adminOnlyMiddleware, async (req, res) => {
  try {
    const supervisor = await getSupervisorById(Number(req.params.id));
    return res.json({ supervisor });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/supervisors', authMiddleware, adminOnlyMiddleware, async (req, res) => {
  try {
    const supervisor = await createSupervisor(req.body);
    return res.json({ supervisor });
  } catch (error) {
    console.error('Error creating supervisor:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.get('/admin/accounts', authMiddleware, superadminMiddleware, async (req, res) => {
  try {
    const accounts = await getAdminAccounts();
    return res.json({ accounts });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.post('/admin/accounts', authMiddleware, superadminMiddleware, async (req, res) => {
  try {
    const account = await createAdminAccount(req.body);
    return res.status(201).json({ account });
  } catch (error) {
    console.error('Error creating admin account:', error);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.put('/supervisors/:id', authMiddleware, adminOnlyMiddleware, async (req, res) => {
  try {
    const supervisor = await updateSupervisor(Number(req.params.id), req.body);
    return res.json({ supervisor });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/supervisors/:id', authMiddleware, adminOnlyMiddleware, async (req, res) => {
  try {
    const result = await deleteSupervisor(Number(req.params.id));
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/supervisors/:id/reset-password', authMiddleware, adminOnlyMiddleware, async (req, res) => {
  const { new_password } = req.body;
  if (!new_password) {
    return res.status(400).json({ error: 'New password is required' });
  }

  try {
    const result = await resetSupervisorPassword(Number(req.params.id), new_password);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/dtr', authMiddleware, async (req, res) => {
  try {
    const rawRecords = await getDtrRecords(req.user.id, {
      month: req.query.month ? Number(req.query.month) : undefined,
      year: req.query.year ? Number(req.query.year) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : 31,
    });
    // Regular users never receive actual scan times or audit details
    const records = (rawRecords || []).map(({ actual_time_in, actual_time_out, ...rec }) => rec);
    return res.json({ records, summary: getDtrSummary(records) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.get('/admin/dtr/:internId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const internId = Number(req.params.internId);
    await assertSupervisorCanAccessIntern(req.user, internId, 'DTR records');
    const { month, year } = req.query;
    const mNum = month ? Number(month) : undefined;
    const yNum = year ? Number(year) : undefined;

    const rawDtr = await getDtrRecords(internId, { month: mNum, year: yNum });
    const isSuperadmin = req.user?.role === 'superadmin';
    // Only superadmin can see actual scan times
    const dtr = isSuperadmin
      ? rawDtr
      : (rawDtr || []).map(({ actual_time_in, actual_time_out, ...rec }) => rec);

    return res.json({ records: dtr, summary: getDtrSummary(dtr) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// Manual DTR override routes - available to Admin and Superadmin
app.post('/admin/dtr/:internId/override', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const internId = Number(req.params.internId);
    await assertSupervisorCanAccessIntern(req.user, internId, 'DTR records');
    const result = await setDtrOverride(internId, req.body);
    return res.json(result);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.post('/admin/dtr/bulk-override', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    let internIds = Array.isArray(req.body?.internIds)
      ? req.body.internIds.map(Number).filter(Number.isInteger)
      : [];

    if (internIds.length === 0) {
      let internQuery = supabase
        .from('accounts')
        .select('id')
        .eq('role', 'intern')
        .neq('status', 'archived');
      if (req.user.role === 'supervisor') {
        const divisionId = await getCurrentSupervisorDivisionId(req.user);
        internQuery = internQuery.eq('division_id', divisionId);
      }
      const { data: interns, error: internsError } = await internQuery;
      if (internsError) throw internsError;
      internIds = (interns || []).map(intern => Number(intern.id));
    }

    if (internIds.length === 0) {
      return res.status(400).json({ error: 'No active interns are available for this override' });
    }

    await assertSupervisorCanAccessInterns(req.user, internIds, 'DTR records');
    const result = await setBulkDtrOverride({ ...req.body, internIds });
    return res.json(result);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────
// SUPERADMIN-ONLY: DTR MANUAL EDITING & AUDIT HISTORY
// ─────────────────────────────────────────────────────────────

app.put('/admin/dtr/:internId/edit', authMiddleware, superadminMiddleware, async (req, res) => {
  try {
    const internId = Number(req.params.internId);
    const result = await editDtrRecord({
      internId,
      date: req.body.date,
      new_date: req.body.new_date,
      time_in: req.body.time_in,
      time_out: req.body.time_out,
      status: req.body.status,
      reason: req.body.reason,
      modified_by: req.user.id,
    });
    return res.json(result);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.get('/admin/dtr/:internId/history', authMiddleware, superadminMiddleware, async (req, res) => {
  try {
    const internId = Number(req.params.internId);
    const history = await getDtrEditHistory({
      internId,
      date: req.query.date,
      limit: req.query.limit ? Number(req.query.limit) : 100,
    });
    return res.json({ history });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.get('/admin/dtr-history', authMiddleware, superadminMiddleware, async (req, res) => {
  try {
    const history = await getDtrEditHistory({
      limit: req.query.limit ? Number(req.query.limit) : 100,
    });
    return res.json({ history });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────
// SUPERADMIN-ONLY: ATTENDANCE CONTROL & PARAMETERS
// ─────────────────────────────────────────────────────────────

app.get('/admin/attendance-control/profiles', authMiddleware, superadminMiddleware, async (req, res) => {
  try {
    const profiles = await listAttendanceProfiles();
    return res.json({ profiles });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.post('/admin/attendance-control/profiles', authMiddleware, superadminMiddleware, async (req, res) => {
  try {
    const profile = await createAttendanceProfile(req.body);
    return res.json({ profile });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.put('/admin/attendance-control/profiles/:id', authMiddleware, superadminMiddleware, async (req, res) => {
  try {
    const profile = await updateAttendanceProfile(Number(req.params.id), req.body);
    return res.json({ profile });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.patch('/admin/attendance-control/profiles/:id/status', authMiddleware, superadminMiddleware, async (req, res) => {
  try {
    const profile = await toggleAttendanceProfileStatus(Number(req.params.id), req.body.status);
    return res.json({ profile });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.get('/admin/attendance-control/accounts', authMiddleware, superadminMiddleware, async (req, res) => {
  try {
    const accounts = await getAccountsWithProfiles();
    return res.json({ accounts });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.post('/admin/attendance-control/assignments', authMiddleware, superadminMiddleware, async (req, res) => {
  try {
    const { account_ids, attendance_profile_id } = req.body;
    const assignments = await assignProfileToAccounts({
      account_ids,
      attendance_profile_id,
      assigned_by: req.user.id,
    });
    return res.json({ success: true, assignments });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.delete('/admin/attendance-control/assignments/:accountId', authMiddleware, superadminMiddleware, async (req, res) => {
  try {
    const result = await removeAccountProfileAssignment(Number(req.params.accountId));
    return res.json(result);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.get('/notifications', authMiddleware, async (req, res) => {
  try {
    const isStaff = ['admin', 'supervisor', 'superadmin'].includes(req.user.role);
    const notifications = await getNotifications(req.user.id, isStaff);
    return res.json(notifications);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.patch('/notifications/:id/read', authMiddleware, async (req, res) => {
  try {
    const isStaff = ['admin', 'supervisor', 'superadmin'].includes(req.user.role);
    const result = await markNotificationRead(Number(req.params.id), req.user.id, isStaff);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.patch('/notifications/read-all', authMiddleware, async (req, res) => {
  try {
    const isStaff = ['admin', 'supervisor', 'superadmin'].includes(req.user.role);
    const result = await markAllNotificationsRead(req.user.id, isStaff);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/evaluations', authMiddleware, async (req, res) => {
  try {
    let divId = undefined;
    if (req.user.role === 'supervisor') {
      divId = await getCurrentSupervisorDivisionId(req.user);
    }
    const isStaff = ['admin', 'supervisor', 'superadmin'].includes(req.user.role);
    const evaluations = await getEvaluations(req.user.id, isStaff, divId);
    return res.json({ evaluations });
  } catch (error) {
    console.error('Error in GET /evaluations:', error);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.post('/evaluations', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await assertSupervisorCanAccessIntern(req.user, req.body?.intern_id, 'intern evaluations');
    const evaluation = await createEvaluation(req.body, req.user.id, req.user.full_name || req.user.username);
    return res.json({ evaluation });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.put('/evaluations/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const evaluationId = Number(req.params.id);
    await assertSupervisorCanAccessResource(
      req.user,
      'evaluations',
      evaluationId,
      'intern evaluations'
    );
    if (req.body?.intern_id !== undefined) {
      await assertSupervisorCanAccessIntern(req.user, req.body.intern_id, 'intern evaluations');
    }
    const evaluation = await updateEvaluation(evaluationId, req.body);
    return res.json({ evaluation });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.get('/documents', authMiddleware, async (req, res) => {
  try {
    const isAdmin = ['admin', 'supervisor', 'superadmin'].includes(req.user.role);
    let divId = undefined;
    if (req.user.role === 'supervisor') {
      divId = await getCurrentSupervisorDivisionId(req.user);
    }
    const options = {
      status: req.query.status,
      search: req.query.search,
      division_id: divId,
    };
    const documents = await getDocuments(req.user.id, isAdmin, options);
    return res.json({ documents });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.post('/documents/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    const document = await createDocument({ userId: req.user.id, file: req.file, document_type: req.body.document_type });
    return res.json({ document });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.patch('/documents/:id/status', authMiddleware, adminMiddleware, async (req, res) => {
  const { status, admin_remarks } = req.body;
  if (!status) {
    return res.status(400).json({ error: 'Status is required' });
  }

  try {
    const documentId = Number(req.params.id);
    await assertSupervisorCanAccessResource(
      req.user,
      'documents',
      documentId,
      'intern documents'
    );
    const document = await updateDocumentStatus(documentId, status, admin_remarks || '');
    return res.json({ document });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.delete('/documents/:id', authMiddleware, async (req, res) => {
  try {
    const documentId = Number(req.params.id);
    await assertSupervisorCanAccessResource(
      req.user,
      'documents',
      documentId,
      'intern documents'
    );
    const isStaff = ['admin', 'supervisor', 'superadmin'].includes(req.user.role);
    const result = await deleteDocument(documentId, req.user.id, isStaff);
    return res.json(result);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.get('/calendar-events', authMiddleware, async (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) {
    return res.status(400).json({ error: 'Year and month query parameters are required' });
  }
  try {
    const events = await getCalendarEvents({ year: Number(year), month: Number(month) });
    return res.json({ events });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/calendar-events', authMiddleware, async (req, res) => {
  if (!['admin', 'supervisor', 'superadmin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Permission denied' });
  }
  try {
    const event = await createCalendarEvent(req.body, req.user.id);
    return res.status(201).json({ event });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/calendar-events/:id', authMiddleware, async (req, res) => {
  if (!['admin', 'supervisor', 'superadmin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Permission denied' });
  }
  try {
    const event = await updateCalendarEvent(Number(req.params.id), req.body);
    return res.json({ event });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/calendar-events/:id', authMiddleware, async (req, res) => {
  if (!['admin', 'supervisor', 'superadmin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Permission denied' });
  }
  try {
    const result = await deleteCalendarEvent(Number(req.params.id));
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/attendance/qr-code', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const qrCode = await getActiveQrCode();
    return res.json({ qr: qrCode });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/attendance/qr-code/regenerate', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const qrCode = await regenerateQrCode();
    return res.json({ qr: qrCode });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/attendance/next-scan', authMiddleware, async (req, res) => {
  try {
    const status = await getTodayScanStatus(req.user?.id);
    return res.json(status);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/attendance/validate-qr', authMiddleware, async (req, res) => {
  const { qr_code } = req.body;
  if (!qr_code) {
    return res.status(400).json({ error: 'QR code is required' });
  }

  try {
    const now = new Date().toISOString();
    const { data: qrData, error: qrError } = await supabase
      .from('qr_codes')
      .select('id, is_active, expires_at')
      .eq('qr_code', qr_code)
      .eq('is_active', true)
      .gt('expires_at', now)
      .single();

    if (qrError || !qrData) {
      return res.status(400).json({ error: 'Invalid or expired QR code' });
    }

    const { startIso, endExclusiveIso } = getPhtDayBoundsUtc();

    const { data: todayLogs } = await supabase
      .from('attendance_logs')
      .select('id, remarks')
      .eq('intern_id', req.user.id)
      .gte('scan_time', startIso)
      .lt('scan_time', endExclusiveIso);

    const attendanceLogs = (todayLogs || []).filter(
      log => typeof log.remarks !== 'string' || !log.remarks.startsWith('OVERRIDE:')
    );
    if (attendanceLogs.length >= 2) {
      return res.status(400).json({ error: 'You have already completed 2 attendance scans (Time In - Time Out) today. Please try again tomorrow.' });
    }

    return res.json({ success: true, message: 'QR scan is good! Proceed to take your selfie.' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/interns/register-face', authMiddleware, async (req, res) => {
  if (req.user.role !== 'intern') {
    return res.status(403).json({ error: 'Intern access required' });
  }

  try {
    const { data: intern, error: internError } = await supabase
      .from('accounts')
      .select('id, status, face_registered, self_face_enrollment_available')
      .eq('id', req.user.id)
      .eq('role', 'intern')
      .single();

    if (internError || !intern) {
      return res.status(404).json({ error: 'Intern account not found' });
    }
    if (intern.status !== 'active') {
      return res.status(403).json({ error: 'Only active intern accounts may enroll Face ID' });
    }
    if (intern.face_registered || !intern.self_face_enrollment_available) {
      return res.status(409).json({
        error: 'The one-time self-enrollment option is no longer available for this account'
      });
    }

    const data = await registerUserFace(
      req.user.id,
      req.body.face_embedding,
      req.body.photo,
      {
        actorId: req.user.id,
        reason: 'One-time self enrollment for a fresh intern account',
      }
    );

    return res.json({
      success: true,
      message: 'Face ID registered successfully. Your one-time enrollment is complete.',
      user: data,
    });
  } catch (error) {
    console.error('Error in one-time intern face enrollment:', error);
    return res.status(error.statusCode || 400).json({ error: error.message });
  }
});

app.delete('/attendance/:id/rescan', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const attendanceId = Number(req.params.id);
    await assertSupervisorCanAccessResource(
      req.user,
      'attendance_logs',
      attendanceId,
      'attendance records'
    );
    const result = await removeRejectedAttendanceForRescan(attendanceId);
    return res.json({
      success: true,
      message: 'Rejected attendance removed. The intern can scan again.',
      ...result,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.delete('/attendance/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const attendanceId = Number(req.params.id);
    await assertSupervisorCanAccessResource(
      req.user,
      'attendance_logs',
      attendanceId,
      'attendance records'
    );
    const result = await deleteAttendanceEntry(attendanceId);
    return res.json({
      success: true,
      message: 'Attendance entry permanently deleted.',
      ...result,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.get('/interns/me/face-enrollment', authMiddleware, async (req, res) => {
  if (req.user.role !== 'intern') {
    return res.status(403).json({ error: 'Intern access required' });
  }
  try {
    const workflow = await getInternFaceWorkflow(req.user.id);
    return res.json(workflow);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.post('/interns/me/face-renewal-requests', authMiddleware, async (req, res) => {
  if (req.user.role !== 'intern') {
    return res.status(403).json({ error: 'Intern access required' });
  }
  try {
    const request = await createRenewalRequest(req.user.id, req.body.reason);
    return res.status(201).json({
      success: true,
      message: 'Face ID renewal request submitted for review',
      request
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ error: error.message });
  }
});

app.post('/interns/me/renew-face', authMiddleware, async (req, res) => {
  if (req.user.role !== 'intern') {
    return res.status(403).json({ error: 'Intern access required' });
  }

  const requestId = Number(req.body.request_id);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return res.status(400).json({ error: 'A valid approved renewal request is required' });
  }

  try {
    const { data: request, error: requestError } = await supabase
      .from('face_renewal_requests')
      .select('id, intern_id, reason, status')
      .eq('id', requestId)
      .eq('intern_id', req.user.id)
      .eq('status', 'approved')
      .single();

    if (requestError || !request) {
      return res.status(403).json({ error: 'This renewal approval is invalid or has already been used' });
    }

    const data = await registerUserFace(req.user.id, req.body.face_embedding, req.body.photo, {
      actorId: req.user.id,
      reason: request.reason,
      requestId: request.id,
    });
    return res.json({
      success: true,
      message: 'Face ID renewed successfully',
      user: data
    });
  } catch (error) {
    console.error('Error in approved face renewal:', error);
    return res.status(error.statusCode || 400).json({ error: error.message });
  }
});

app.get('/face-renewal-requests', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const requests = await getRenewalRequestsForStaff(req.user, {
      status: req.query.status || 'all',
      includeDismissed: req.query.include_dismissed === 'true',
    });
    return res.json({ requests });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ error: error.message });
  }
});

app.patch('/face-renewal-requests/clear-resolved', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const cleared = await dismissResolvedRenewalRequests(req.user);
    return res.json({
      success: true,
      message: cleared === 1 ? '1 resolved request cleared' : `${cleared} resolved requests cleared`,
      cleared,
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ error: error.message });
  }
});

app.patch('/face-renewal-requests/:id/visibility', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    if (typeof req.body.dismissed !== 'boolean') {
      return res.status(400).json({ error: 'dismissed must be true or false' });
    }
    const request = await setRenewalRequestDismissed(req.params.id, req.body.dismissed, req.user);
    return res.json({
      success: true,
      message: req.body.dismissed ? 'Renewal request cleared' : 'Renewal request restored',
      request,
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ error: error.message });
  }
});

app.patch('/face-renewal-requests/:id/review', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const request = await reviewRenewalRequest(
      req.params.id,
      req.body.action,
      req.body.remarks,
      req.user
    );
    return res.json({
      success: true,
      message: `Renewal request ${request.status}`,
      request
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ error: error.message });
  }
});

app.get('/face-enrollment-history', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const history = await getEnrollmentHistoryForStaff(req.user, req.query.intern_id || null);
    return res.json({ history });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ error: error.message });
  }
});

app.post('/interns/:id/register-face', authMiddleware, adminMiddleware, async (req, res) => {
  const { face_embedding, photo } = req.body;

  try {
    const internId = Number(req.params.id);
    if (!Number.isInteger(internId) || internId <= 0) {
      return res.status(400).json({ error: 'Valid intern ID is required' });
    }

    await assertSupervisorCanAccessIntern(req.user, internId, 'face enrollment');

    const { data: intern, error: internError } = await supabase
      .from('accounts')
      .select('id, division_id, face_registered')
      .eq('id', internId)
      .eq('role', 'intern')
      .single();
    if (internError || !intern) {
      return res.status(404).json({ error: 'Intern account not found' });
    }

    const reason = intern.face_registered
      ? validateEnrollmentReason(req.body.renewal_reason)
      : String(req.body.renewal_reason || 'Initial biometric face enrollment').trim();
    const data = await registerUserFace(internId, face_embedding, photo, {
      actorId: req.user.id,
      reason,
    });
    return res.json({
      success: true,
      message: intern.face_registered
        ? 'Intern face profile renewed successfully'
        : 'Intern face profile registered successfully',
      user: data
    });
  } catch (error) {
    console.error('Error in authorized face enrollment:', error);
    return res.status(error.statusCode || 400).json({ error: error.message });
  }
});

app.post('/attendance/scan', authMiddleware, async (req, res) => {
  const { qr_code, photo, face_embedding } = req.body;
  if (!qr_code) {
    return res.status(400).json({ error: 'QR code is required' });
  }

  try {
    const scanResult = await scanAttendance({ qr_code, user: req.user, photo, face_embedding });
    return res.json(scanResult);
  } catch (error) {
    if (error.retryAfterSeconds) {
      res.set('Retry-After', String(error.retryAfterSeconds));
    }
    return res.status(error.statusCode || 400).json({
      verified: false,
      error: error.message,
      code: error.code || 'SCAN_FAILED',
      ...(error.retryAfterSeconds
        ? { retry_after_seconds: error.retryAfterSeconds }
        : {})
    });
  }
});

/* ==========================================================================
   INTERN PROJECT TRACKING & DIRECTORY ENDPOINTS
   ========================================================================== */

app.get('/projects/members', authMiddleware, async (req, res) => {
  try {
    const members = await getProjectMemberList(req.user, req.query.division_id);
    return res.json(members);
  } catch (error) {
    console.error('Error in GET /projects/members:', error);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.get('/projects/stats', authMiddleware, async (req, res) => {
  try {
    const stats = await getProjectDirectoryStats({
      division_id: req.query.division_id,
      include_archived: req.query.include_archived,
    }, req.user);
    return res.json(stats);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/projects', authMiddleware, async (req, res) => {
  try {
    const { search, status, division_id, group_name, include_archived } = req.query;
    const projects = await getProjects({
      search,
      status,
      division_id,
      group_name,
      include_archived,
    }, req.user);
    return res.json(projects);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/projects/:id', authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(404).json({ error: 'Invalid project ID' });
    }
    const project = await getProjectById(id, req.user);
    return res.json(project);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.post('/projects', authMiddleware, async (req, res) => {
  try {
    const creation = await authorizeProjectCreation(req.user, req.body);
    const project = await createProject(req.body, creation);
    return res.status(201).json(project);
  } catch (error) {
    return res.status(error.statusCode || 400).json({ error: error.message });
  }
});

app.put('/projects/:id', authMiddleware, async (req, res) => {
  try {
    const projectId = Number(req.params.id);
    const access = await assertCanUpdateProject(req.user, projectId);
    const updates = sanitizeProjectUpdatePayload(req.body, access);
    const project = await updateProject(projectId, updates, access);
    return res.json(project);
  } catch (error) {
    return res.status(error.statusCode || 400).json({ error: error.message });
  }
});

app.delete('/projects/:id', authMiddleware, async (req, res) => {
  try {
    const access = await assertCanDeleteProject(req.user, Number(req.params.id));
    const result = await deleteProject(Number(req.params.id), access);
    return res.json(result);
  } catch (error) {
    return res.status(error.statusCode || 400).json({ error: error.message });
  }
});

app.post('/projects/:id/files', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    const access = await assertCanUploadProjectFile(req.user, Number(req.params.id));
    const file = await uploadProjectFile({
      projectId: Number(req.params.id),
      userId: req.user.id,
      uploaderName: req.user.full_name,
      file: req.file,
      fileCategory: req.body.file_category,
      access,
    });
    return res.status(201).json(file);
  } catch (error) {
    return res.status(error.statusCode || 400).json({ error: error.message });
  }
});

app.delete('/projects/:id/files/:fileId', authMiddleware, async (req, res) => {
  try {
    const access = await assertCanDeleteProjectFile(req.user, Number(req.params.id), Number(req.params.fileId));
    const result = await deleteProjectFile(Number(req.params.fileId), access);
    return res.json(result);
  } catch (error) {
    return res.status(error.statusCode || 400).json({ error: error.message });
  }
});

app.patch('/projects/:id/archive', authMiddleware, async (req, res) => {
  try {
    const access = await assertCanArchiveProject(req.user, Number(req.params.id));
    const project = await setProjectArchived(
      Number(req.params.id),
      true,
      access,
      req.body.reason || ''
    );
    return res.json({ success: true, message: 'Project archived', project });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ error: error.message });
  }
});

app.patch('/projects/:id/restore', authMiddleware, async (req, res) => {
  try {
    const access = await assertCanRestoreProject(req.user, Number(req.params.id));
    const project = await setProjectArchived(Number(req.params.id), false, access);
    return res.json({ success: true, message: 'Project restored', project });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ error: error.message });
  }
});

app.get('/projects/:id/audit', authMiddleware, async (req, res) => {
  try {
    const access = await getVerifiedProjectAccess(req.user, Number(req.params.id));
    const history = await getProjectAudit(Number(req.params.id), access);
    return res.json({ history });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ error: error.message });
  }
});

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'PNP ITMS backend is running' });
});

// Health endpoint — responds immediately to avoid cron job timeouts during cold starts.
// Supabase connectivity is verified in the background after the response is sent.
app.get('/ping', (req, res) => {
  const checkedAt = new Date().toISOString();

  // Respond right away so the cron job doesn't time out while Render wakes up.
  res.json({
    status: 'ok',
    backend: 'ok',
    database: 'checking',
    checked_at: checkedAt,
  });

  // Fire-and-forget: keep Supabase connection warm without blocking the response.
  supabase
    .from('accounts')
    .select('id')
    .limit(1)
    .then(({ error }) => {
      if (error) {
        console.error('Supabase keep-alive check failed:', error?.message || error);
      }
    });
});

app.listen(port, host, () => {
  console.log(`Backend listening on port ${port} at host ${host}.`);
  console.log(`To access on your local network, use http://<your-local-ip>:${port}`);
});
