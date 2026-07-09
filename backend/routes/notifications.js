const express = require('express');
const router = express.Router();
const { run, get, all } = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

// SSE clients map: userId -> Set of response objects
const clients = new Map();

router.get('/stream', authenticateToken, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || 'http://localhost:5173');
  res.flushHeaders();

  const userId = req.user.id;
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(res);

  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
  const heartbeat = setInterval(() => res.write(`:heartbeat\n\n`), 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    const userClients = clients.get(userId);
    if (userClients) {
      userClients.delete(res);
      if (userClients.size === 0) clients.delete(userId);
    }
  });
});

function sendNotification(userId, data) {
  const userClients = clients.get(userId);
  if (userClients) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    userClients.forEach(client => { try { client.write(payload); } catch {} });
  }
}

router.get('/', authenticateToken, async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  const notifications = await all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?', [req.user.id, limit, offset]);
  const unread = await get('SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND is_read = 0', [req.user.id]);
  res.json({ notifications, unread_count: unread?.cnt || 0 });
});

router.patch('/read-all', authenticateToken, async (req, res) => {
  await run('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
  res.json({ message: 'All marked read' });
});

router.patch('/:id/read', authenticateToken, async (req, res) => {
  await run('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  res.json({ message: 'Notification marked as read' });
});

module.exports = router;
module.exports.sendNotification = sendNotification;
