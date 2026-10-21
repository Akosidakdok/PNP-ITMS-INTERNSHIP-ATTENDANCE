import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWeeklyTimelineReport, getWeeklyTimelinePermissions } from '../src/utils/projectWeeklyTimeline.js';

const validReport = () => ({
  start_date: '2026-08-10',
  end_date: '2026-10-14',
  weeks: Array.from({ length: 10 }, (_, index) => ({
    week: index + 1,
    focus: '',
    accomplishments: '',
    status: 'Not Started',
  })),
});

test('normalizes ten weekly entries and preserves blank drafts', () => {
  const report = normalizeWeeklyTimelineReport(validReport());
  assert.equal(report.weeks.length, 10);
  assert.deepEqual(report.weeks[0], {
    week: 1,
    focus: '',
    accomplishments: '',
    status: 'Not Started',
  });
});

test('rejects missing dates, invalid calendar dates, and reversed date ranges', () => {
  assert.throws(() => normalizeWeeklyTimelineReport({ ...validReport(), start_date: '' }), /Start date is required/);
  assert.throws(() => normalizeWeeklyTimelineReport({ ...validReport(), start_date: '2026-02-30' }), /valid date/);
  assert.throws(() => normalizeWeeklyTimelineReport({ ...validReport(), start_date: '2026-10-15' }), /on or before/);
});

test('rejects incomplete week lists and unsupported statuses', () => {
  assert.throws(() => normalizeWeeklyTimelineReport({ ...validReport(), weeks: validReport().weeks.slice(0, 9) }), /exactly 10 weeks/);
  const weeks = validReport().weeks;
  weeks[4].status = 'Finished';
  assert.throws(() => normalizeWeeklyTimelineReport({ ...validReport(), weeks }), /invalid status/);
});

test('allows report reads by visible users but limits editing and export by role', () => {
  assert.deepEqual(getWeeklyTimelinePermissions({ canView: true, account: { role: 'supervisor' }, isMember: false, isLeader: false }), {
    canRead: true, canEdit: false, canExport: false,
  });
  assert.equal(getWeeklyTimelinePermissions({ canView: true, account: { role: 'intern' }, isMember: true }).canEdit, true);
  assert.equal(getWeeklyTimelinePermissions({ canView: true, account: { role: 'intern' }, isMember: false, isLeader: false }).canEdit, false);
  assert.equal(getWeeklyTimelinePermissions({ canView: true, project: { archived_at: '2026-10-21' }, account: { role: 'intern' }, isMember: true }).canRead, false);
  assert.equal(getWeeklyTimelinePermissions({ canView: true, project: { archived_at: '2026-10-21' }, account: { role: 'intern' }, isMember: true }).canEdit, false);
  assert.equal(getWeeklyTimelinePermissions({ canView: true, account: { role: 'admin' } }).canExport, true);
  assert.equal(getWeeklyTimelinePermissions({ canView: true, account: { role: 'superadmin' } }).canExport, true);
});
