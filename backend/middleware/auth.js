const jwt = require('jsonwebtoken');
const { get } = require('../database/db');

const JWT_SECRET = process.env.JWT_SECRET || 'pnp-itms-super-secret-key-change-in-production';

async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await get('SELECT id, username, role, is_active FROM users WHERE id = ?', [decoded.userId]);
    if (!user || !user.is_active) return res.status(401).json({ error: 'Invalid or inactive account' });
    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expired' });
    return res.status(403).json({ error: 'Invalid token' });
  }
}

function generateToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '8h' });
}

module.exports = { authenticateToken, generateToken, JWT_SECRET };
