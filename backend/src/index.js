import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { loginUser } from './auth.js';
import { getActiveQrCode, regenerateQrCode, scanAttendance, getTodayScanStatus } from './attendance.js';
import { authMiddleware, adminMiddleware, adminOnlyMiddleware } from './middleware.js';
import {
  getAdminDashboardStats,
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
  deleteIntern,
  resetInternPassword,
  changePassword,
  getAttendanceLogs,
  setAttendanceApproval,
  getAttendanceReport,
  getDtrRecords,
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
  getSupervisorById,
  createSupervisor,
  updateSupervisor,
  deleteSupervisor,
  resetSupervisorPassword,
  getSchools,
  createSchool,
  updateSchool,
  deleteSchool,
} from './data.js';

const app = express();
const port = process.env.PORT || 3000;
const host = process.env.HOST || '0.0.0.0';

// Use memoryStorage for multer to pass file buffer to Supabase Storage
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.use(cors());
app.use(express.json());

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
    return res.json(result);
  } catch (error) {
    return res.status(401).json({ error: error.message });
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

app.get('/auth/me', authMiddleware, async (req, res) => {
  try {
    const profile = await getCurrentUserProfile(req.user.id);
    return res.json({ user: profile });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/admin/dashboard-stats', authMiddleware, adminMiddleware, async (req, res) => {
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
    let departmentId = undefined;
    if (req.user.role === 'supervisor') {
      const profile = await getCurrentUserProfile(req.user.id);
      departmentId = profile.department_id || -1;
    }
    const logs = await getAttendanceLogs({
      status: req.query.status,
      date: req.query.date,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 15,
      department_id: departmentId
    });
    return res.json(logs);
  } catch (error) {
    return res.status(500).json({ error: error.message });
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
    const attendance = await setAttendanceApproval(Number(id), status, remarks);
    return res.json({ success: true, attendance });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/departments', authMiddleware, async (req, res) => {
  try {
    const departments = await getDepartments();
    return res.json({ departments });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/departments', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const department = await createDepartment(req.body);
    return res.json({ department });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/departments/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const department = await updateDepartment(Number(req.params.id), req.body);
    return res.json({ department });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/departments/:id', authMiddleware, adminMiddleware, async (req, res) => {
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

app.post('/schools', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const school = await createSchool(req.body);
    return res.json({ school });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/schools/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const school = await updateSchool(Number(req.params.id), req.body);
    return res.json({ school });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/schools/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await deleteSchool(Number(req.params.id));
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/admin/reports/attendance', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    let departmentId = req.query.department_id ? Number(req.query.department_id) : undefined;
    if (req.user.role === 'supervisor') {
      const profile = await getCurrentUserProfile(req.user.id);
      departmentId = profile.department_id || -1;
    }
    const report = await getAttendanceReport({
      month: Number(req.query.month),
      year: Number(req.query.year),
      department_id: departmentId
    });
    return res.json({ report });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/interns', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    let departmentId = req.query.department_id ? Number(req.query.department_id) : undefined;
    if (req.user.role === 'supervisor') {
      const profile = await getCurrentUserProfile(req.user.id);
      departmentId = profile.department_id || -1;
    }
    const result = await getInterns({
      search: req.query.search,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 10,
      department_id: departmentId,
      school_id: req.query.school_id ? Number(req.query.school_id) : undefined
    });
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/interns/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const intern = await getInternById(Number(req.params.id));
    return res.json({ intern });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/interns/me/profile', authMiddleware, async (req, res) => {
  try {
    const intern = await getCurrentUserProfile(req.user.id);
    return res.json({ intern });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/interns/me/profile', authMiddleware, async (req, res) => {
  try {
    const intern = await updateCurrentUserProfile(req.user.id, req.body);
    return res.json({ intern });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/interns', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const intern = await createIntern(req.body);
    return res.json({ intern });
  } catch (error) {
    console.error('Error creating intern:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.put('/interns/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const intern = await updateIntern(Number(req.params.id), req.body);
    return res.json({ intern });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/interns/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await deleteIntern(Number(req.params.id));
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/interns/:id/reset-password', authMiddleware, adminMiddleware, async (req, res) => {
  const { new_password } = req.body;
  if (!new_password) {
    return res.status(400).json({ error: 'New password is required' });
  }

  try {
    const result = await resetInternPassword(Number(req.params.id), new_password);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/supervisors', authMiddleware, adminOnlyMiddleware, async (req, res) => {
  try {
    const result = await getSupervisors({
      search: req.query.search,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 10,
      department_id: req.query.department_id ? Number(req.query.department_id) : undefined
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
    const records = await getDtrRecords(req.user.id, {
      month: req.query.month ? Number(req.query.month) : undefined,
      year: req.query.year ? Number(req.query.year) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : 31,
    });
    return res.json({ records });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/admin/dtr/:internId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const records = await getDtrRecords(Number(req.params.internId), {
      month: req.query.month ? Number(req.query.month) : undefined,
      year: req.query.year ? Number(req.query.year) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : 31,
    });
    return res.json({ records });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/admin/dtr/:internId/override', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await setDtrOverride(Number(req.params.internId), req.body);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/admin/dtr/bulk-override', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await setBulkDtrOverride(req.body);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/notifications', authMiddleware, async (req, res) => {
  try {
    const notifications = await getNotifications(req.user.id, req.user.role === 'admin' || req.user.role === 'supervisor');
    return res.json(notifications);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.patch('/notifications/:id/read', authMiddleware, async (req, res) => {
  try {
    const result = await markNotificationRead(Number(req.params.id), req.user.id, req.user.role === 'admin' || req.user.role === 'supervisor');
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.patch('/notifications/read-all', authMiddleware, async (req, res) => {
  try {
    const result = await markAllNotificationsRead(req.user.id, req.user.role === 'admin' || req.user.role === 'supervisor');
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/evaluations', authMiddleware, async (req, res) => {
  try {
    let departmentId = undefined;
    if (req.user.role === 'supervisor') {
      const profile = await getCurrentUserProfile(req.user.id);
      departmentId = profile.department_id || -1;
    }
    const evaluations = await getEvaluations(req.user.id, req.user.role === 'admin' || req.user.role === 'supervisor', departmentId);
    return res.json({ evaluations });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/evaluations', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const evaluation = await createEvaluation(req.body, req.user.id, req.user.full_name || req.user.username);
    return res.json({ evaluation });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/evaluations/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const evaluation = await updateEvaluation(Number(req.params.id), req.body);
    return res.json({ evaluation });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/documents', authMiddleware, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin' || req.user.role === 'supervisor';
    let departmentId = undefined;
    if (req.user.role === 'supervisor') {
      const profile = await getCurrentUserProfile(req.user.id);
      departmentId = profile.department_id || -1;
    }
    const options = {
      status: req.query.status,
      search: req.query.search,
      department_id: departmentId,
    };
    const documents = await getDocuments(req.user.id, isAdmin, options);
    return res.json({ documents });
  } catch (error) {
    return res.status(500).json({ error: error.message });
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
    const document = await updateDocumentStatus(Number(req.params.id), status, admin_remarks || '');
    return res.json({ document });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/documents/:id', authMiddleware, async (req, res) => {
  try {
    const result = await deleteDocument(Number(req.params.id), req.user.id, req.user.role === 'admin' || req.user.role === 'supervisor');
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
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
  if (!['admin', 'supervisor'].includes(req.user.role)) {
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
  if (!['admin', 'supervisor'].includes(req.user.role)) {
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
  if (!['admin', 'supervisor'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Permission denied' });
  }
  try {
    const result = await deleteCalendarEvent(Number(req.params.id));
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/attendance/qr-code', authMiddleware, async (req, res) => {
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

app.post('/attendance/scan', authMiddleware, async (req, res) => {
  const { qr_code } = req.body;
  if (!qr_code) {
    return res.status(400).json({ error: 'QR code is required' });
  }

  try {
    const scanResult = await scanAttendance({ qr_code, user: req.user });
    return res.json(scanResult);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'PNP ITMS backend is running' });
});

app.listen(port, host, () => {
  console.log(`Backend listening on port ${port} at host ${host}.`);
  console.log(`To access on your local network, use http://<your-local-ip>:${port}`);
});
