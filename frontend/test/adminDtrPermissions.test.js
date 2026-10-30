import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('the DTR preview exposes correction and audit controls to both administrator roles only', async () => {
  // Render the actual editor while inlining its portal wrapper for server rendering.
  const server = await createServer({
    server: { middlewareMode: true }, appType: 'custom', logLevel: 'error',
    plugins: [{
      name: 'inline-modal-for-server-test', enforce: 'pre',
      transform(code, id) {
        if (!id.replaceAll('\\', '/').endsWith('/components/common/Modal.jsx')) return;
        return `import { createElement, Fragment } from 'react';
          export default function Modal({isOpen, title, children, footer}) {
            return isOpen ? createElement(Fragment, null, title, children, footer) : null;
          }`;
      },
    }],
  });
  try {
    const { default: Preview } = await server.ssrLoadModule('/src/components/dtr/DTRPreviewModal.jsx');
    for (const role of ['admin', 'superadmin', 'supervisor', 'intern']) {
      const html = renderToStaticMarkup(createElement(Preview, {
        isOpen: true, onClose() {}, currentUser: { id: 10, role },
        record: { date: '2026-10-29', time_in: '08:00', time_out: '17:00', status: 'approved' },
        intern: { id: 7, full_name: 'Test Intern' },
      }));
      const permitted = ['admin', 'superadmin'].includes(role);
      assert.equal(html.includes('DTR Record Correction'), permitted, `${role}: correction`);
      assert.equal(html.includes('View Audit History'), permitted, `${role}: history`);
    }
    const { default: BatchEditor } = await server.ssrLoadModule('/src/components/dtr/DTRBatchAlterModal.jsx');
    const editor = renderToStaticMarkup(createElement(BatchEditor, {
      isOpen: true, onClose() {}, intern: { id: 7, full_name: 'Test Intern' }, selectedDates: ['2026-10-29'],
    }));
    assert.match(editor, /id="dtr-official-time-out" type="time"/);
    assert.match(editor, /id="dtr-official-time-in" type="time"/);
    assert.ok(editor.includes('Official Time Out'));
    assert.ok(!editor.includes('(24-hour)'));
    assert.ok(editor.includes('Edit either time independently.'));
    assert.ok(editor.includes('Saved corrections are automatically approved.'));
    assert.ok(!editor.includes('Approval Status'));
  } finally { await server.close(); }
});
