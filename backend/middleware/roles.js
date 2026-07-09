function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Administrator access required' });
  }
  next();
}

function requireIntern(req, res, next) {
  if (!req.user || req.user.role !== 'intern') {
    return res.status(403).json({ error: 'Intern access required' });
  }
  next();
}

function requireAny(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

module.exports = { requireAdmin, requireIntern, requireAny };
