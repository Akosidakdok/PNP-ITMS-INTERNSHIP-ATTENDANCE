export const FACE_ID_VERSION = 'human-faceres-v1';
export const FACE_COMPARISON_VERSION = 'cosine-3sample-v2';
export const FACE_DESCRIPTOR_LENGTH = 1024;
export const FACE_SAMPLE_COUNT = 3;

const DEFAULT_MATCH_THRESHOLD = 0.58;
const DEFAULT_AVERAGE_THRESHOLD = 0.60;
const DEFAULT_CONSISTENCY_THRESHOLD = 0.52;

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
    comparisonVersion: facePackage.comparisonVersion || null,
    samples,
  };
}

export function faceDescriptorSimilarity(first, second) {
  if (!finiteDescriptor(first) || !finiteDescriptor(second)) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < first.length; index += 1) {
    const a = Number(first[index]);
    const b = Number(second[index]);
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }

  if (normA <= 0 || normB <= 0) return 0;
  const cosine = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  return Math.max(0, Math.min(1, cosine));
}

export function faceDescriptorDistance(first, second) {
  if (!finiteDescriptor(first) || !finiteDescriptor(second)) return Number.POSITIVE_INFINITY;
  const sim = faceDescriptorSimilarity(first, second);
  return Math.sqrt(Math.max(0, 2 * (1 - sim)));
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

  // Require a majority of independently captured samples to match. A high
  // aggregate alone can be produced by one unusually similar frame.
  const isMatch = matchedSamples >= 2 && averageSimilarity >= averageThreshold;

  return {
    isMatch,
    similarity: Number(averageSimilarity.toFixed(4)),
    distance: Number(averageDistance.toFixed(4)),
    matchedSamples,
    sampleSimilarities: sampleResults.map(result => Number(result.similarity.toFixed(4))),
    matchThreshold,
    averageThreshold,
    comparisonVersion: FACE_COMPARISON_VERSION,
    enrolledComparisonVersion: enrolled.comparisonVersion,
  };
}
