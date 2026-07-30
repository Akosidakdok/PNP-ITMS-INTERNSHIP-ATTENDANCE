import { supabase } from '../supabaseClient.js';

const LOCKOUT_MIGRATION = 'migration_attempt_lockouts.sql';

function parseTimestamp(value) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function retryAfterSeconds(until, now = Date.now()) {
  const timestamp = parseTimestamp(until);
  if (!timestamp || timestamp <= now) return 0;
  return Math.max(1, Math.ceil((timestamp - now) / 1000));
}

function blockedState({ lockedUntil, cooldownUntil, type, now = Date.now() }) {
  const lockSeconds = retryAfterSeconds(lockedUntil, now);
  if (lockSeconds > 0) {
    return {
      blocked: true,
      code: type === 'login' ? 'ACCOUNT_TEMPORARILY_LOCKED' : 'FACE_TEMPORARILY_LOCKED',
      retryAfterSeconds: lockSeconds,
      message: type === 'login'
        ? `Account temporarily locked. Try again in ${formatDuration(lockSeconds)}.`
        : `Face verification temporarily locked. Try again in ${formatDuration(lockSeconds)}.`,
    };
  }

  const cooldownSeconds = retryAfterSeconds(cooldownUntil, now);
  if (cooldownSeconds > 0) {
    return {
      blocked: true,
      code: 'FACE_COOLDOWN',
      retryAfterSeconds: cooldownSeconds,
      message: `Too many failed face attempts. Try again in ${formatDuration(cooldownSeconds)}.`,
    };
  }

  return { blocked: false };
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(1, Math.ceil(Number(totalSeconds) || 0));
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

function lockoutServiceError(action, error) {
  console.error(`Attempt lockout ${action} failed:`, {
    code: error?.code,
    message: error?.message,
    requiredMigration: LOCKOUT_MIGRATION,
  });
  const serviceError = new Error('Security lockout service is temporarily unavailable.');
  serviceError.code = 'LOCKOUT_SERVICE_UNAVAILABLE';
  serviceError.statusCode = 503;
  return serviceError;
}

async function callLockoutRpc(name, params, action) {
  const { data, error } = await supabase.rpc(name, params);
  if (error || !data) {
    throw lockoutServiceError(action, error);
  }
  try {
    return typeof data === 'string' ? JSON.parse(data) : data;
  } catch (parseError) {
    throw lockoutServiceError(action, parseError);
  }
}

export function getLoginBlockState(account, now = Date.now()) {
  return blockedState({
    lockedUntil: account?.login_locked_until,
    type: 'login',
    now,
  });
}

export function getFaceBlockState(account, now = Date.now()) {
  return blockedState({
    lockedUntil: account?.face_locked_until,
    cooldownUntil: account?.face_cooldown_until,
    type: 'face',
    now,
  });
}

export async function recordLoginFailure(accountId) {
  const state = await callLockoutRpc(
    'record_login_failure',
    { p_account_id: Number(accountId) },
    'login failure recording'
  );
  return getLoginBlockState({ login_locked_until: state.locked_until });
}

export async function completeLoginSuccess(accountId) {
  const state = await callLockoutRpc(
    'complete_login_success',
    { p_account_id: Number(accountId) },
    'login success completion'
  );
  if (state.allowed) return { blocked: false };
  return getLoginBlockState({ login_locked_until: state.locked_until });
}

export async function recordFaceFailure(accountId) {
  const state = await callLockoutRpc(
    'record_face_failure',
    { p_account_id: Number(accountId) },
    'face failure recording'
  );
  return getFaceBlockState({
    face_locked_until: state.locked_until,
    face_cooldown_until: state.cooldown_until,
  });
}

export async function completeFaceSuccess(accountId) {
  const state = await callLockoutRpc(
    'complete_face_verification_success',
    { p_account_id: Number(accountId) },
    'face success completion'
  );
  if (state.allowed) return { blocked: false };
  return getFaceBlockState({
    face_locked_until: state.locked_until,
    face_cooldown_until: state.cooldown_until,
  });
}

export function lockoutResult(block, fallback) {
  if (!block?.blocked) return fallback;
  return {
    verified: false,
    similarity: fallback?.similarity ?? 0,
    distance: fallback?.distance ?? 999,
    code: block.code,
    statusCode: 429,
    retry_after_seconds: block.retryAfterSeconds,
    message: block.message,
  };
}
