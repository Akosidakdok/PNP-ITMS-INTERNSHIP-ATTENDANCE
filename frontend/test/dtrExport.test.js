import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { buildDtrRecords } from '../../backend/src/utils/dtrRecords.js';

test('the actual DTR print/export template renders processed times and preserves seconds', async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
  try {
    const { default: DTRTable } = await server.ssrLoadModule('/src/components/dtr/DTRTable.jsx');
    for (const [timeIn, timeOut, expectedIn, expectedOut, duration] of [
      ['07:30:00', '18:00:00', '8:00 AM', '5:00 PM', '8h 00m'],
      ['08:00:01', '16:59:59', '8:00:01 AM', '4:59:59 PM', '7h 59m'],
      ['08:00:00', '19:00:00', '8:00 AM', '7:00 PM', '10h 00m'],
      ['08:00:00', '20:00:00', '8:00 AM', '8:00 PM', '11h 00m'],
    ]) {
      const records = buildDtrRecords([
        { scan_type: 'time_in', scan_time: `2026-10-26T${timeIn}+08:00`, approval_status: 'approved' },
        { scan_type: 'time_out', scan_time: `2026-10-26T${timeOut}+08:00`, approval_status: 'approved',
          ...(Number(timeOut.slice(0, 2)) >= 19 && {
            recorded_scan_time: `2026-10-26T${timeOut}+08:00`, adjustment_mode: 'manual',
          }),
        },
      ]);
      const html = renderToStaticMarkup(createElement(DTRTable, {
        records, month: 10, year: 2026, exportMode: true, intern: { full_name: 'Test Intern' },
      }));
      assert.ok(html.includes(expectedIn), `Export must contain ${expectedIn}`);
      assert.ok(html.includes(expectedOut), `Export must contain ${expectedOut}`);
      assert.ok(html.includes(duration), `Export must contain ${duration}`);
      assert.ok(!html.includes('7:30 AM'));
    }
    const corrected = buildDtrRecords([
      { id: 777, scan_type: 'time_in', scan_time: '2026-10-29T09:14:13.783Z',
        original_scan_time: '2026-10-29T09:14:13.783Z', actual_scan_time: '2026-10-28T23:59:18Z',
        recorded_scan_time: '2026-10-29T00:00:00Z', adjustment_mode: 'manual', approval_status: 'approved' },
      { id: 786, scan_type: 'time_out', scan_time: '2026-10-29T09:00:00Z', actual_scan_time: null,
        recorded_scan_time: '2026-10-29T09:00:00Z', approval_status: 'approved' },
    ]);
    const correctedHtml = renderToStaticMarkup(createElement(DTRTable, {
      records: corrected, month: 10, year: 2026, exportMode: true, intern: { full_name: 'Test Intern' },
    }));
    assert.ok(correctedHtml.includes('5:00 PM'));
    assert.ok(correctedHtml.includes('8h 00m'));
    assert.ok(!correctedHtml.includes('Incomplete'));
    assert.ok(!correctedHtml.includes('Pending'));

    const holidayEvents = [{ title: 'City Foundation Day', event_type: 'holiday', event_date: '2026-10-26', holiday_division_id: 3 }];
    const records = buildDtrRecords([
      { scan_type: 'time_in', scan_time: '2026-10-26T08:00:00+08:00', approval_status: 'approved' },
      { scan_type: 'time_out', scan_time: '2026-10-26T17:00:00+08:00', approval_status: 'approved' },
    ], { holidayEvents, divisionId: 3 });
    const holidayHtml = renderToStaticMarkup(createElement(DTRTable, {
      records, month: 10, year: 2026, exportMode: true, intern: { full_name: 'Test Intern' },
    }));
    assert.match(holidayHtml, /HOLIDAY: CITY FOUNDATION DAY · 00:00/);
    assert.ok(!holidayHtml.includes('8h 00m'));

    const legacyRecords = [1, 2].map(day => ({
      date: `2026-11-0${day}`, is_override: true, override_type: 'holiday',
      override_remarks: 'Special Non-Working Holiday', approval_status: 'approved',
      total_minutes: 480, approved_minutes: 480, worked_minutes: 480,
    }));
    const legacyHtml = renderToStaticMarkup(createElement(DTRTable, {
      records: legacyRecords, month: 11, year: 2026, exportMode: true, isSelectable: true,
      selectedDates: ['2026-11-02'], intern: { full_name: 'Test Intern' },
    }));
    for (const [day, color] of [[1, '#fef9c3'], [2, '#fef08a']]) {
      const row = legacyHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/g).find(html => html.includes(`11/0${day}/2026`));
      assert.match(row, /HOLIDAY: SPECIAL NON-WORKING HOLIDAY · 00:00/);
      assert.equal(row.split(`background-color:${color}`).length - 1, 2, 'date and label use the same highlight');
    }
    assert.ok(!legacyHtml.includes('8h 00m'));
  } finally {
    await server.close();
  }
});
