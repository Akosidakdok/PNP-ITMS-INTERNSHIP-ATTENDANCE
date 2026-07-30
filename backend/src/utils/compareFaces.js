export const FACE_ID_VERSION = 'human-faceres-v1';
export const FACE_DESCRIPTOR_LENGTH = 1024;
export const FACE_SAMPLE_COUNT = 3;

const DEFAULT_MATCH_THRESHOLD = 0.55;
const DEFAULT_AVERAGE_THRESHOLD = 0.6;
const DEFAULT_CONSISTENCY_THRESHOLD = 0.65;

function finiteDescriptor(descriptor) {
  return Array.isArray(descriptor)
    && descriptor.length === FACE_DESCRIPTOR_LENGTH
    && descriptor.every(value => Number.isFinite(Number(value)));
}

export function validateFacePackage(facePackage) {
  if (!facePackage || typeof facePackage !== 'object' || Array.isArray(facePackage)) {
    throw new Error('Secure Face ID data is required');
  }
  if (facePackage.version !== FACE_ID_VERSION) {
    throw new Error('Legacy Face ID data is no longer accepted; secure re-enrollment is required');
  }
  if (!Array.isArray(facePackage.samples) || facePackage.samples.length !== FACE_SAMPLE_COUNT) {
    throw new Error(`Secure Face ID requires exactly ${FACE_SAMPLE_COUNT} face samples`);
  }

  const samples = facePackage.samples.map(descriptor => {
    if (!finiteDescriptor(descriptor)) {
      throw new Error(`Each secure face descriptor must contain ${FACE_DESCRIPTOR_LENGTH} numeric values`);
    }
    return descriptor.map(Number);
  });

  const consistencyThreshold = Number(
    process.env.FACE_SAMPLE_CONSISTENCY_THRESHOLD || DEFAULT_CONSISTENCY_THRESHOLD
  );
  for (let first = 0; first < samples.length; first += 1) {
    for (let second = first + 1; second < samples.length; second += 1) {
      if (faceDescriptorSimilarity(samples[first], samples[second]) < consistencyThreshold) {
        throw new Error('Face samples are inconsistent and may contain different people');
      }
    }
  }

  return {
    version: FACE_ID_VERSION,
    samples,
  };
}

export function faceDescriptorDistance(first, second) {
  if (!finiteDescriptor(first) || !finiteDescriptor(second)) return Number.POSITIVE_INFINITY;

  let sumSquaredDifference = 0;
  for (let index = 0; index < first.length; index += 1) {
    const difference = Number(first[index]) - Number(second[index]);
    sumSquaredDifference += difference * difference;
  }
  return Math.sqrt(25 * sumSquaredDifference);
}

export function faceDescriptorSimilarity(first, second) {
  const rootDistance = faceDescriptorDistance(first, second);
  if (!Number.isFinite(rootDistance)) return 0;
  return Math.max(0, Math.min(1, (1 - (rootDistance / 100) - 0.2) / 0.6));
}

export function compareFacePackages(livePackage, enrolledPackage, options = {}) {
  const live = validateFacePackage(livePackage);
  const enrolled = validateFacePackage(enrolledPackage);
  const matchThreshold = options.matchThreshold
    ?? Number(process.env.FACE_MATCH_THRESHOLD || DEFAULT_MATCH_THRESHOLD);
  const averageThreshold = options.averageThreshold
    ?? Number(process.env.FACE_AVERAGE_MATCH_THRESHOLD || DEFAULT_AVERAGE_THRESHOLD);

  const sampleResults = live.samples.map(liveSample => {
    const candidates = enrolled.samples.map(enrolledSample => ({
      similarity: faceDescriptorSimilarity(liveSample, enrolledSample),
      distance: faceDescriptorDistance(liveSample, enrolledSample),
    }));
    return candidates.reduce(
      (best, candidate) => candidate.similarity > best.similarity ? candidate : best,
      { similarity: 0, distance: Number.POSITIVE_INFINITY }
    );
  });

  const averageSimilarity = sampleResults.reduce(
    (sum, result) => sum + result.similarity,
    0
  ) / sampleResults.length;
  const averageDistance = sampleResults.reduce(
    (sum, result) => sum + result.distance,
    0
  ) / sampleResults.length;
  const matchedSamples = sampleResults.filter(
    result => result.similarity >= matchThreshold
  ).length;

  // Fail closed: every live sample must match and the aggregate must also pass.
  const isMatch = matchedSamples === FACE_SAMPLE_COUNT
    && averageSimilarity >= averageThreshold;

  return {
    isMatch,
    similarity: Number(averageSimilarity.toFixed(4)),
    distance: Number(averageDistance.toFixed(4)),
    matchedSamples,
    sampleSimilarities: sampleResults.map(result => Number(result.similarity.toFixed(4))),
    matchThreshold,
    averageThreshold,
  };
}
