import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateWeeklyTimelineEndDate } from '../src/utils/weeklyTimelineDates.js';

test('calculates an inclusive ten-week reporting window', () => {
  assert.equal(calculateWeeklyTimelineEndDate('2026-08-10'), '2026-10-18');
});

test('calculates the end date across a year boundary', () => {
  assert.equal(calculateWeeklyTimelineEndDate('2026-11-20'), '2027-01-28');
});

test('leaves the end date blank until a valid start date is selected', () => {
  assert.equal(calculateWeeklyTimelineEndDate(''), '');
  assert.equal(calculateWeeklyTimelineEndDate('2026-02-30'), '');
});
