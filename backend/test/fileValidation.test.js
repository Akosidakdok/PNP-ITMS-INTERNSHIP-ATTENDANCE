import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_UPLOAD_BYTES, validateUploadFile } from '../src/utils/fileValidation.js';

const validFile = (overrides = {}) => ({
  originalname: 'attendance.pdf',
  mimetype: 'application/pdf',
  size: 1024,
  ...overrides,
});

test('upload validation accepts supported files and normalizes the extension', () => {
  assert.deepEqual(validateUploadFile(validFile({ originalname: 'Attendance.PDF' })), {
    originalName: 'Attendance.PDF',
    extension: 'pdf',
  });
});

test('upload validation rejects empty, oversized, and unsupported files', () => {
  assert.throws(() => validateUploadFile(validFile({ size: 0 })), error => error.statusCode === 400);
  assert.throws(() => validateUploadFile(validFile({ size: MAX_UPLOAD_BYTES + 1 })), error => error.statusCode === 413);
  assert.throws(() => validateUploadFile(validFile({ mimetype: 'application/x-executable' })), error => error.statusCode === 415);
});
