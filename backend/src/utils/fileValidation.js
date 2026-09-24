import path from 'node:path';

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/x-zip-compressed',
  'text/plain',
  'text/csv',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

export function validateUploadFile(file) {
  if (!file) {
    const error = new Error('File upload is required');
    error.statusCode = 400;
    throw error;
  }
  if (!Number.isFinite(Number(file.size)) || Number(file.size) <= 0) {
    const error = new Error('Uploaded file is empty');
    error.statusCode = 400;
    throw error;
  }
  if (Number(file.size) > MAX_UPLOAD_BYTES) {
    const error = new Error('File exceeds the 25 MB upload limit');
    error.statusCode = 413;
    throw error;
  }
  if (!ALLOWED_UPLOAD_MIME_TYPES.has(String(file.mimetype || '').toLowerCase())) {
    const error = new Error('Unsupported file type');
    error.statusCode = 415;
    throw error;
  }

  const originalName = String(file.originalname || '').trim();
  const extension = path.extname(originalName).slice(1).toLowerCase();
  if (!originalName || !extension || extension.length > 10) {
    const error = new Error('Uploaded file must have a valid filename');
    error.statusCode = 400;
    throw error;
  }

  return { originalName, extension };
}
