import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareFacePackages,
  faceDescriptorDistance,
  faceDescriptorSimilarity,
  validateFacePackage,
  FACE_ID_VERSION,
  FACE_DESCRIPTOR_LENGTH,
  FACE_SAMPLE_COUNT,
} from '../src/utils/compareFaces.js';

test('validateFacePackage accepts valid face package and rejects invalid descriptors', () => {
  const validDescriptor = new Array(FACE_DESCRIPTOR_LENGTH).fill(0.1);
  const validPackage = {
    version: FACE_ID_VERSION,
    samples: [validDescriptor, validDescriptor, validDescriptor],
  };

  const validated = validateFacePackage(validPackage);
  assert.equal(validated.version, FACE_ID_VERSION);
  assert.equal(validated.samples.length, FACE_SAMPLE_COUNT);

  // Missing version
  assert.throws(() => validateFacePackage({ samples: [validDescriptor] }), /Secure Face ID data is required|Legacy Face ID data/);

  // Wrong sample count
  assert.throws(() => validateFacePackage({
    version: FACE_ID_VERSION,
    samples: [validDescriptor, validDescriptor]
  }), /requires exactly 3 face samples/);

  // Wrong descriptor length
  assert.throws(() => validateFacePackage({
    version: FACE_ID_VERSION,
    samples: [[0.1, 0.2], [0.1, 0.2], [0.1, 0.2]]
  }), /must contain 1024 numeric values/);
});

test('faceDescriptorSimilarity and distance are symmetric and identical on identical vectors', () => {
  const v1 = new Array(FACE_DESCRIPTOR_LENGTH).fill(0.05);
  assert.equal(faceDescriptorDistance(v1, v1), 0);
  assert.equal(faceDescriptorSimilarity(v1, v1), 1.0);
});

test('compareFacePackages matches identical packages with 100% similarity', () => {
  const base = new Array(FACE_DESCRIPTOR_LENGTH).fill(0).map((_, i) => Math.sin(i) * 0.3);
  const pkg = {
    version: FACE_ID_VERSION,
    samples: [base, base, base],
  };

  const res = compareFacePackages(pkg, pkg);
  assert.equal(res.isMatch, true);
  assert.equal(res.matchedSamples, 3);
  assert.equal(res.similarity, 1.0);
});

test('compareFacePackages succeeds when 1 out of 3 samples drops slightly below threshold', () => {
  // Simulate genuine user with 1 sample having a slight lighting / posture variation
  const s0 = new Array(FACE_DESCRIPTOR_LENGTH).fill(0).map((_, i) => (i % 2 === 0 ? 0.25 : -0.25));
  const s1 = s0.map(v => v + 0.02);
  const s2 = s0.map(v => v - 0.02);

  const enrolled = {
    version: FACE_ID_VERSION,
    samples: [s0, s1, s2],
  };

  // Live capture: frame 0 and frame 1 match closely (sim ~0.85+), frame 2 perturbed
  const liveSample2 = s0.map((v, i) => v + (i % 3 === 0 ? 0.12 : -0.05));
  const live = {
    version: FACE_ID_VERSION,
    samples: [s0, s1, liveSample2],
  };

  const res = compareFacePackages(live, enrolled);
  assert.equal(res.isMatch, true, 'Genuine user should match even if 1 sample is perturbed');
  assert.ok(res.matchedSamples >= 2, 'At least 2 samples should match');
  assert.ok(res.similarity >= 0.55, 'Average similarity should meet threshold');
});

test('compareFacePackages rejects impostors with different facial features', () => {
  // Impostor vectors pointing in opposing directions
  const personA = new Array(FACE_DESCRIPTOR_LENGTH).fill(0).map((_, i) => Math.cos(i) * 0.4);
  const personB = new Array(FACE_DESCRIPTOR_LENGTH).fill(0).map((_, i) => -Math.cos(i) * 0.4);

  const pkgA = { version: FACE_ID_VERSION, samples: [personA, personA, personA] };
  const pkgB = { version: FACE_ID_VERSION, samples: [personB, personB, personB] };

  const res = compareFacePackages(pkgA, pkgB);
  assert.equal(res.isMatch, false, 'Different person must never match');
  assert.equal(res.matchedSamples, 0);
});
