/**
 * Utility functions to compare facial embeddings.
 * Supports Cosine Similarity and Euclidean Distance with safe dimension handling.
 */

/**
 * Computes Cosine Similarity between two numerical vectors.
 * Range: [-1.0, 1.0]. Higher is more similar.
 */
export function cosineSimilarity(vecA, vecB) {
  if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length === 0 || vecA.length !== vecB.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    const a = Number(vecA[i]);
    const b = Number(vecB[i]);
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Computes Euclidean Distance between two numerical vectors.
 * Range: [0, infinity). Lower is more similar.
 */
export function euclideanDistance(vecA, vecB) {
  if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length === 0 || vecA.length !== vecB.length) {
    return 999;
  }

  let sumSquaredDiff = 0;
  for (let i = 0; i < vecA.length; i++) {
    const diff = Number(vecA[i]) - Number(vecB[i]);
    sumSquaredDiff += diff * diff;
  }

  return Math.sqrt(sumSquaredDiff);
}

/**
 * Compares live embedding against stored embedding.
 * Strict biometric matching requires Cosine Similarity >= 0.990 AND Euclidean Distance < 0.10.
 * @param {number[]} liveEmbedding 
 * @param {number[]} storedEmbedding 
 * @param {object} options - { similarityThreshold: 0.990, maxEuclideanDistance: 0.10 }
 * @returns {object} { isMatch: boolean, similarity: number, distance: number, dimensionMismatch?: boolean }
 */
export function compareFaceEmbeddings(liveEmbedding, storedEmbedding, options = {}) {
  if (!Array.isArray(liveEmbedding) || !Array.isArray(storedEmbedding) || liveEmbedding.length === 0 || liveEmbedding.length !== storedEmbedding.length) {
    return {
      isMatch: false,
      similarity: 0,
      distance: 999,
      dimensionMismatch: true,
      similarityThreshold: options.similarityThreshold ?? 0.990,
      maxDistanceThreshold: options.maxEuclideanDistance ?? 0.10
    };
  }

  const similarityThreshold = options.similarityThreshold ?? Number(process.env.FACE_SIMILARITY_THRESHOLD || 0.990);
  const maxDistanceThreshold = options.maxEuclideanDistance ?? Number(process.env.FACE_MAX_DISTANCE || 0.10);

  const similarity = cosineSimilarity(liveEmbedding, storedEmbedding);
  const distance = euclideanDistance(liveEmbedding, storedEmbedding);

  const isMatch = similarity >= similarityThreshold && distance < maxDistanceThreshold;

  return {
    isMatch,
    similarity: Number(similarity.toFixed(4)),
    distance: Number(distance.toFixed(4)),
    similarityThreshold,
    maxDistanceThreshold
  };
}
