const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { run, get, all } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roles');

router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  const { search, department, status, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  let where = 'WHERE 1=1'; const params = [];
  if (search) { where += ' AND (i.full_name LIKE ? OR i.email LIKE ? OR u.username LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  if (department) { where += ' AND i.department_id = ?'; params.push(department); }
  if (status) { where += ' AND i.status = ?'; params.push(status); }
  const countRow = await get(`SELECT COUNT(*) as cnt FROM interns i JOIN users u ON u.id=i.user_id LEFT JOIN departments d ON d.id=i.department_id ${where}`, params);
  const interns = await all(`SELECT i.*, u.username, u.last_login, u.is_active, d.name as department_name FROM interns i JOIN users u ON u.id=i.user_id LEFT JOIN departments d ON d.id=i.department_id ${where} ORDER BY i.created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  res.json({ interns, total: countRow?.cnt || 0, page: Number(page), limit: Number(limit) });
});

router.get('/me/profile', authenticateToken, async (req, res) => {
  const intern = await get('SELECT i.*, d.name as department_name FROM interns i LEFT JOIN departments d ON d.id=i.department_id WHERE i.user_id = ?', [req.user.id]);
  if (!intern) return res.status(404).json({ error: 'Profile not found' });
  res.json({ intern });
});

router.put('/me/profile', authenticateToken, async (req, res) => {
  const { email, phone, home_address, emergency_name, emergency_relation, emergency_phone } = req.body;
  const intern = await get('SELECT id FROM interns WHERE user_id = ?', [req.user.id]);
  if (!intern) return res.status(404).json({ error: 'Intern profile not found' });
  await run(
    'UPDATE interns SET email=?, phone=?, home_address=?, emergency_name=?, emergency_relation=?, emergency_phone=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
    [email, phone, home_address, emergency_name, emergency_relation, emergency_phone, intern.id]
  );
  res.json({ message: 'Profile updated successfully' });
});

router.get('/:id', authenticateToken, async (req, res) => {
  if (req.user.role === 'intern') {
    const own = await get('SELECT id FROM interns WHERE user_id = ?', [req.user.id]);
    if (!own || own.id != req.params.id) return res.status(403).json({ error: 'Access denied' });
  }
  const intern = await get(`SELECT i.*, u.username, u.last_login, u.is_active, d.name as department_name FROM interns i JOIN users u ON u.id=i.user_id LEFT JOIN departments d ON d.id=i.department_id WHERE i.id = ?`, [req.params.id]);
  if (!intern) return res.status(404).json({ error: 'Intern not found' });
  res.json({ intern });
});

router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  const { 
    username, password, full_name, email, phone, school, course, year_level, 
    department_id, required_hours, start_date, end_date,
    student_id, home_address, emergency_name, emergency_relation, emergency_phone
  } = req.body;
  if (!username || !password || !full_name) return res.status(400).json({ error: 'Username, password, and full name are required' });
  const existing = await get('SELECT id FROM users WHERE username = ?', [username]);
  if (existing) return res.status(409).json({ error: 'Username already exists' });
  try {
    const hash = await bcrypt.hash(password, 12);
    const ur = await run('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', [username, hash, 'intern']);
    const ir = await run(
      `INSERT INTO interns (user_id, full_name, email, phone, school, course, year_level, department_id, required_hours, start_date, end_date, student_id, home_address, emergency_name, emergency_relation, emergency_phone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [ur.lastInsertRowid, full_name, email, phone, school, course, year_level, department_id, required_hours || 486, start_date, end_date, student_id, home_address, emergency_name, emergency_relation, emergency_phone]
    );
    await run(`INSERT INTO audit_logs (user_id, action, details) VALUES (?, 'create_intern', ?)`, [req.user.id, `Created: ${full_name}`]);
    res.status(201).json({ message: 'Intern created', intern_id: ir.lastInsertRowid });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to create intern' }); }
});

router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { 
    full_name, email, phone, school, course, year_level, department_id, 
    required_hours, start_date, end_date, status,
    student_id, home_address, emergency_name, emergency_relation, emergency_phone
  } = req.body;
  await run(
    `UPDATE interns 
     SET full_name=?, email=?, phone=?, school=?, course=?, year_level=?, department_id=?, required_hours=?, start_date=?, end_date=?, status=?, student_id=?, home_address=?, emergency_name=?, emergency_relation=?, emergency_phone=?, updated_at=CURRENT_TIMESTAMP 
     WHERE id=?`,
    [full_name, email, phone, school, course, year_level, department_id, required_hours, start_date, end_date, status, student_id, home_address, emergency_name, emergency_relation, emergency_phone, req.params.id]
  );
  await run(`INSERT INTO audit_logs (user_id, action, details) VALUES (?, 'update_intern', ?)`, [req.user.id, `Updated ID: ${req.params.id}`]);
  res.json({ message: 'Intern updated' });
});

router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  const intern = await get('SELECT user_id, full_name FROM interns WHERE id = ?', [req.params.id]);
  if (!intern) return res.status(404).json({ error: 'Intern not found' });
  await run('DELETE FROM users WHERE id = ?', [intern.user_id]);
  await run(`INSERT INTO audit_logs (user_id, action, details) VALUES (?, 'delete_intern', ?)`, [req.user.id, `Deleted: ${intern.full_name}`]);
  res.json({ message: 'Intern deleted' });
});

router.post('/:id/reset-password', authenticateToken, requireAdmin, async (req, res) => {
  const { new_password } = req.body;
  if (!new_password || new_password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const intern = await get('SELECT user_id FROM interns WHERE id = ?', [req.params.id]);
  if (!intern) return res.status(404).json({ error: 'Intern not found' });
  await run('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(new_password, 12), intern.user_id]);
  res.json({ message: 'Password reset successfully' });
});

module.exports = router;
