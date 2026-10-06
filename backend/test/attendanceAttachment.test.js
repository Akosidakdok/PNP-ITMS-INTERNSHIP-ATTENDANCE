import test from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';

dotenv.config();
process.env.SUPABASE_URL ||= 'http://superadmin-attendance.test';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-superadmin-service-role-key';
process.env.JWT_SECRET ||= 'test-jwt-secret';

const { validateAttachmentImage } = await import('../src/services/attendanceAttachmentService.js');
const { superadminMiddleware, adminMiddleware } = await import('../src/middleware.js');

test('validateAttachmentImage accepts valid JPEG buffer under 5 MB', () => {
  const jpegHeader = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
  const file = {
    buffer: jpegHeader,
    size: 1024,
    mimetype: 'image/jpeg',
    originalname: 'proof.jpg',
  };
  assert.equal(validateAttachmentImage(file), true);
});

test('validateAttachmentImage accepts valid PNG buffer under 5 MB', () => {
  const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00]);
  const file = {
    buffer: pngHeader,
    size: 2048,
    mimetype: 'image/png',
    originalname: 'proof.png',
  };
  assert.equal(validateAttachmentImage(file), true);
});

test('validateAttachmentImage accepts valid WEBP buffer under 5 MB', () => {
  // RIFF .... WEBP
  const webpHeader = Buffer.from([
    0x52, 0x49, 0x46, 0x46, // RIFF
    0x24, 0x00, 0x00, 0x00, // file size bytes
    0x57, 0x45, 0x42, 0x50, // WEBP
  ]);
  const file = {
    buffer: webpHeader,
    size: 4096,
    mimetype: 'image/webp',
    originalname: 'proof.webp',
  };
  assert.equal(validateAttachmentImage(file), true);
});

test('validateAttachmentImage rejects files exceeding 5 MB', () => {
  const file = {
    buffer: Buffer.from([0xFF, 0xD8, 0xFF]),
    size: 5 * 1024 * 1024 + 1,
    mimetype: 'image/jpeg',
    originalname: 'huge.jpg',
  };
  assert.throws(
    () => validateAttachmentImage(file),
    /Image is too large\. Maximum file size is 5 MB\./
  );
});

test('validateAttachmentImage rejects unsupported MIME types like PDF or GIF', () => {
  const file = {
    buffer: Buffer.from([0x47, 0x49, 0x46, 0x38]),
    size: 1024,
    mimetype: 'image/gif',
    originalname: 'test.gif',
  };
  assert.throws(
    () => validateAttachmentImage(file),
    /Unsupported file format\. Please upload JPG, PNG, or WEBP\./
  );
});

test('validateAttachmentImage rejects spoofed files where magic bytes do not match declared MIME', () => {
  const file = {
    buffer: Buffer.from('NOT A REAL JPEG IMAGE CONTENT'),
    size: 1024,
    mimetype: 'image/jpeg',
    originalname: 'fake.jpg',
  };
  assert.throws(
    () => validateAttachmentImage(file),
    /Unsupported file format\. Please upload JPG, PNG, or WEBP\./
  );
});

test('superadminMiddleware permits superadmin and super_admin, rejects regular admin and intern', () => {
  const createMock = (role) => {
    const req = { user: role ? { id: 1, role } : null };
    let status = null;
    let jsonBody = null;
    let nextCalled = false;
    const res = {
      status(code) { status = code; return this; },
      json(data) { jsonBody = data; return this; },
    };
    const next = () => { nextCalled = true; };
    return { req, res, next, getResult: () => ({ status, jsonBody, nextCalled }) };
  };

  const saMock1 = createMock('superadmin');
  superadminMiddleware(saMock1.req, saMock1.res, saMock1.next);
  assert.equal(saMock1.getResult().nextCalled, true);

  const saMock2 = createMock('super_admin');
  superadminMiddleware(saMock2.req, saMock2.res, saMock2.next);
  assert.equal(saMock2.getResult().nextCalled, true);

  const adminMock = createMock('admin');
  superadminMiddleware(adminMock.req, adminMock.res, adminMock.next);
  assert.equal(adminMock.getResult().status, 403);
  assert.equal(adminMock.getResult().nextCalled, false);

  const internMock = createMock('intern');
  superadminMiddleware(internMock.req, internMock.res, internMock.next);
  assert.equal(internMock.getResult().status, 403);
  assert.equal(internMock.getResult().nextCalled, false);
});

test('adminMiddleware permits superadmin, admin, and supervisor to view', () => {
  const createMock = (role) => {
    const req = { user: role ? { id: 1, role } : null };
    let status = null;
    let jsonBody = null;
    let nextCalled = false;
    const res = {
      status(code) { status = code; return this; },
      json(data) { jsonBody = data; return this; },
    };
    const next = () => { nextCalled = true; };
    return { req, res, next, getResult: () => ({ status, jsonBody, nextCalled }) };
  };

  const sa = createMock('superadmin');
  adminMiddleware(sa.req, sa.res, sa.next);
  assert.equal(sa.getResult().nextCalled, true);

  const admin = createMock('admin');
  adminMiddleware(admin.req, admin.res, admin.next);
  assert.equal(admin.getResult().nextCalled, true);

  const sup = createMock('supervisor');
  adminMiddleware(sup.req, sup.res, sup.next);
  assert.equal(sup.getResult().nextCalled, true);

  const intern = createMock('intern');
  adminMiddleware(intern.req, intern.res, intern.next);
  assert.equal(intern.getResult().status, 403);
  assert.equal(intern.getResult().nextCalled, false);
});
