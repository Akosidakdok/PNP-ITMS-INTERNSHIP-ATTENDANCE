import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProjectDateFields } from '../src/services/projectDateFields.js';

test('normalizes optional project start and target dates', () => {
  assert.deepEqual(normalizeProjectDateFields({
    project_start_date: '2026-10-01',
    project_target_date: '2026-12-31',
  }), {
    project_start_date: '2026-10-01',
    project_target_date: '2026-12-31',
  });
});

test('rejects invalid dates and a target date before the start date', () => {
  assert.throws(() => normalizeProjectDateFields({ project_start_date: '2026-02-30' }), /valid date/);
  assert.throws(() => normalizeProjectDateFields({
    project_start_date: '2026-10-02',
    project_target_date: '2026-10-01',
  }), /on or after/);
});

test('validates a one-sided edit against the other saved date', () => {
  assert.throws(() => normalizeProjectDateFields(
    { project_start_date: '2026-12-01' },
    { project_target_date: '2026-11-30' }
  ), /on or after/);
});

