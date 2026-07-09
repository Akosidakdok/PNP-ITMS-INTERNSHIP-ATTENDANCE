const express = require('express');
const router = express.Router();
const { run, get, all } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

router.get('/', authenticateToken, async (req, res) => {
  const { intern_id, month, year, page = 1, limit = 31 } = req.query;
  const offset = (page - 1) * limit;
  let where = 'WHERE 1=1'; const params = [];
  let targetId = intern_id;
  if (req.user.role === 'intern') {
    const intern = await get('SELECT id FROM interns WHERE user_id = ?', [req.user.id]);
    if (!intern) return res.json({ records: [], total: 0 });
    targetId = intern.id;
  }
  if (targetId) { where += ' AND d.intern_id = ?'; params.push(targetId); }
  if (month) { where += " AND strftime('%m', d.date) = ?"; params.push(String(month).padStart(2, '0')); }
  if (year) { where += " AND strftime('%Y', d.date) = ?"; params.push(String(year)); }
  const countRow = await get(`SELECT COUNT(*) as cnt FROM dtr_records d ${where}`, params);
  const records = await all(`SELECT d.*, i.full_name, i.required_hours, u.username as approved_by_name FROM dtr_records d JOIN interns i ON i.id=d.intern_id LEFT JOIN users u ON u.id=d.approved_by ${where} ORDER BY d.date ASC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const sumRow = targetId ? await get(`SELECT COALESCE(SUM(total_hours),0) as total FROM dtr_records WHERE approval_status='approved' AND intern_id=?`, [targetId]) : null;
  res.json({ records, total: countRow?.cnt || 0, page: Number(page), limit: Number(limit), summary: { total_approved_hours: sumRow?.total || 0 } });
});

router.get('/:intern_id/monthly-summary', authenticateToken, async (req, res) => {
  const summary = await all(`SELECT strftime('%Y-%m', date) as month, COUNT(*) as days_present, COALESCE(SUM(total_hours),0) as total_hours, COUNT(CASE WHEN approval_status='approved' THEN 1 END) as approved_days FROM dtr_records WHERE intern_id=? GROUP BY strftime('%Y-%m', date) ORDER BY month DESC`, [req.params.intern_id]);
  res.json({ summary });
});

module.exports = router;
