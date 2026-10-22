import test from 'node:test';
import assert from 'node:assert/strict';
import { createWeeklyTimelinePdf } from '../src/utils/weeklyTimelinePdf.js';
import { getWeeklyTimelineStatusStyle } from '../src/utils/weeklyTimelineStatus.js';

test('maps weekly statuses to distinct, readable colors', () => {
  assert.deepEqual(getWeeklyTimelineStatusStyle('Not Started'), {
    controlClass: 'border-slate-200 bg-slate-100 text-slate-700',
    pdfBackground: [241, 245, 249],
    pdfText: [51, 65, 85],
  });
  assert.deepEqual(getWeeklyTimelineStatusStyle('In Progress'), {
    controlClass: 'border-blue-200 bg-blue-50 text-blue-700',
    pdfBackground: [219, 234, 254],
    pdfText: [29, 78, 216],
  });
  assert.deepEqual(getWeeklyTimelineStatusStyle('Completed'), {
    controlClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    pdfBackground: [209, 250, 229],
    pdfText: [4, 120, 87],
  });
  assert.deepEqual(getWeeklyTimelineStatusStyle('Blocked'), {
    controlClass: 'border-rose-200 bg-rose-50 text-rose-700',
    pdfBackground: [255, 228, 230],
    pdfText: [190, 18, 60],
  });
  assert.equal(getWeeklyTimelineStatusStyle('Unknown').controlClass, 'border-slate-200 bg-slate-100 text-slate-700');
});

test('keeps the export A4 portrait and colors the PDF status badge', () => {
  const pdf = createWeeklyTimelinePdf('P-IDTMS', {
    start_date: '2026-08-10',
    end_date: '2026-10-18',
    weeks: [{ status: 'Completed' }],
  });
  const page = pdf.internal.pages[1].join(' ');

  assert.equal(Math.round(pdf.internal.pageSize.getWidth()), 210);
  assert.equal(Math.round(pdf.internal.pageSize.getHeight()), 297);
  assert.match(page, /0\.82 0\.98 0\.9 rg/);
  assert.match(page, /Completed/);
});
