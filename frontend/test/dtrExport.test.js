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
    for (const [timeIn, timeOut, expectedIn, expectedOut] of [
      ['07:30:00', '18:00:00', '8:00 AM', '5:00 PM'],
      ['08:00:01', '16:59:59', '8:00:01 AM', '4:59:59 PM'],
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
      assert.ok(!html.includes('7:30 AM'));
      assert.ok(!html.includes('6:00 PM'));
    }
  } finally {
    await server.close();
  }
});
