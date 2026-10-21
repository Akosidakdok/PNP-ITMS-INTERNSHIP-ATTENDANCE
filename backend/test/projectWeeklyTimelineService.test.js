import test, { after } from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL ||= 'http://weekly-timeline.test';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key';

const { supabase } = await import('../src/supabaseClient.js');
const { getProjectWeeklyTimeline, saveProjectWeeklyTimeline } = await import('../src/services/projectWeeklyTimelineService.js');
const originalFrom = supabase.from.bind(supabase);
after(() => { supabase.from = originalFrom; });

const project = {
  id: 51,
  title: 'Weekly Report Project',
  division_id: 8,
  leader_id: 10,
  archived_at: null,
};
const accounts = {
  10: { id: 10, role: 'intern', full_name: 'Assigned Intern', division_id: 8, status: 'active' },
  20: { id: 20, role: 'intern', full_name: 'Other Intern', division_id: 8, status: 'active' },
  30: { id: 30, role: 'admin', full_name: 'Admin', division_id: null, status: 'active' },
  40: { id: 40, role: 'supervisor', full_name: 'Supervisor', division_id: 8, status: 'active' },
};
const reportPayload = () => ({
  start_date: '2026-08-10',
  end_date: '2026-10-14',
  weeks: Array.from({ length: 10 }, (_, index) => ({
    week: index + 1,
    focus: index === 0 ? 'System analysis' : '',
    accomplishments: '',
    status: index === 0 ? 'In Progress' : 'Not Started',
  })),
});

function installDatabaseStub(projectOverrides = {}) {
  let savedReport = null;
  supabase.from = table => {
    let writeData = null;
    let writeMode = null;
    const filters = {};
    const result = () => {
      if (table === 'intern_projects') return { data: { ...project, ...projectOverrides }, error: null };
      if (table === 'accounts') {
        const requestedId = Object.entries(accounts).find(([, account]) => account.id === (builder.accountId || builder.userId))?.[0];
        return { data: accounts[requestedId] || accounts[builder.accountId], error: null };
      }
      if (table === 'project_members') return { data: [], error: null };
      if (table === 'project_weekly_timeline_reports') {
        if (writeMode === 'insert') {
          if (savedReport) return { data: null, error: { code: '23505', message: 'duplicate report' } };
          savedReport = {
            ...writeData,
            revision: 1,
            created_at: savedReport?.created_at || '2026-10-21T00:00:00.000Z',
            updated_at: '2026-10-21T00:00:00.000Z',
          };
          return { data: savedReport, error: null };
        }
        if (writeMode === 'update') {
          if (!savedReport || savedReport.revision !== filters.revision) return { data: null, error: null };
          savedReport = { ...savedReport, ...writeData };
          return { data: savedReport, error: null };
        }
        return { data: savedReport, error: null };
      }
      return { data: null, error: null };
    };
    const builder = {
      select() { return builder; },
      eq(column, value) {
        if (table === 'accounts' && column === 'id') builder.accountId = Number(value);
        if (table === 'project_weekly_timeline_reports') filters[column] = Number(value);
        return builder;
      },
      is() { return builder; },
      maybeSingle() { return Promise.resolve(result()); },
      single() { return Promise.resolve(result()); },
      insert(value) { writeMode = 'insert'; writeData = value; return builder; },
      update(value) { writeMode = 'update'; writeData = value; return builder; },
      then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
    };
    return builder;
  };
  return { read: () => savedReport };
}

test('assigned intern can save a shared report and read it back', async () => {
  const database = installDatabaseStub();
  const saved = await saveProjectWeeklyTimeline(51, { id: 10, role: 'intern' }, {
    ...reportPayload(), expected_revision: 0,
  });
  const loaded = await getProjectWeeklyTimeline(51, { id: 10, role: 'intern' });
  assert.equal(database.read().project_id, 51);
  assert.equal(saved.weeks.length, 10);
  assert.equal(saved.end_date, '2026-10-18');
  assert.equal(loaded.revision, 1);
  assert.equal(loaded.start_date, '2026-08-10');
  assert.equal(loaded.end_date, '2026-10-18');
  assert.equal(loaded.weeks[0].focus, 'System analysis');
});

test('rejects a stale intern update without overwriting the latest shared report', async () => {
  const database = installDatabaseStub();
  await saveProjectWeeklyTimeline(51, { id: 10, role: 'intern' }, {
    ...reportPayload(), expected_revision: 0,
  });
  const stale = reportPayload();
  stale.weeks[0].focus = 'Stale edit';
  await assert.rejects(
    saveProjectWeeklyTimeline(51, { id: 10, role: 'intern' }, { ...stale, expected_revision: 0 }),
    error => error.statusCode === 409
  );
  assert.equal(database.read().weeks[0].focus, 'System analysis');
});

test('assigned intern can update the latest report revision', async () => {
  const database = installDatabaseStub();
  const first = await saveProjectWeeklyTimeline(51, { id: 10, role: 'intern' }, {
    ...reportPayload(), expected_revision: 0,
  });
  const updated = reportPayload();
  updated.weeks[0].focus = 'Updated focus';
  const saved = await saveProjectWeeklyTimeline(51, { id: 10, role: 'intern' }, {
    ...updated, expected_revision: first.revision,
  });
  assert.equal(saved.revision, 2);
  assert.equal(database.read().weeks[0].focus, 'Updated focus');
});

test('nonmember intern cannot save a weekly report', async () => {
  installDatabaseStub();
  await assert.rejects(
    saveProjectWeeklyTimeline(51, { id: 20, role: 'intern' }, reportPayload()),
    error => error.statusCode === 403
  );
});

test('intern outside the project cannot read its weekly report', async () => {
  installDatabaseStub();
  await assert.rejects(
    getProjectWeeklyTimeline(51, { id: 20, role: 'intern' }),
    error => error.statusCode === 403
  );
});

test('intern cannot read or save a report for a project hidden by archive visibility', async () => {
  installDatabaseStub({ archived_at: '2026-10-20T00:00:00.000Z' });
  await assert.rejects(
    getProjectWeeklyTimeline(51, { id: 10, role: 'intern' }),
    error => error.statusCode === 403
  );
  await assert.rejects(
    saveProjectWeeklyTimeline(51, { id: 10, role: 'intern' }, { ...reportPayload(), expected_revision: 0 }),
    error => error.statusCode === 403
  );
});

test('admin can use export endpoint while supervisor export is denied', async () => {
  installDatabaseStub();
  assert.equal(await getProjectWeeklyTimeline(51, { id: 30, role: 'admin' }, { forExport: true }), null);
  await assert.rejects(
    getProjectWeeklyTimeline(51, { id: 40, role: 'supervisor' }, { forExport: true }),
    error => error.statusCode === 403
  );
});
