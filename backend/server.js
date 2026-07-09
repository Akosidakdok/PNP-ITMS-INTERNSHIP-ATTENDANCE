require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { initializeDatabase } = require('./database/db');

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, message: { error: 'Too many requests.' } });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Too many login attempts.' } });
app.use('/api/', limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res) => { res.set('Cross-Origin-Resource-Policy', 'cross-origin'); }
}));

async function startServer() {
  await initializeDatabase();

  // Routes
  app.use('/api/auth', authLimiter, require('./routes/auth'));
  app.use('/api/interns', require('./routes/interns'));
  app.use('/api/departments', require('./routes/departments'));
  app.use('/api/attendance', require('./routes/attendance'));
  app.use('/api/dtr', require('./routes/dtr'));
  app.use('/api/documents', require('./routes/documents'));
  app.use('/api/evaluations', require('./routes/evaluations'));
  app.use('/api/notifications', require('./routes/notifications'));
  app.use('/api/admin', require('./routes/admin'));

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Global error handler
  app.use((err, req, res, next) => {
    console.error(err.stack);
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File size exceeds the allowed limit.' });
    }
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  });

  app.listen(PORT, () => {
    console.log(`\n🚀 PNP-ITMS Backend running on http://localhost:${PORT}`);
    console.log(`📁 Uploads at http://localhost:${PORT}/uploads`);
  });
}

startServer().catch(err => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});

module.exports = app;
