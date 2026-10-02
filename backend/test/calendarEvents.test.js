import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

process.env.SUPABASE_URL ||= 'http://calendar.test';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key';

const { supabase } = await import('../src/supabaseClient.js');
const {
  getCalendarEvents,
  assertCalendarEventMutationAccess,
  createCalendarEvent,
  updateCalendarEvent,
} = await import('../src/data.js');

const originalFrom = supabase.from.bind(supabase);
after(() => { supabase.from = originalFrom; });

test('calendar month queries use the complete month, including leap day', async () => {
  const filters = {};
  supabase.from = table => {
    assert.equal(table, 'calendar_events');
    const query = {
      select() { return query; },
      gte(column, value) { filters.start = [column, value]; return query; },
      lte(column, value) { filters.end = [column, value]; return query; },
      lt(column, value) { filters.endExclusive = [column, value]; return query; },
      order() { return Promise.resolve({ data: [], error: null }); },
    };
    return query;
  };

  await getCalendarEvents({ year: 2024, month: 2 });
  assert.deepEqual(filters, {
    start: ['event_date', '2024-02-01'],
    end: ['event_date', '2024-02-29'],
  });

  await getCalendarEvents({ year: 2026, month: 2 });
  assert.deepEqual(filters.end, ['event_date', '2026-02-28']);
  await getCalendarEvents({ startDate: '2026-09-27', endDate: '2026-11-08' });
  assert.deepEqual(filters.start, ['event_date', '2026-09-27']);
  assert.deepEqual(filters.endExclusive, ['event_date', '2026-11-08']);
  await assert.rejects(
    getCalendarEvents({ year: 2026, month: 13 }),
    error => error.statusCode === 400
  );
  await assert.rejects(
    getCalendarEvents({ startDate: '2026-11-08', endDate: '2026-09-27' }),
    error => error.statusCode === 400
  );
  await assert.rejects(
    getCalendarEvents({ startDate: '1999-12-31', endDate: '2000-01-01' }),
    error => error.statusCode === 400
  );
});

test('calendar mutations reject invalid dates and blank event types', async () => {
  await assert.rejects(
    createCalendarEvent({ title: 'Holiday', event_date: '2026-02-30', event_type: 'holiday' }, 7),
    error => error.statusCode === 400
  );
  await assert.rejects(
    updateCalendarEvent(1, { event_type: ' ' }),
    error => error.statusCode === 400
  );
});

test('supervisors can change only their own calendar events', async () => {
  supabase.from = table => {
    assert.equal(table, 'calendar_events');
    const query = {
      select() { return query; },
      eq() { return query; },
      single: async () => ({ data: { id: 9, created_by: 7 }, error: null }),
    };
    return query;
  };

  await assert.doesNotReject(
    assertCalendarEventMutationAccess(9, { id: 7, role: 'supervisor' })
  );
  await assert.rejects(
    assertCalendarEventMutationAccess(9, { id: 8, role: 'supervisor' }),
    error => error.statusCode === 403
  );
  await assert.doesNotReject(
    assertCalendarEventMutationAccess(9, { id: 8, role: 'admin' })
  );
  await assert.rejects(
    assertCalendarEventMutationAccess(0, { id: 7, role: 'supervisor' }),
    error => error.statusCode === 400
  );
});

test('calendar policy migration removes broad supervisor writes', async () => {
  const sql = await readFile(
    new URL('../db/migration_calendar_event_ownership.sql', import.meta.url),
    'utf8'
  );
  assert.match(sql, /drop policy if exists "Allow admins full access"/);
  assert.match(sql, /for update to authenticated[\s\S]*calendar_events\.created_by = me\.id/);
  assert.match(sql, /for delete to authenticated[\s\S]*calendar_events\.created_by = me\.id/);
  assert.match(sql, /me\.role in \('superadmin', 'admin'\)/);
});
