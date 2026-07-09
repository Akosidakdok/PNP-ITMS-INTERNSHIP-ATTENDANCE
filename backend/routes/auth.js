const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { run, get, all } = require('../database/db');
const { generateToken, authenticateToken } = require('../middleware/auth');

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  try {
    const user = await get(`
      SELECT u.*, i.id as intern_id, i.full_name, i.profile_photo, i.department_id
      FROM users u LEFT JOIN interns i ON i.user_id = u.id
      WHERE u.username = ? AND u.is_active = 1`, [username.trim()]);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    await run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
    await run(`INSERT INTO audit_logs (user_id, action, ip_address) VALUES (?, 'login', ?)`, [user.id, req.ip]);
    const token = generateToken(user.id);
    res.json({ token, user: { id: user.id, username: user.username, role: user.role, full_name: user.full_name || user.username, profile_photo: user.profile_photo, intern_id: user.intern_id, department_id: user.department_id } });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Login failed' }); }
});

router.get('/me', authenticateToken, async (req, res) => {
  const user = await get(`
    SELECT u.id, u.username, u.role, u.last_login,
           i.id as intern_id, i.full_name, i.email, i.phone, i.school,
           i.course, i.year_level, i.department_id, i.required_hours,
           i.rendered_hours, i.start_date, i.end_date, i.profile_photo, i.status,
           d.name as department_name
    FROM users u LEFT JOIN interns i ON i.user_id = u.id LEFT JOIN departments d ON d.id = i.department_id
    WHERE u.id = ?`, [req.user.id]);
  res.json({ user });
});

router.post('/logout', authenticateToken, async (req, res) => {
  await run(`INSERT INTO audit_logs (user_id, action, ip_address) VALUES (?, 'logout', ?)`, [req.user.id, req.ip]);
  res.json({ message: 'Logged out' });
});

router.post('/change-password', authenticateToken, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password || new_password.length < 8)
    return res.status(400).json({ error: 'Invalid password data' });
  const user = await get('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  if (!await bcrypt.compare(current_password, user.password_hash))
    return res.status(401).json({ error: 'Current password incorrect' });
  await run('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(new_password, 12), req.user.id]);
  res.json({ message: 'Password changed' });
});

module.exports = router;
