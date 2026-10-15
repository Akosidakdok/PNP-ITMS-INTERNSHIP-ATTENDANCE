import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { supabase } from '../supabaseClient.js';

const SESSION_DAYS = 30;
const ACCESS_TOKEN_LIFETIME = '15m';
const DISABLED_STATUSES = new Set(['archived', 'inactive', 'disabled']);
const ACCOUNT_FIELDS = 'id, username, full_name, email, role, division_id, division_name, face_registered, self_face_enrollment_available, status';

function sessionError(message, statusCode = 401) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function isActive(account) {
  return account && !DISABLED_STATUSES.has(String(account.status || '').toLowerCase());
}

function accountPayload(account) {
  const divisionId = account.division_id ?? account.department_id ?? null;
  const divisionName = account.division_name ?? account.department_name ?? null;
  return {
    id: account.id,
    username: account.username,
    full_name: account.full_name,
    email: account.email,
    role: account.role,
    division_id: divisionId,
    division_name: divisionName,
    department_id: divisionId,
    department_name: divisionName,
    face_registered: Boolean(account.face_registered),
    self_face_enrollment_available: Boolean(account.self_face_enrollment_available),
  };
}

function signAccessToken(user, sessionId) {
  return jwt.sign({ ...user, sid: sessionId }, process.env.JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_LIFETIME,
  });
}

export async function createSession(account, client = supabase) {
  const refreshToken = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await client
    .from('account_sessions')
    .insert({ account_id: account.id, refresh_token_hash: hashToken(refreshToken), expires_at: expiresAt })
    .select('id')
    .single();
  if (error) throw sessionError('Unable to create session', 503);

  const user = accountPayload(account);
  return { user, token: signAccessToken(user, data.id), refresh_token: refreshToken };
}

export async function refreshSession(refreshToken, client = supabase) {
  if (typeof refreshToken !== 'string' || !refreshToken || refreshToken.length > 256) {
    throw sessionError('Session has expired');
  }
  const { data: session, error } = await client
    .from('account_sessions')
    .select(`id, account_id, expires_at, revoked_at, accounts!inner(${ACCOUNT_FIELDS})`)
    .eq('refresh_token_hash', hashToken(refreshToken))
    .maybeSingle();
  if (error) throw sessionError('Unable to verify session', 503);
  if (!session || session.revoked_at || Date.parse(session.expires_at) <= Date.now()) {
    throw sessionError('Session has expired');
  }
  if (!isActive(session.accounts)) {
    await revokeSession(session.id, client);
    throw sessionError('Session has expired');
  }

  const user = accountPayload(session.accounts);
  return { user, token: signAccessToken(user, session.id) };
}

export async function verifyAccessSession(sessionId, accountId, client = supabase) {
  const { data, error } = await client
    .from('account_sessions')
    .select(`account_id, expires_at, revoked_at, accounts!inner(${ACCOUNT_FIELDS})`)
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw sessionError('Unable to verify session', 503);
  if (!data || Number(data.account_id) !== Number(accountId) || data.revoked_at
    || Date.parse(data.expires_at) <= Date.now() || !isActive(data.accounts)) {
    throw sessionError('Session has expired');
  }
  return accountPayload(data.accounts);
}

export async function revokeSession(sessionId, client = supabase) {
  const { error } = await client
    .from('account_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', sessionId)
    .is('revoked_at', null);
  if (error) throw sessionError('Unable to revoke session', 503);
}

export async function revokeRefreshToken(refreshToken) {
  if (typeof refreshToken !== 'string' || !refreshToken || refreshToken.length > 256) return;
  const { error } = await supabase
    .from('account_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('refresh_token_hash', hashToken(refreshToken))
    .is('revoked_at', null);
  if (error) throw sessionError('Unable to revoke session', 503);
}

export async function revokeAccountSessions(accountId, exceptSessionId = null) {
  let query = supabase
    .from('account_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .is('revoked_at', null);
  if (exceptSessionId) query = query.neq('id', exceptSessionId);
  const { error } = await query;
  if (error) throw sessionError('Unable to revoke sessions', 503);
}
