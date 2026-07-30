import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

process.env.SUPABASE_URL ||= 'http://lockout.test';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key';

const { supabase } = await import('../src/supabaseClient.js');
const {
  completeFaceSuccess,
  completeLoginSuccess,
  getFaceBlockState,
  getLoginBlockState,
  lockoutResult,
  recordFaceFailure,
  recordLoginFailure,
} = await import('../src/security/attemptLockoutService.js');

const originalRpc = supabase.rpc.bind(supabase);
after(() => {
  supabase.rpc = originalRpc;
});

test('login lock state reports a temporary account lock', () => {
  const now = Date.parse('2026-07-30T00:00:00.000Z');
  const state = getLoginBlockState(
    { login_locked_until: '2026-07-30T00:15:00.000Z' },
    now
  );

  assert.equal(state.blocked, true);
  assert.equal(state.code, 'ACCOUNT_TEMPORARILY_LOCKED');
  assert.equal(state.retryAfterSeconds, 900);
});

test('expired login and face blocks no longer reject attempts', () => {
  const now = Date.parse('2026-07-30T00:30:00.000Z');

  assert.equal(
    getLoginBlockState(
      { login_locked_until: '2026-07-30T00:15:00.000Z' },
      now
    ).blocked,
    false
  );
  assert.equal(
    getFaceBlockState(
      {
        face_cooldown_until: '2026-07-30T00:00:30.000Z',
        face_locked_until: '2026-07-30T00:15:00.000Z',
      },
      now
    ).blocked,
    false
  );
});

test('face lock takes priority over the shorter cooldown', () => {
  const now = Date.parse('2026-07-30T00:00:00.000Z');
  const state = getFaceBlockState(
    {
      face_cooldown_until: '2026-07-30T00:00:30.000Z',
      face_locked_until: '2026-07-30T00:15:00.000Z',
    },
    now
  );

  assert.equal(state.code, 'FACE_TEMPORARILY_LOCKED');
  assert.equal(state.retryAfterSeconds, 900);
});

test('RPC results enforce failures and clear successful attempts', async () => {
  const future = new Date(Date.now() + 60_000).toISOString();
  const calls = [];
  supabase.rpc = async (name, params) => {
    calls.push([name, params]);
    if (name === 'record_login_failure') {
      return { data: { failed_attempts: 5, locked_until: future }, error: null };
    }
    if (name === 'record_face_failure') {
      return {
        data: {
          failed_attempts: 5,
          cooldown_until: future,
          locked_until: null,
        },
        error: null,
      };
    }
    return { data: { allowed: true }, error: null };
  };

  assert.equal((await recordLoginFailure(7)).code, 'ACCOUNT_TEMPORARILY_LOCKED');
  assert.equal((await recordFaceFailure(7)).code, 'FACE_COOLDOWN');
  assert.equal((await completeLoginSuccess(7)).blocked, false);
  assert.equal((await completeFaceSuccess(7)).blocked, false);
  assert.deepEqual(
    calls.map(([name]) => name),
    [
      'record_login_failure',
      'record_face_failure',
      'complete_login_success',
      'complete_face_verification_success',
    ]
  );
});

test('lockout result preserves comparison details and retry metadata', () => {
  const result = lockoutResult(
    {
      blocked: true,
      code: 'FACE_COOLDOWN',
      retryAfterSeconds: 30,
      message: 'Try again later.',
    },
    { similarity: 0.7, distance: 30 }
  );

  assert.deepEqual(result, {
    verified: false,
    similarity: 0.7,
    distance: 30,
    code: 'FACE_COOLDOWN',
    statusCode: 429,
    retry_after_seconds: 30,
    message: 'Try again later.',
  });
});

test('database migration contains the approved lockout thresholds', async () => {
  const migration = await readFile(
    new URL('../db/migration_attempt_lockouts.sql', import.meta.url),
    'utf8'
  );

  assert.match(migration, /v_attempts >= 5[\s\S]*interval '15 minutes'/);
  assert.match(migration, /v_attempts >= 10[\s\S]*interval '15 minutes'/);
  assert.match(migration, /v_attempts >= 5[\s\S]*interval '30 seconds'/);
  assert.match(migration, /v_now - interval '30 minutes'/);
});
