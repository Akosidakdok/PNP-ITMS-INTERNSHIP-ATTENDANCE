const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { run, get, all } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roles');
const { upload } = require('../middleware/upload');

router.post('/upload', authenticateToken, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const { document_type } = req.body;
  if (!document_type) return res.status(400).json({ error: 'Document type required' });

  let internId;
  if (req.user.role === 'intern') {
    const intern = await get('SELECT id FROM interns WHERE user_id = ?', [req.user.id]);
    if (!intern) return res.status(403).json({ error: 'No intern profile' });
    internId = intern.id;
  } else {
    internId = req.body.intern_id;
    if (!internId) return res.status(400).json({ error: 'Intern ID required' });
  }

  const ext = path.extname(req.file.originalname).toLowerCase().replace('.', '');
  const filePath = req.file.path.replace(/\\/g, '/');
  const r = await run(`INSERT INTO uploaded_documents (intern_id, document_type, original_name, file_name, file_path, file_type, file_size) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [internId, document_type, req.file.originalname, req.file.filename, filePath, ext, req.file.size]);

  const internProfile = await get('SELECT full_name FROM interns WHERE id = ?', [internId]);
  const admins = await all("SELECT id FROM users WHERE role='admin' AND is_active=1", []);
  for (const admin of admins) {
    await run(`INSERT INTO notifications (user_id, type, title, message, reference_id, reference_type) VALUES (?, 'document_upload', 'Document Uploaded', ?, ?, 'document')`,
      [admin.id, `${internProfile?.full_name || 'An intern'} uploaded a ${document_type}.`, r.lastInsertRowid]);
  }
  res.status(201).json({ message: 'Document uploaded successfully', document_id: r.lastInsertRowid });
});

router.get('/', authenticateToken, async (req, res) => {
  let where = 'WHERE 1=1'; const params = [];
  if (req.user.role === 'intern') {
    const intern = await get('SELECT id FROM interns WHERE user_id = ?', [req.user.id]);
    if (!intern) return res.json({ documents: [] });
    where += ' AND d.intern_id = ?'; params.push(intern.id);
  } else if (req.query.intern_id) { where += ' AND d.intern_id = ?'; params.push(req.query.intern_id); }
  if (req.query.status) { where += ' AND d.status = ?'; params.push(req.query.status); }
  const documents = await all(`SELECT d.*, i.full_name FROM uploaded_documents d JOIN interns i ON i.id=d.intern_id ${where} ORDER BY d.upload_date DESC`, params);
  res.json({ documents });
});

router.patch('/:id/status', authenticateToken, requireAdmin, async (req, res) => {
  const { status, admin_remarks } = req.body;
  if (!['accepted', 'revision', 'pending'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const doc = await get('SELECT d.*, i.user_id FROM uploaded_documents d JOIN interns i ON i.id=d.intern_id WHERE d.id=?', [req.params.id]);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  await run(`UPDATE uploaded_documents SET status=?, admin_remarks=?, reviewed_by=?, reviewed_at=CURRENT_TIMESTAMP WHERE id=?`, [status, admin_remarks || '', req.user.id, req.params.id]);
  const title = status === 'accepted' ? 'Document Accepted' : 'Document Needs Revision';
  const message = status === 'accepted' ? `Your ${doc.document_type} has been accepted.` : `Your ${doc.document_type} needs revision: ${admin_remarks || 'Please resubmit.'}`;
  await run(`INSERT INTO notifications (user_id, type, title, message, reference_id, reference_type) VALUES (?, ?, ?, ?, ?, 'document')`, [doc.user_id, `document_${status}`, title, message, req.params.id]);
  res.json({ message: `Document marked as ${status}` });
});

router.delete('/:id', authenticateToken, async (req, res) => {
  const doc = await get('SELECT d.*, i.user_id FROM uploaded_documents d JOIN interns i ON i.id=d.intern_id WHERE d.id=?', [req.params.id]);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  if (req.user.role === 'intern' && doc.user_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });
  if (fs.existsSync(doc.file_path)) fs.unlinkSync(doc.file_path);
  await run('DELETE FROM uploaded_documents WHERE id = ?', [req.params.id]);
  res.json({ message: 'Document deleted' });
});

module.exports = router;
