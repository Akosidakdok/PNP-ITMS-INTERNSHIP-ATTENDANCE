import test from 'node:test';
import assert from 'node:assert/strict';
import { createInternFormValues } from '../src/utils/internForm.js';

test('opening an existing intern only copies editable fields into the form', () => {
  const defaults = { first_name: '', last_name: '', email: '', required_hours: 300 };
  const record = {
    id: 42,
    first_name: 'Juan',
    last_name: 'Dela Cruz',
    email: 'juan@example.com',
    required_hours: 400,
    division_head: 'Division Head',
    supervisor_name: 'Supervisor',
    division_name: 'ITMS',
    role: 'intern',
    rendered_hours: 125,
    face_registered: true,
  };

  const form = createInternFormValues(record, defaults);

  assert.deepEqual(form, {
    first_name: 'Juan', last_name: 'Dela Cruz', email: 'juan@example.com', required_hours: 400,
  });
  assert.equal(record.division_head, 'Division Head', 'The source record stays intact for display');
});

test('missing and null values use form defaults while zero and empty values are retained', () => {
  const defaults = { phone: '', required_hours: 300, status: 'active', start_date: '' };

  assert.deepEqual(createInternFormValues({ phone: '', required_hours: 0, start_date: null }, defaults), {
    phone: '', required_hours: 0, status: 'active', start_date: '',
  });
});

test('editing initialized values does not change the intern record or form defaults', () => {
  const record = { first_name: 'Juan', supervisor_name: 'Supervisor' };
  const defaults = { first_name: '' };
  const form = createInternFormValues(record, defaults);
  form.first_name = 'Pedro';

  assert.equal(record.first_name, 'Juan');
  assert.equal(defaults.first_name, '');
  assert.deepEqual(form, { first_name: 'Pedro' });
});
