const express = require('express');
const router = express.Router();
const { run, get, all } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roles');
const { v4: uuidv4 } = require('uuid');

const DUPLICATE_WINDOW_MINUTES = parseInt(process.env.DUPLICATE_WINDOW_MINUTES || '5');

router.post('/scan', authenticateToken, async (req, res) => {
  const { qr_code } = req.body;
  if (!qr_code) return res.status(400).json({ error: 'QR code data is required' });
  try {
    const validQR = await get('SELECT * FROM office_qr WHERE qr_code = ? AND is_active = 1', [qr_code]);
    if (!validQR) return res.status(400).json({ error: 'Invalid QR code. Please scan the official PNP-ITMS office QR.', scan_status: 'invalid' });

    const intern = await get('SELECT * FROM interns WHERE user_id = ?', [req.user.id]);
    if (!intern) return res.status(403).json({ error: 'No intern profile found' });
    if (intern.status !== 'active') return res.status(403).json({ error: 'Your internship is not active' });

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const scanTime = now.toISOString();
    const windowAgo = new Date(now.getTime() - DUPLICATE_WINDOW_MINUTES * 60 * 1000).toISOString();

    // Enforce a 10-second cooldown between any scans
    const cooldownAgo = new Date(now.getTime() - 10 * 1000).toISOString();
    const recentAnyScan = await get('SELECT id FROM attendance_logs WHERE intern_id = ? AND scan_time > ? AND scan_status = "valid" LIMIT 1', [intern.id, cooldownAgo]);
    if (recentAnyScan) {
      return res.status(429).json({ error: 'Please wait 10 seconds between scans.' });
    }

    const todayTimeIn = await get(`SELECT * FROM attendance_logs WHERE intern_id = ? AND DATE(scan_time) = ? AND scan_type = 'time_in' AND scan_status = 'valid' ORDER BY scan_time DESC LIMIT 1`, [intern.id, today]);
    const todayTimeOut = await get(`SELECT * FROM attendance_logs WHERE intern_id = ? AND DATE(scan_time) = ? AND scan_type = 'time_out' AND scan_status = 'valid' ORDER BY scan_time DESC LIMIT 1`, [intern.id, today]);

    let scanType;
    if (!todayTimeIn) {
      scanType = 'time_in';
    } else if (!todayTimeOut) {
      scanType = 'time_out';
    } else {
      return res.status(409).json({ error: 'Already completed Time In and Time Out for today.', scan_status: 'duplicate' });
    }

    const recentScan = await get(`SELECT * FROM attendance_logs WHERE intern_id = ? AND scan_type = ? AND scan_time > ? AND scan_status = 'valid' ORDER BY scan_time DESC LIMIT 1`, [intern.id, scanType, windowAgo]);
    if (recentScan) {
      const typeLabel = scanType === 'time_in' ? 'Time In' : 'Time Out';
      return res.status(409).json({ error: `You already scanned for ${typeLabel} within the last ${DUPLICATE_WINDOW_MINUTES} minutes. Please wait before scanning again.`, scan_status: 'duplicate' });
    }

    const logResult = await run(`INSERT INTO attendance_logs (intern_id, scan_type, scan_time, scan_status, approval_status) VALUES (?, ?, ?, 'valid', 'pending')`, [intern.id, scanType, scanTime]);
    const timeStr = now.toTimeString().split(' ')[0];
    const existingDTR = await get('SELECT * FROM dtr_records WHERE intern_id = ? AND date = ?', [intern.id, today]);

    if (scanType === 'time_in') {
      if (existingDTR) await run('UPDATE dtr_records SET time_in = ?, updated_at = CURRENT_TIMESTAMP WHERE intern_id = ? AND date = ?', [timeStr, intern.id, today]);
      else await run('INSERT INTO dtr_records (intern_id, date, time_in) VALUES (?, ?, ?)', [intern.id, today, timeStr]);
    } else {
      const dtr = await get('SELECT * FROM dtr_records WHERE intern_id = ? AND date = ?', [intern.id, today]);
      let totalHours = 0;
      if (dtr?.time_in) {
        const timeIn = new Date(`${today}T${dtr.time_in}`);
        totalHours = Math.round(((now - timeIn) / 3600000) * 100) / 100;
      }
      await run('UPDATE dtr_records SET time_out = ?, total_hours = ?, updated_at = CURRENT_TIMESTAMP WHERE intern_id = ? AND date = ?', [timeStr, totalHours, intern.id, today]);
    }

    const admins = await all("SELECT id FROM users WHERE role = 'admin' AND is_active = 1", []);
    const actionLabel = scanType === 'time_in' ? 'Time In' : 'Time Out';
    for (const admin of admins) {
      await run(`INSERT INTO notifications (user_id, type, title, message, reference_id, reference_type) VALUES (?, 'attendance', ?, ?, ?, 'attendance')`,
        [admin.id, `Attendance: ${intern.full_name}`, `${intern.full_name} scanned ${actionLabel} at ${now.toLocaleTimeString()}`, logResult.lastInsertRowid]);
    }

    res.json({ message: `${actionLabel} recorded successfully!`, scan_type: scanType, scan_time: scanTime, intern_name: intern.full_name, log_id: logResult.lastInsertRowid });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Scan failed' }); }
});

router.get('/logs', authenticateToken, async (req, res) => {
  const { date, intern_id, status, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  let where = "WHERE a.scan_status = 'valid'"; const params = [];
  if (req.user.role === 'intern') {
    const intern = await get('SELECT id FROM interns WHERE user_id = ?', [req.user.id]);
    if (!intern) return res.json({ logs: [], total: 0 });
    where += ' AND a.intern_id = ?'; params.push(intern.id);
  } else if (intern_id) { where += ' AND a.intern_id = ?'; params.push(intern_id); }
  if (date) { where += ' AND DATE(a.scan_time) = ?'; params.push(date); }
  if (status) { where += ' AND a.approval_status = ?'; params.push(status); }
  const countRow = await get(`SELECT COUNT(*) as cnt FROM attendance_logs a JOIN interns i ON i.id=a.intern_id LEFT JOIN departments d ON d.id=i.department_id ${where}`, params);
  const logs = await all(`SELECT a.*, i.full_name, i.school, d.name as department_name FROM attendance_logs a JOIN interns i ON i.id=a.intern_id LEFT JOIN departments d ON d.id=i.department_id ${where} ORDER BY a.scan_time DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  res.json({ logs, total: countRow?.cnt || 0, page: Number(page), limit: Number(limit) });
});

router.patch('/:id/approve', authenticateToken, requireAdmin, async (req, res) => {
  const { remarks } = req.body;
  const log = await get('SELECT * FROM attendance_logs WHERE id = ?', [req.params.id]);
  if (!log) return res.status(404).json({ error: 'Log not found' });
  await run(`UPDATE attendance_logs SET approval_status='approved', approved_by=?, approved_at=CURRENT_TIMESTAMP, remarks=? WHERE id=?`, [req.user.id, remarks || '', req.params.id]);
  const today = log.scan_time.split('T')[0];
  const dtr = await get('SELECT * FROM dtr_records WHERE intern_id = ? AND date = ?', [log.intern_id, today]);
  if (dtr && dtr.time_in && dtr.time_out) {
    await run(`UPDATE dtr_records SET approval_status='approved', approved_by=?, approved_at=CURRENT_TIMESTAMP WHERE intern_id=? AND date=?`, [req.user.id, log.intern_id, today]);
    const sumRow = await get(`SELECT COALESCE(SUM(total_hours),0) as total FROM dtr_records WHERE intern_id=? AND approval_status='approved'`, [log.intern_id]);
    await run('UPDATE interns SET rendered_hours = ? WHERE id = ?', [sumRow?.total || 0, log.intern_id]);
  }
  const intern = await get('SELECT user_id FROM interns WHERE id = ?', [log.intern_id]);
  if (intern) await run(`INSERT INTO notifications (user_id, type, title, message, reference_id, reference_type) VALUES (?, 'attendance_approved', 'Attendance Approved', 'Your attendance has been approved.', ?, 'attendance')`, [intern.user_id, req.params.id]);
  res.json({ message: 'Attendance approved' });
});

router.patch('/:id/reject', authenticateToken, requireAdmin, async (req, res) => {
  const { remarks } = req.body;
  const log = await get('SELECT * FROM attendance_logs WHERE id = ?', [req.params.id]);
  if (!log) return res.status(404).json({ error: 'Log not found' });
  await run(`UPDATE attendance_logs SET approval_status='rejected', approved_by=?, approved_at=CURRENT_TIMESTAMP, remarks=? WHERE id=?`, [req.user.id, remarks || '', req.params.id]);
  const intern = await get('SELECT user_id FROM interns WHERE id = ?', [log.intern_id]);
  if (intern) await run(`INSERT INTO notifications (user_id, type, title, message, reference_id, reference_type) VALUES (?, 'attendance_rejected', 'Attendance Rejected', ?, ?, 'attendance')`, [intern.user_id, `Rejected: ${remarks || 'No reason given.'}`, req.params.id]);
  res.json({ message: 'Attendance rejected' });
});

router.get('/today-summary', authenticateToken, requireAdmin, async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const summary = await get(`SELECT COUNT(DISTINCT CASE WHEN scan_type='time_in' THEN intern_id END) as present_today, COUNT(CASE WHEN approval_status='pending' THEN 1 END) as pending, COUNT(CASE WHEN approval_status='approved' THEN 1 END) as approved FROM attendance_logs WHERE DATE(scan_time)=? AND scan_status='valid'`, [today]);
  res.json({ summary });
});

router.get('/qr-code', authenticateToken, requireAdmin, async (req, res) => {
  const qr = await get('SELECT * FROM office_qr WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1', []);
  res.json({ qr });
});

router.post('/qr-code/regenerate', authenticateToken, requireAdmin, async (req, res) => {
  await run('UPDATE office_qr SET is_active = 0', []);
  const newCode = `PNP-ITMS-OFFICE-QR-${uuidv4()}`;
  const r = await run('INSERT INTO office_qr (qr_code, is_active, created_by) VALUES (?, 1, ?)', [newCode, req.user.id]);
  await run(`INSERT INTO audit_logs (user_id, action, details) VALUES (?, 'regenerate_qr', 'QR Code regenerated')`, [req.user.id]);
  res.json({ message: 'QR code regenerated', qr_code: newCode, id: r.lastInsertRowid });
});

module.exports = router;
