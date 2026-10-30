import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

for (const [path, body] of [
  ['/admin/dtr/:internId/edit-times', { date: '2026-10-29', time_out: '17:00', status: 'pending' }],
  ['/admin/dtr/:internId/edit', { date: '2026-10-29', time_out: '17:00', status: 'pending' }],
  ['/admin/dtr/:internId/batch-alter', { dates: ['2026-10-29'], mode: 'time', time_out: '17:00', status: 'pending' }],
]) {
  test(`Admin corrections automatically approve through ${path}`, async () => {
    const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
    const start = source.indexOf(`app.put('${path}'`);
    const next = source.indexOf('\napp.', start + 1);
    let handler;
    const calls = [];
    const middleware = () => {};
    vm.runInNewContext(source.slice(start, next), {
      app: { put(route, ...handlers) { handler = handlers.at(-1); } },
      authMiddleware: middleware, adminOnlyMiddleware: middleware, superadminMiddleware: middleware,
      editDtrRecord: async args => { calls.push(args); return { success: true }; }, console,
    });
    const response = { json(value) { return value; }, status() { return this; } };
    await handler({ params: { internId: '7' }, body: { ...body, reason: 'Verified official correction' },
      user: { id: 10, role: 'admin' } }, response);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].status, 'approved');
    assert.notEqual(calls[0].preserveStatus, true);
  });
}
