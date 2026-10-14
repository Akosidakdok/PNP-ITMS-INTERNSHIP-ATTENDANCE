import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import {
  FACE_ID_VERSION,
  FACE_DESCRIPTOR_LENGTH,
} from '../src/utils/compareFaces.js';

process.env.SUPABASE_URL ||= 'http://attendance-spec.test';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key';

const { supabase } = await import('../src/supabaseClient.js');
const { scanAttendance, getTodayScanStatus } = await import('../src/attendance.js');
const { verifyUserFace } = await import('../src/services/faceVerificationService.js');

const originalFrom = supabase.from.bind(supabase);
const originalRpc = supabase.rpc.bind(supabase);

after(() => {
  supabase.from = originalFrom;
  supabase.rpc = originalRpc;
});

function createMockDescriptor(seed = 0.1) {
  return new Array(FACE_DESCRIPTOR_LENGTH).fill(0).map((_, i) => Math.sin(i * seed) * 0.4);
}

function createFacePackage(descriptor) {
  return {
    version: FACE_ID_VERSION,
    samples: [descriptor, descriptor, descriptor],
  };
}

const VALID_PHOTO_DATA = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

test('scanAttendance rejects unauthenticated requests', async () => {
  await assert.rejects(
    async () => {
      await scanAttendance({ qr_code: 'TEST_QR', user: null, face_embedding: {} });
    },
    (err) => {
      assert.equal(err.code, 'UNAUTHENTICATED');
      assert.equal(err.statusCode, 401);
      return true;
    }
  );

  await assert.rejects(
    async () => {
      await scanAttendance({ qr_code: 'TEST_QR', user: {}, face_embedding: {} });
    },
    (err) => {
      assert.equal(err.code, 'UNAUTHENTICATED');
      assert.equal(err.statusCode, 401);
      return true;
    }
  );
});

