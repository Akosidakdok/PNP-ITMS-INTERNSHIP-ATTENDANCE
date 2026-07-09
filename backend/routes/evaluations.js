const express = require('express');
const router = express.Router();
const { run, get, all } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roles');

function getRating(score) {
  if (score >= 90) return 'Outstanding';
  if (score >= 80) return 'Very Satisfactory';
  if (score >= 70) return 'Satisfactory';
  if (score >= 60) return 'Fair';
  return 'Needs Improvement';
}

router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  const { intern_id, work_quality, punctuality, teamwork, communication, initiative, comments } = req.body;
  if (!intern_id) return res.status(400).json({ error: 'Intern ID required' });
  const scores = [work_quality, punctuality, teamwork, communication, initiative].map(Number);
  const overall_score = scores.reduce((a, b) => a + b, 0) / 5;
  const overall_rating = getRating(overall_score);
  const r = await run(`INSERT INTO performance_evaluations (intern_id, evaluated_by, evaluation_date, work_quality, punctuality, teamwork, communication, initiative, overall_score, overall_rating, comments) VALUES (?, ?, DATE('now'), ?, ?, ?, ?, ?, ?, ?, ?)`,
    [intern_id, req.user.id, work_quality, punctuality, teamwork, communication, initiative, overall_score, overall_rating, comments]);
  const intern = await get('SELECT user_id FROM interns WHERE id = ?', [intern_id]);
  if (intern) await run(`INSERT INTO notifications (user_id, type, title, message, reference_id, reference_type) VALUES (?, 'evaluation', 'Performance Evaluation Completed', ?, ?, 'evaluation')`,
    [intern.user_id, `Your performance evaluation has been submitted. Rating: ${overall_rating}`, r.lastInsertRowid]);
  res.status(201).json({ message: 'Evaluation submitted', id: r.lastInsertRowid, overall_rating, overall_score });
});

router.get('/', authenticateToken, async (req, res) => {
  let where = 'WHERE 1=1'; const params = [];
  if (req.user.role === 'intern') {
    const intern = await get('SELECT id FROM interns WHERE user_id = ?', [req.user.id]);
    if (!intern) return res.json({ evaluations: [] });
    where += ' AND e.intern_id = ?'; params.push(intern.id);
  } else if (req.query.intern_id) { where += ' AND e.intern_id = ?'; params.push(req.query.intern_id); }
  const evaluations = await all(`SELECT e.*, i.full_name, u.username as evaluator_name FROM performance_evaluations e JOIN interns i ON i.id=e.intern_id JOIN users u ON u.id=e.evaluated_by ${where} ORDER BY e.evaluation_date DESC`, params);
  res.json({ evaluations });
});

router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { work_quality, punctuality, teamwork, communication, initiative, comments } = req.body;
  const scores = [work_quality, punctuality, teamwork, communication, initiative].map(Number);
  const overall_score = scores.reduce((a, b) => a + b, 0) / 5;
  const overall_rating = getRating(overall_score);
  await run(`UPDATE performance_evaluations SET work_quality=?,punctuality=?,teamwork=?,communication=?,initiative=?,overall_score=?,overall_rating=?,comments=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [work_quality, punctuality, teamwork, communication, initiative, overall_score, overall_rating, comments, req.params.id]);
  res.json({ message: 'Evaluation updated', overall_rating, overall_score });
});

module.exports = router;
