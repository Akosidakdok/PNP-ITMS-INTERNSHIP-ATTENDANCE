import test from 'node:test';
import assert from 'node:assert/strict';
import { createWeeklyTimelinePdf } from '../src/utils/weeklyTimelinePdf.js';

const makeReport = (overrides = {}) => ({
  start_date: '2026-08-10',
  end_date: '2026-10-14',
  weeks: Array.from({ length: 10 }, (_, index) => ({
    week: index + 1,
    focus: '',
    accomplishments: '',
    status: 'Not Started',
  })),
  ...overrides,
});

test('creates a report with all ten weeks and blank draft values', () => {
  const pdf = createWeeklyTimelinePdf('P-IDTMS', makeReport());
  const pageText = pdf.internal.pages.flat().join(' ');
  assert.equal(pdf.internal.getNumberOfPages(), 1);
  assert.match(pageText, /Week 10/);
  assert.match(pageText, /Not Started/);
  assert.match(pageText, /Aug 10, 2026/);
});

test('flows long weekly text across PDF pages and retains later weeks', () => {
  const longText = 'Detailed accomplishment item. '.repeat(1400);
  const report = makeReport({
    weeks: makeReport().weeks.map((week, index) => ({
      ...week,
      focus: index === 0 ? longText : week.focus,
      accomplishments: index === 0 ? longText : week.accomplishments,
    })),
  });
  const pdf = createWeeklyTimelinePdf('P-IDTMS', report);
  const pageText = pdf.internal.pages.flat().join(' ');
  assert.ok(pdf.internal.getNumberOfPages() > 1);
  assert.match(pageText, /Week 10/);
});