test('scanAttendance rejects requests without face_embedding', async () => {
  // Mock valid QR query
  supabase.from = (table) => {
    if (table === 'qr_codes') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              gt: () => ({
                single: async () => ({
                  data: { qr_code: 'VALID_QR', is_active: true, expires_at: new Date(Date.now() + 60000).toISOString() },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      };
    }
    return { select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) };
  };

  await assert.rejects(
    async () => {
      await scanAttendance({
        qr_code: 'VALID_QR',
        photo: VALID_PHOTO_DATA,
        user: { id: 101, full_name: 'Intern One' },
        face_embedding: null,
      });
    },
    (err) => {
      assert.equal(err.code, 'FACE_EMBEDDING_REQUIRED');
      assert.equal(err.statusCode, 400);
      return true;
    }
  );
});

test('verifyUserFace rejects when Account 1 is signed in but Face 2 is presented', async () => {
  const face1Descriptor = createMockDescriptor(0.1);
  const face2Descriptor = createMockDescriptor(0.85);

  const account1 = {
    id: 1,
    full_name: 'Account 1',
    face_registered: true,
    face_embedding: JSON.stringify(createFacePackage(face1Descriptor)),
  };

  const account2 = {
    id: 2,
    full_name: 'Account 2',
    face_registered: true,
    face_embedding: JSON.stringify(createFacePackage(face2Descriptor)),
  };

  supabase.from = (table) => {
    return {
      select: () => ({
        eq: (col, val) => ({
          single: async () => {
            if (table === 'accounts' && col === 'id' && Number(val) === 1) {
              return { data: account1, error: null };
            }
            return { data: null, error: new Error('Not found') };
          },
          neq: () => ({
            data: [account2],
            error: null,
          }),
        }),
      }),
    };
  };

  supabase.rpc = async () => ({ data: { failed_attempts: 1, locked_until: null }, error: null });

  // Account 1 is signed in, but live capture is Face 2
  const livePackageFace2 = createFacePackage(face2Descriptor);
  const result = await verifyUserFace(1, livePackageFace2);

  assert.equal(result.verified, false);
  assert.equal(result.code, 'FACE_MISMATCH');
  assert.equal(result.message, 'Face does not match the registered face for this account.');
});

test('verifyUserFace accepts when Account 1 is signed in and Face 1 is presented', async () => {
  const face1Descriptor = createMockDescriptor(0.1);
  const face2Descriptor = createMockDescriptor(0.85);

  const account1 = {
    id: 1,
    full_name: 'Account 1',
    face_registered: true,
    face_embedding: JSON.stringify(createFacePackage(face1Descriptor)),
  };

  const account2 = {
    id: 2,
    full_name: 'Account 2',
    face_registered: true,
    face_embedding: JSON.stringify(createFacePackage(face2Descriptor)),
  };

  supabase.from = (table) => {
    return {
      select: () => ({
        eq: (col, val) => ({
          single: async () => {
            if (table === 'accounts' && col === 'id' && Number(val) === 1) {
              return { data: account1, error: null };
            }
            return { data: null, error: new Error('Not found') };
          },
          neq: () => ({
            data: [account2],
            error: null,
          }),
        }),
      }),
    };
  };

  supabase.rpc = async (name) => {
    if (name === 'complete_face_verification_success') {
      return { data: { allowed: true }, error: null };
    }
    return { data: { failed_attempts: 0, locked_until: null }, error: null };
  };

  // Account 1 is signed in, and live capture is Face 1
  const livePackageFace1 = createFacePackage(face1Descriptor);
  const result = await verifyUserFace(1, livePackageFace1);

  assert.equal(result.verified, true);
  assert.equal(result.message, 'Face identity verified successfully.');
});

test('getTodayScanStatus returns has_timed_out: true and can_scan: false when user has timed out', async () => {
  supabase.from = (table) => {
    return {
      select: () => ({
        eq: () => ({
          gte: () => ({
            lt: () => ({
              order: async () => ({
                data: [
                  { scan_type: 'time_in', scan_time: new Date().toISOString(), remarks: null },
                  { scan_type: 'time_out', scan_time: new Date().toISOString(), remarks: null },
                ],
                error: null,
              }),
            }),
          }),
        }),
      }),
    };
  };

  const status = await getTodayScanStatus(1);
  assert.equal(status.has_timed_out, true);
  assert.equal(status.can_scan, false);
  assert.equal(status.scan_count, 2);
  assert.equal(status.next_scan_label, 'All scans completed for today');
});

test('scanAttendance rejects with ALREADY_TIMED_OUT when intern has already timed out today', async () => {
  const face1Descriptor = createMockDescriptor(0.1);
  const account1 = {
    id: 1,
    full_name: 'Account 1',
    face_registered: true,
    face_embedding: JSON.stringify(createFacePackage(face1Descriptor)),
  };

  supabase.from = (table) => {
    if (table === 'qr_codes') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              gt: () => ({
                single: async () => ({
                  data: { id: 'qr-1', qr_code: 'TEST_QR', is_active: true },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      };
    }
    if (table === 'accounts') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: account1, error: null }),
            neq: () => ({ data: [], error: null }),
          }),
        }),
      };
    }
    if (table === 'attendance_logs') {
      return {
        select: () => ({
          eq: () => ({
            gte: () => ({
              order: () => ({
                limit: () => ({
                  single: async () => ({ data: null, error: { message: 'Not found' } }),
                }),
              }),
              lt: () => ({
                order: async () => ({
                  data: [
                    { scan_type: 'time_in', scan_time: new Date().toISOString(), remarks: null },
                    { scan_type: 'time_out', scan_time: new Date().toISOString(), remarks: null },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      };
    }
    return {
      select: () => ({
        eq: () => ({ single: async () => ({ data: null, error: null }) }),
      }),
    };
  };

  supabase.rpc = async () => ({ data: { allowed: true }, error: null });

  await assert.rejects(
    async () => {
      await scanAttendance({
        qr_code: 'TEST_QR',
        user: account1,
        photo: VALID_PHOTO_DATA,
        face_embedding: createFacePackage(face1Descriptor),
      });
    },
    (err) => {
      assert.equal(err.code, 'ALREADY_TIMED_OUT');
      assert.equal(err.statusCode, 400);
      assert.match(err.message, /already timed out for today/i);
      return true;
    }
  );
});
