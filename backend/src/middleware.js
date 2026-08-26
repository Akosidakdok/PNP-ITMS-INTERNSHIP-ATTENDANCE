import jwt from 'jsonwebtoken';
import { getLegalAcceptanceStatus, isLegalRoute } from './services/legalService.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in .env');
}

export async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    return res.status(401).json({ error: 'Authorization token is required' });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired authorization token' });
  }

  if (isLegalRoute(req.path)) return next();

  try {
    const legalStatus = await getLegalAcceptanceStatus(req.user.id);
    if (legalStatus.required) {
      return res.status(428).json({
        error: 'Current Terms and Privacy Notice acceptance is required',
        code: 'LEGAL_ACCEPTANCE_REQUIRED',
        pending: legalStatus.pending,
      });
    }
  } catch (error) {
    console.error('Legal acceptance check failed:', error?.message || error);
    return res.status(503).json({ error: 'Unable to verify legal acceptance status' });
  }

  return next();
}

export function adminMiddleware(req, res, next) {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'supervisor')) {
    return res.status(403).json({ error: 'Admin or Supervisor access required' });
  }
  return next();
}

export function adminOnlyMiddleware(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin-only access required' });
  }
  return next();
}
