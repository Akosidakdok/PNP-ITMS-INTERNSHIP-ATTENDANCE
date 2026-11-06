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

test('holiday scope migration leaves existing events program-wide and validates local scope', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const migration = await readFile(
    new URL('../../supabase/migrations/20261106004312_calendar_holiday_division_scope.sql', import.meta.url), 'utf8'
  );
  const db = new PGlite();
  try {
    await db.exec("CREATE TABLE calendar_events (event_type text); INSERT INTO calendar_events VALUES ('holiday')");
    await db.exec(migration);
    const { rows } = await db.query('SELECT holiday_division_id FROM calendar_events');
    assert.deepEqual(rows, [{ holiday_division_id: null }]);
    await db.exec("INSERT INTO calendar_events VALUES ('holiday', 3)");
    await assert.rejects(db.exec("INSERT INTO calendar_events VALUES ('holiday', -1)"), /check constraint/);
  } finally {
    await db.close();
  }
});

test('unscoped Calendar writes work before the scope migration without broadening scoped writes', async () => {
  const attempts = [];
  supabase.from = table => {
    let fields;
    const query = {
      insert(rows) { fields = rows[0]; return query; },
      update(updates) { fields = updates; return query; },
      select() { return query; },
      eq() { return query; },
      single() {
        if (table === 'divisions') return { data: { id: 3 }, error: null };
        assert.equal(table, 'calendar_events');
        attempts.push({ ...fields });
        return Object.hasOwn(fields, 'holiday_division_id')
          ? { error: { code: 'PGRST204', message: 'Missing holiday_division_id column' } }
          : { data: null, error: null };
      },
    };
    return query;
  };

  const holiday = { title: 'Program Holiday', event_date: '2026-11-02', event_type: 'holiday' };
  await createCalendarEvent({ ...holiday, holiday_division_id: '' }, 7);
  assert.equal(Object.hasOwn(attempts[0], 'holiday_division_id'), false);
  await updateCalendarEvent(1, { event_type: 'memo' });
  assert.deepEqual(attempts.slice(1), [
    { event_type: 'memo', holiday_division_id: null }, { event_type: 'memo' },
  ]);
  await assert.rejects(updateCalendarEvent(1, { ...holiday, holiday_division_id: 3 }), { code: 'PGRST204' });
  assert.equal(attempts.length, 4);
  assert.equal(attempts[3].holiday_division_id, 3);
});
