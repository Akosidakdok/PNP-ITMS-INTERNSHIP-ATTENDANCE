const express = require('express');
const router = express.Router();
const { run, get, all } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roles');

router.get('/dashboard-stats', authenticateToken, requireAdmin, async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const [ti, present, pending, approved, depts, pendingDocs, evalCount] = await Promise.all([
    get("SELECT COUNT(*) as c FROM interns WHERE status='active'", []),
    get(`SELECT COUNT(DISTINCT intern_id) as c FROM attendance_logs WHERE DATE(scan_time)=? AND scan_type='time_in' AND scan_status='valid'`, [today]),
    get("SELECT COUNT(*) as c FROM attendance_logs WHERE approval_status='pending' AND scan_status='valid'", []),
    get(`SELECT COUNT(*) as c FROM attendance_logs WHERE DATE(scan_time)=? AND approval_status='approved'`, [today]),
    get('SELECT COUNT(*) as c FROM departments', []),
    get("SELECT COUNT(*) as c FROM uploaded_documents WHERE status='pending'", []),
    get('SELECT COUNT(*) as c FROM performance_evaluations', []),
  ]);

  const stats = {
    total_interns: ti?.c || 0, present_today: present?.c || 0, pending_attendance: pending?.c || 0,
    approved_today: approved?.c || 0, total_departments: depts?.c || 0, pending_documents: pendingDocs?.c || 0, total_evaluations: evalCount?.c || 0,
  };

  const recentAttendance = await all(`SELECT a.*, i.full_name, d.name as department_name FROM attendance_logs a JOIN interns i ON i.id=a.intern_id LEFT JOIN departments d ON d.id=i.department_id WHERE a.scan_status='valid' ORDER BY a.scan_time DESC LIMIT 10`, []);
  const recentDocuments = await all(`SELECT d.*, i.full_name FROM uploaded_documents d JOIN interns i ON i.id=d.intern_id ORDER BY d.upload_date DESC LIMIT 5`, []);

  res.json({ stats, recentAttendance, recentDocuments });
});

router.get('/audit-logs', authenticateToken, requireAdmin, async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  const logs = await all('SELECT a.*, u.username FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT ? OFFSET ?', [limit, offset]);
  const total = await get('SELECT COUNT(*) as cnt FROM audit_logs', []);
  res.json({ logs, total: total?.cnt || 0 });
});

router.get('/reports/attendance', authenticateToken, requireAdmin, async (req, res) => {
  const { month, year, department_id } = req.query;
  let where = "WHERE i.status='active'"; const params = [];
  if (month) { where += " AND strftime('%m', a.scan_time) = ?"; params.push(String(month).padStart(2, '0')); }
  if (year) { where += " AND strftime('%Y', a.scan_time) = ?"; params.push(String(year)); }
  if (department_id) { where += ' AND i.department_id = ?'; params.push(department_id); }
  const report = await all(`SELECT i.full_name, i.school, d.name as department_name, COUNT(DISTINCT CASE WHEN a.scan_type='time_in' THEN DATE(a.scan_time) END) as days_present, COALESCE(SUM(dt.total_hours),0) as total_hours, i.required_hours, i.rendered_hours FROM interns i LEFT JOIN attendance_logs a ON a.intern_id=i.id AND a.scan_status='valid' LEFT JOIN dtr_records dt ON dt.intern_id=i.id LEFT JOIN departments d ON d.id=i.department_id ${where} GROUP BY i.id ORDER BY i.full_name`, params);
  res.json({ report });
});

module.exports = router;
