import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

process.env.SUPABASE_URL ||= 'http://authorization.test';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key';

const { supabase } = await import('../src/supabaseClient.js');
const {
  assertSupervisorCanAccessIntern,
  assertSupervisorCanAccessInterns,
  assertSupervisorCanAccessResource,
  assertCanUpdateProject,
  assertCanDeleteProject,
  assertCanUploadProjectFile,
  assertCanDeleteProjectFile,
  getProjectAccessFlags,
  sanitizeProjectUpdatePayload,
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
        if (roleFilter === 'intern') {
          const accountId = equalFilters.find(([column]) => column === 'id')?.[1];
          return {
            data: interns.find(intern => Number(intern.id) === Number(accountId)) || null,
            error: null,
          };
        }
        const accountId = equalFilters.find(([column]) => column === 'id')?.[1];
        if (accountId !== undefined) {
          const account = [supervisor, ...interns]
            .filter(Boolean)
            .find(item => Number(item.id) === Number(accountId));
          return { data: account || null, error: null };
        }
      }

      if (table === 'project_members') {
        const projectId = equalFilters.find(([column]) => column === 'project_id')?.[1];
        return {
          data: (resources.project_members || []).filter(
            row => Number(row.project_id) === Number(projectId)
          ),
          error: null,
        };
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
      is() {
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

test('project access flags distinguish leaders, members, and scoped staff', () => {
  const project = {
    id: 10,
    leader_id: 1,
    division_id: 7,
    members: [{ id: 1 }, { id: 2 }, { id: 'custom_name' }],
  };

  const leader = getProjectAccessFlags({ id: 1, role: 'intern' }, project);
  const member = getProjectAccessFlags({ id: 2, role: 'intern' }, project);
  const unrelated = getProjectAccessFlags({ id: 3, role: 'intern' }, project);
  const scopedSupervisor = getProjectAccessFlags({ id: 50, role: 'supervisor' }, project, 7);
  const otherSupervisor = getProjectAccessFlags({ id: 51, role: 'supervisor' }, project, 8);

  assert.equal(leader.canDelete, false);
  assert.equal(leader.canArchive, true);
  assert.equal(member.canUpdate, true);
  assert.equal(member.canDelete, false);
  assert.equal(unrelated.canUpload, false);
  assert.equal(scopedSupervisor.isStaff, true);
  assert.equal(otherSupervisor.canUpdate, false);
});

test('member project updates cannot change team ownership or division', () => {
  const payload = {
    title: 'Updated title',
    progress: 75,
    members: [{ id: 999 }],
    leader_id: 999,
    division_id: 99,
    unexpected_column: 'blocked',
  };

  assert.deepEqual(
    sanitizeProjectUpdatePayload(payload, {
      canEditDetails: false,
      canUpdateProgress: true,
      canManageTeam: false,
    }),
    { progress: 75 }
  );

  assert.deepEqual(
    sanitizeProjectUpdatePayload(payload, {
      canEditDetails: true,
      canUpdateProgress: true,
      canManageTeam: true,
      canChangeDivision: true,
      canReassignLeader: true,
    }),
    {
      title: 'Updated title',
      progress: 75,
      members: [{ id: 999 }],
      division_id: 99,
      leader_id: 999,
    }
  );

  assert.deepEqual(
    sanitizeProjectUpdatePayload(payload, {
      canEditDetails: true,
      canUpdateProgress: true,
      canManageTeam: true,
      canChangeDivision: false,
      canReassignLeader: false,
    }),
    {
      title: 'Updated title',
      progress: 75,
      members: [{ id: 999 }],
    }
  );
});

test('project mutations enforce member and supervisor scope', async () => {
  const project = {
    id: 10,
    leader_id: 1,
    division_id: 7,
    members: [{ id: 1 }, { id: 2 }],
  };

  supabase.from = fakeFrom({
    supervisor: { id: 50, role: 'supervisor', division_id: 7, status: 'active' },
    interns: [
      { id: 1, role: 'intern', division_id: 7, status: 'active' },
      { id: 2, role: 'intern', division_id: 7, status: 'active' },
      { id: 3, role: 'intern', division_id: 7, status: 'active' },
    ],
    resources: {
      intern_projects: [project],
      project_members: [
        { project_id: 10, account_id: 1 },
        { project_id: 10, account_id: 2 },
      ],
    },
  });

  await assert.doesNotReject(assertCanUpdateProject({ id: 2, role: 'intern' }, 10));
  await assert.doesNotReject(assertCanUploadProjectFile({ id: 2, role: 'intern' }, 10));
  await assert.rejects(
    assertCanDeleteProject({ id: 2, role: 'intern' }, 10),
    error => error.statusCode === 403
  );
  await assert.rejects(
    assertCanUpdateProject({ id: 3, role: 'intern' }, 10),
    error => error.statusCode === 403
  );
  await assert.rejects(
    assertCanDeleteProject(supervisorToken, 10),
    error => error.statusCode === 403
  );
});

test('project file deletion validates the route project and file ownership', async () => {
  supabase.from = fakeFrom({
    interns: [
      { id: 1, role: 'intern', division_id: 7, status: 'active' },
      { id: 2, role: 'intern', division_id: 7, status: 'active' },
    ],
    resources: {
      intern_projects: [{ id: 10, leader_id: 1, division_id: 7, members: [{ id: 2 }] }],
      project_members: [{ project_id: 10, account_id: 2 }],
      project_files: [{ id: 20, project_id: 10, uploaded_by: 2 }],
    },
  });

  await assert.doesNotReject(
    assertCanDeleteProjectFile({ id: 2, role: 'intern' }, 10, 20)
  );
  await assert.rejects(
    assertCanDeleteProjectFile({ id: 2, role: 'intern' }, 999, 20),
    error => error.statusCode === 404
  );
});

test('project authorization migration removes broad mutation policies', async () => {
  const migration = await readFile(
    new URL('../db/migration_project_authorization.sql', import.meta.url),
    'utf8'
  );

  assert.match(migration, /drop policy if exists "Allow all authenticated users to manage projects"/);
  assert.match(migration, /create policy "Authorized users can update projects"/);
  assert.match(migration, /project\.division_id = me\.division_id/);
  assert.match(migration, /project_files\.uploaded_by = me\.id/);
  assert.doesNotMatch(migration, /for all to authenticated using \(true\)/);
});

test('project access-model migration normalizes teams and removes global reads', async () => {
  const migration = await readFile(
    new URL('../db/migration_project_access_model.sql', import.meta.url),
    'utf8'
  );

  assert.match(migration, /create table if not exists public\.project_members/i);
  assert.match(migration, /create table if not exists public\.project_contributors/i);
  assert.match(migration, /create table if not exists public\.project_audit_log/i);
  assert.match(migration, /drop policy if exists "Allow all authenticated users to read projects"/i);
  assert.match(migration, /create policy "Role scoped project reads"/i);
  assert.match(migration, /update storage\.buckets[\s\S]*set public = false/i);
  assert.doesNotMatch(migration, /^4--/);
});

test('project API uses the scoped service instead of legacy global data helpers', async () => {
  const indexSource = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
  const serviceSource = await readFile(
    new URL('../src/services/projectService.js', import.meta.url),
    'utf8'
  );

  assert.match(indexSource, /getProjects\([\s\S]*req\.user\)/);
  assert.match(indexSource, /getProjectById\(id, req\.user\)/);
  assert.match(serviceSource, /from\('project_members'\)[\s\S]*eq\('account_id', accountId\)/);
  assert.match(serviceSource, /createSignedUrl\(path, SIGNED_URL_TTL_SECONDS\)/);
  assert.doesNotMatch(serviceSource, /getPublicUrl/);
});
