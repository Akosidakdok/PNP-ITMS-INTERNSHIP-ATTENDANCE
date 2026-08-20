import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), 'utf8');
}

test('new intern creation grants one-time self face enrollment', async () => {
  const source = await read('../src/data.js');

  assert.match(
    source,
    /role:\s*INTERN_ROLE,[\s\S]*self_face_enrollment_available:\s*true/
  );
  assert.match(
    source,
    /self_face_enrollment_available:\s*_selfFaceEnrollmentAvailable/
  );
});

test('self enrollment migration denies legacy accounts and consumes the grant atomically', async () => {
  const migration = await read('../db/migration_one_time_self_face_enrollment.sql');

  assert.match(
    migration,
    /self_face_enrollment_available boolean NOT NULL DEFAULT false/i
  );
  assert.match(
    migration,
    /v_actor\.id IS DISTINCT FROM v_intern\.id[\s\S]*OR NOT v_intern\.self_face_enrollment_available/
  );
  assert.match(
    migration,
    /face_registered = true,[\s\S]*self_face_enrollment_available = false/
  );
  assert.match(migration, /FOR UPDATE/);
});

test('intern self enrollment endpoint checks eligibility before registration', async () => {
  const source = await read('../src/index.js');
  const route = source.match(
    /app\.post\('\/interns\/register-face'[\s\S]*?\n\}\);/
  )?.[0] || '';

  assert.match(route, /req\.user\.role !== 'intern'/);
  assert.match(route, /intern\.status !== 'active'/);
  assert.match(route, /intern\.face_registered \|\| !intern\.self_face_enrollment_available/);
  assert.match(route, /actorId:\s*req\.user\.id/);
});
