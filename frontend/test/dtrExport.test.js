import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { buildDtrRecords } from '../../backend/src/utils/dtrRecords.js';

test('the actual DTR print/export template renders processed times and preserves seconds', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
  try {
    const { default: DTRTable } = await server.ssrLoadModule('/src/components/dtr/DTRTable.jsx');
    for (const [timeIn, timeOut, expectedIn, expectedOut, duration] of [
      ['07:30:00', '18:00:00', '8:00 AM', '6:00 PM', '9h 00m'],
      ['08:00:01', '16:59:59', '8:00:01 AM', '4:59:59 PM', '7h 59m'],
      ['08:00:00', '19:00:00', '8:00 AM', '7:00 PM', '10h 00m'],
      ['08:00:00', '20:00:00', '8:00 AM', '8:00 PM', '11h 00m'],
    ]) {
      const records = buildDtrRecords([
        { scan_type: 'time_in', scan_time: `2026-10-26T${timeIn}+08:00`, approval_status: 'approved' },
        { scan_type: 'time_out', scan_time: `2026-10-26T${timeOut}+08:00`, approval_status: 'approved' },
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
  } finally {
    await server.close();
  }
});
