import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCalendarRange } from '../src/utils/calendarEvents.js';

function monthlyApi(events, requests) {
  return async (year, month) => {
    // Match the existing API contract that rejected the range-only request.
    assert.ok(Number.isInteger(year));
    assert.ok(Number.isInteger(month) && month >= 1 && month <= 12);
    requests.push({ year, month });
    const prefix = `${year}-${String(month).padStart(2, '0')}-`;
    return events.filter(event => event.start.startsWith(prefix));
  };
}

test('visible calendar includes adjacent months using year and month queries', async () => {
  const requests = [];
  const events = [
    { id: 1, start: '2026-09-26' },
    { id: 2, start: '2026-09-27' },
    { id: 3, start: '2026-10-02' },
    { id: 4, start: '2026-11-07' },
    { id: 5, start: '2026-11-08' },
  ];
  const result = await loadCalendarRange(monthlyApi(events, requests), '2026-09-27', '2026-11-08');

  assert.deepEqual(requests, [
    { year: 2026, month: 9 },
    { year: 2026, month: 10 },
    { year: 2026, month: 11 },
  ]);
  assert.deepEqual(result.map(event => event.id), [2, 3, 4]);
});

test('month queries cross the year boundary without month zero or thirteen', async () => {
  const requests = [];
  const events = [{ id: 1, start: '2026-12-31' }, { id: 2, start: '2027-01-01' }];
  const result = await loadCalendarRange(monthlyApi(events, requests), '2026-12-27', '2027-02-07');

  assert.deepEqual(requests, [
    { year: 2026, month: 12 },
    { year: 2027, month: 1 },
    { year: 2027, month: 2 },
  ]);
  assert.deepEqual(result, events);
});

test('exclusive end at the start of a month does not fetch the extra month', async () => {
  const requests = [];
  const events = [{ id: 1, start: '2024-02-29' }, { id: 2, start: '2024-03-01' }];
  const result = await loadCalendarRange(monthlyApi(events, requests), '2024-02-01', '2024-03-01');

  assert.deepEqual(requests, [{ year: 2024, month: 2 }]);
  assert.deepEqual(result.map(event => event.id), [1]);
});

test('an empty calendar returns an empty event list', async () => {
  assert.deepEqual(await loadCalendarRange(async () => [], '2026-10-01', '2026-11-01'), []);
});

test('a failed month rejects the load instead of displaying a partial calendar', async () => {
  const error = new Error('Calendar service unavailable');
  await assert.rejects(
    loadCalendarRange(async (year, month) => {
      if (month === 10) throw error;
      return [{ id: 1, start: '2026-09-27' }];
    }, '2026-09-27', '2026-11-08'),
    failure => failure === error,
  );
});
