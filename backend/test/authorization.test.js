import test, { after } from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL ||= 'http://authorization.test';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key';

const { supabase } = await import('../src/supabaseClient.js');
const {
  assertSupervisorCanAccessIntern,
  assertSupervisorCanAccessInterns,
  assertSupervisorCanAccessResource,
} = await import('../src/authorization.js');

const originalFrom = supabase.from.bind(supabase);
after(() => {
  supabase.from = originalFrom;
});

function fakeFrom({ supervisor, interns = [], resources = {} }) {
  return table => {
    const equalFilters = [];
    let inFilter = null;

    const resolveResult = () => {
      if (table === 'accounts') {
        const roleFilter = equalFilters.find(([column]) => column === 'role')?.[1];
        if (roleFilter === 'supervisor') {
          return { data: supervisor || null, error: null };
        }
        if (roleFilter === 'intern' && inFilter?.[0] === 'id') {
          const requestedIds = new Set(inFilter[1].map(Number));
          return {
            data: interns.filter(intern => requestedIds.has(Number(intern.id))),
            error: null,
          };
        }
      }

      const resourceId = equalFilters.find(([column]) => column === 'id')?.[1];
      const resource = resources[table]?.find(row => Number(row.id) === Number(resourceId));
      return { data: resource || null, error: null };
    };

    const builder = {
      select() {
        return builder;
      },
      eq(column, value) {
        equalFilters.push([column, value]);
        return builder;
      },
      in(column, values) {
        inFilter = [column, values];
        return builder;
      },
      maybeSingle() {
        return Promise.resolve(resolveResult());
      },
      then(resolve, reject) {
        return Promise.resolve(resolveResult()).then(resolve, reject);
      },
    };

    return builder;
  };
}

const supervisorToken = {
  id: 50,
  role: 'supervisor',
  division_id: 999,
};

test('supervisor access uses the current database division and fails closed', async () => {
  supabase.from = fakeFrom({
    supervisor: { id: 50, role: 'supervisor', division_id: 7, status: 'active' },
    interns: [
      { id: 1, division_id: 7 },
      { id: 2, division_id: 8 },
    ],
    resources: {
      evaluations: [
        { id: 100, intern_id: 1 },
        { id: 101, intern_id: 2 },
      ],
    },
  });

  await assert.doesNotReject(
    assertSupervisorCanAccessIntern(supervisorToken, 1, 'intern records')
  );
  await assert.doesNotReject(
    assertSupervisorCanAccessResource(
      supervisorToken,
      'evaluations',
      100,
      'intern evaluations'
    )
  );

  await assert.rejects(
    assertSupervisorCanAccessIntern(supervisorToken, 2, 'intern records'),
    error => error.statusCode === 403
  );
  await assert.rejects(
    assertSupervisorCanAccessIntern(supervisorToken, 999, 'intern records'),
    error => error.statusCode === 403
  );
  await assert.rejects(
    assertSupervisorCanAccessResource(
      supervisorToken,
      'evaluations',
      101,
      'intern evaluations'
    ),
    error => error.statusCode === 403
  );
  await assert.rejects(
    assertSupervisorCanAccessInterns(supervisorToken, [1, 2], 'DTR records'),
    error => error.statusCode === 403
  );
});

test('disabled or unassigned supervisors are denied', async () => {
  supabase.from = fakeFrom({
    supervisor: { id: 50, role: 'supervisor', division_id: 7, status: 'inactive' },
    interns: [{ id: 1, division_id: 7 }],
  });

  await assert.rejects(
    assertSupervisorCanAccessIntern(supervisorToken, 1, 'intern records'),
    error => error.statusCode === 403
  );

  supabase.from = fakeFrom({
    supervisor: { id: 50, role: 'supervisor', division_id: null, status: 'active' },
    interns: [{ id: 1, division_id: 7 }],
  });

  await assert.rejects(
    assertSupervisorCanAccessIntern(supervisorToken, 1, 'intern records'),
    error => error.statusCode === 403
  );
});

test('true administrators bypass supervisor division checks', async () => {
  supabase.from = () => {
    throw new Error('Database should not be queried for administrator bypass');
  };

  await assert.doesNotReject(
    assertSupervisorCanAccessIntern({ id: 1, role: 'admin' }, 999, 'intern records')
  );
  await assert.doesNotReject(
    assertSupervisorCanAccessResource(
      { id: 1, role: 'admin' },
      'documents',
      999,
      'intern documents'
    )
  );
});
