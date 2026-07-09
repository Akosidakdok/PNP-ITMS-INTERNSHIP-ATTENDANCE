const express = require('express');
const router = express.Router();
const { run, get, all } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roles');

router.get('/', authenticateToken, async (req, res) => {
  const departments = await all('SELECT d.*, COUNT(i.id) as intern_count FROM departments d LEFT JOIN interns i ON i.department_id = d.id AND i.status = ? GROUP BY d.id ORDER BY d.name', ['active']);
  res.json({ departments });
});

router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  const { name, description, head_name } = req.body;
  if (!name) return res.status(400).json({ error: 'Department name required' });
  const r = await run('INSERT INTO departments (name, description, head_name) VALUES (?, ?, ?)', [name, description, head_name]);
  res.status(201).json({ message: 'Department created', id: r.lastInsertRowid });
});

router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { name, description, head_name } = req.body;
  await run('UPDATE departments SET name=?, description=?, head_name=? WHERE id=?', [name, description, head_name, req.params.id]);
  res.json({ message: 'Department updated' });
});

router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  const count = await get('SELECT COUNT(*) as c FROM interns WHERE department_id = ?', [req.params.id]);
  if (count?.c > 0) return res.status(409).json({ error: 'Cannot delete department with active interns' });
  await run('DELETE FROM departments WHERE id = ?', [req.params.id]);
  res.json({ message: 'Department deleted' });
});

module.exports = router;
