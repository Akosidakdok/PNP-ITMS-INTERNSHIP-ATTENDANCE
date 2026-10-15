import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';

process.env.SUPABASE_URL ||= 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-key';
process.env.JWT_SECRET ||= 'test-session-secret';

const { createSession, refreshSession, verifyAccessSession } = await import('../src/services/sessionService.js');

const account = {
  id: 17,
  username: 'intern17',
  full_name: 'Test Intern',
  email: 'intern@example.com',
  role: 'intern',
  division_id: 4,
  division_name: 'ITMS',
  status: 'active',
};

function sessionClient(row, onFilter = () => {}) {
  return {
    from(table) {
      assert.equal(table, 'account_sessions');
      return {
        select() { return this; },
        eq(field, value) { onFilter(field, value); return this; },
        maybeSingle: async () => ({ data: row, error: null }),
      };
    },
  };
}

test('login creates a 30-day device session and a short-lived access token', async () => {
  let inserted;
  const client = {
    from(table) {
      assert.equal(table, 'account_sessions');
      return {
        insert(value) { inserted = value; return this; },
        select() { return this; },
        single: async () => ({ data: { id: 'session-17' }, error: null }),
      };
    },
  };

  const started = Date.now();
  const result = await createSession(account, client);
  const claims = jwt.verify(result.token, process.env.JWT_SECRET);
  assert.equal(claims.sid, 'session-17');
  assert.equal(claims.id, account.id);
  assert.equal(claims.exp - claims.iat, 15 * 60);
  assert.equal(inserted.account_id, account.id);
  assert.equal(inserted.refresh_token_hash, createHash('sha256').update(result.refresh_token).digest('hex'));
  assert.ok(Date.parse(inserted.expires_at) - started >= 30 * 24 * 60 * 60 * 1000);
  assert.ok(Date.parse(inserted.expires_at) - started < 30 * 24 * 60 * 60 * 1000 + 1000);
});

test('refresh restores access after closing the app', async () => {
  const refreshToken = 'saved-device-token';
  const row = {
    id: 'session-17',
    account_id: 17,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    revoked_at: null,
    accounts: account,
  };
  const client = sessionClient(row, (field, value) => {
    assert.equal(field, 'refresh_token_hash');
    assert.equal(value, createHash('sha256').update(refreshToken).digest('hex'));
  });

  const result = await refreshSession(refreshToken, client);
  assert.equal(result.user.id, account.id);
  assert.equal(jwt.verify(result.token, process.env.JWT_SECRET).sid, row.id);
});

test('revoked, expired, and disabled sessions cannot authorize requests', async () => {
  const valid = {
    account_id: 17,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    revoked_at: null,
    accounts: account,
  };
  assert.equal((await verifyAccessSession('session-17', 17, sessionClient(valid))).role, 'intern');
  for (const row of [
    { ...valid, revoked_at: new Date().toISOString() },
    { ...valid, expires_at: new Date(Date.now() - 1000).toISOString() },
    { ...valid, accounts: { ...account, status: 'disabled' } },
  ]) {
    await assert.rejects(verifyAccessSession('session-17', 17, sessionClient(row)), { statusCode: 401 });
  }
});
