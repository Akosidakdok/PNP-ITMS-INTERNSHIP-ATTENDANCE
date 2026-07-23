import { FaceDetector, FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

let detectorInstance = null;
let landmarkerInstance = null;
let visionResolver = null;

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const DETECTOR_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';
const LANDMARKER_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

async function getVisionResolver() {
  if (!visionResolver) {
    visionResolver = await FilesetResolver.forVisionTasks(WASM_URL);
  }
  return visionResolver;
}

/**
 * Initializes and returns the MediaPipe FaceDetector instance.
 */
export async function getFaceDetector() {
  if (detectorInstance) return detectorInstance;

  const vision = await getVisionResolver();
  try {
    detectorInstance = await FaceDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: DETECTOR_MODEL_URL,
        delegate: 'GPU',
      },
      runningMode: 'IMAGE',
      minDetectionConfidence: 0.5,
    });
  } catch (err) {
    console.warn('GPU delegate failed for FaceDetector, falling back to CPU:', err);
    detectorInstance = await FaceDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: DETECTOR_MODEL_URL,
        delegate: 'CPU',
      },
      runningMode: 'IMAGE',
      minDetectionConfidence: 0.5,
    });
  }

  return detectorInstance;
}

/**
 * Initializes and returns the MediaPipe FaceLandmarker instance.
 */
export async function getFaceLandmarker() {
  if (landmarkerInstance) return landmarkerInstance;

  const vision = await getVisionResolver();
  try {
    landmarkerInstance = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: LANDMARKER_MODEL_URL,
        delegate: 'GPU',
      },
      runningMode: 'IMAGE',
      numFaces: 2,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
    });
  } catch (err) {
    console.warn('GPU delegate failed for FaceLandmarker, falling back to CPU:', err);
    landmarkerInstance = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: LANDMARKER_MODEL_URL,
        delegate: 'CPU',
      },
      runningMode: 'IMAGE',
      numFaces: 2,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
    });
  }

  return landmarkerInstance;
}

/**
 * Analyzes an image or HTML canvas/video element for face count and edge cases.
 * @param {HTMLImageElement|HTMLCanvasElement|HTMLVideoElement} imageElement 
 * @returns {Promise<{valid: boolean, faceCount: number, error?: string, detection?: any}>}
 */
export async function analyzeFaceQuality(imageElement) {
  try {
    // Guard: video must have valid pixel dimensions before MediaPipe runs
    if (imageElement instanceof HTMLVideoElement) {
      if (
        !imageElement.videoWidth ||
        !imageElement.videoHeight ||
        imageElement.readyState < 2 // HAVE_CURRENT_DATA
      ) {
        return { valid: false, faceCount: 0, error: 'Camera not ready yet. Please wait...' };
      }
    }
    if (imageElement instanceof HTMLCanvasElement) {
      if (!imageElement.width || !imageElement.height) {
        return { valid: false, faceCount: 0, error: 'Invalid image dimensions.' };
      }
    }

    const landmarker = await getFaceLandmarker();
    const result = landmarker.detect(imageElement);
    const faceLandmarks = result.faceLandmarks || [];

    if (faceLandmarks.length === 0) {
      return {
        valid: false,
        faceCount: 0,
        error: 'No face detected. Please ensure your face is clearly visible inside the camera frame.'
      };
    }

    if (faceLandmarks.length > 1) {
      return {
        valid: false,
        faceCount: faceLandmarks.length,
        error: 'Multiple faces detected. Please ensure only you are visible in the frame.'
      };
    }

    const landmarks = faceLandmarks[0];
    let minX = 1, maxX = 0, minY = 1, maxY = 0;
    for (const p of landmarks) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    const faceWidth = maxX - minX;
    const faceHeight = maxY - minY;

    if (faceWidth < 0.12 || faceHeight < 0.12) {
      return {
        valid: false,
        faceCount: 1,
        error: 'Face too far. Move closer to the camera.'
      };
    }

    if (faceWidth > 0.85 || faceHeight > 0.85) {
      return {
        valid: false,
        faceCount: 1,
        error: 'Face too close. Move slightly back.'
      };
    }

    return {
      valid: true,
      faceCount: 1
    };
  } catch (err) {
    console.error('Error analyzing face quality:', err);
    return {
      valid: false,
      faceCount: 0,
      error: `Face detection error: ${err.message || 'Failed to detect face'}`
    };
  }
}

/**
 * Key MediaPipe landmark indices for scale-invariant facial geometry ratios.
 * Includes nose tip, top forehead, chin, eyes, eyebrows, cheeks, mouth, jawline.
 */
const KEY_FEATURE_INDICES = [1, 10, 13, 33, 61, 70, 133, 152, 168, 234, 263, 288, 291, 300, 362, 454, 468, 473];

/**
 * Generates a high-precision scale-invariant facial embedding vector from MediaPipe FaceLandmarker.
 * Combines pairwise facial distance ratios and eye-scaled centered 3D landmark coordinates.
 * @param {HTMLImageElement|HTMLCanvasElement|HTMLVideoElement} imageElement 
 * @returns {Promise<number[]>}
 */
export async function extractFaceEmbedding(imageElement) {
  // Guard: canvas must have valid dimensions
  if (imageElement instanceof HTMLCanvasElement) {
    if (!imageElement.width || !imageElement.height) {
      throw new Error('Cannot extract embedding from a zero-dimension canvas.');
    }
  }
  if (imageElement instanceof HTMLVideoElement) {
    if (!imageElement.videoWidth || !imageElement.videoHeight || imageElement.readyState < 2) {
      throw new Error('Video is not ready for face embedding extraction.');
    }
  }

  const landmarker = await getFaceLandmarker();
  const result = landmarker.detect(imageElement);
  
  if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
    throw new Error('No face detected to extract facial embedding.');
  }

  const landmarks = result.faceLandmarks[0];
  if (!landmarks || landmarks.length === 0) {
    throw new Error('Facial landmarks array is empty.');
  }

  // 1. Calculate centroid (center of mass) to center the face landmarks
  let sumX = 0, sumY = 0, sumZ = 0;
  for (const p of landmarks) {
    sumX += p.x;
    sumY += p.y;
    sumZ += p.z || 0;
  }
  const centerX = sumX / landmarks.length;
  const centerY = sumY / landmarks.length;
  const centerZ = sumZ / landmarks.length;

  // 2. Inter-ocular distance baseline (Left Eye vs Right Eye) for scale normalization
  const pLeftEye = landmarks[468] || landmarks[33];
  const pRightEye = landmarks[473] || landmarks[263];
  const eyeDist = Math.hypot(
    pLeftEye.x - pRightEye.x,
    pLeftEye.y - pRightEye.y,
    (pLeftEye.z || 0) - (pRightEye.z || 0)
  ) || 0.1;

  // 3. Scale-invariant pairwise facial feature ratios
  const featureRatios = [];
  for (let i = 0; i < KEY_FEATURE_INDICES.length; i++) {
    for (let j = i + 1; j < KEY_FEATURE_INDICES.length; j++) {
      const idx1 = KEY_FEATURE_INDICES[i];
      const idx2 = KEY_FEATURE_INDICES[j];
      const p1 = landmarks[idx1];
      const p2 = landmarks[idx2];
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y, (p1.z || 0) - (p2.z || 0));
      featureRatios.push(dist / eyeDist);
    }
  }

  // 4. Centered & Eye-Scaled 3D landmark coordinates
  const scaledCoords = [];
  for (const p of landmarks) {
    scaledCoords.push(
      (p.x - centerX) / eyeDist,
      (p.y - centerY) / eyeDist,
      ((p.z || 0) - centerZ) / eyeDist
    );
  }

  // 5. Combine ratios + coordinates and L2 normalize
  const combined = [...featureRatios, ...scaledCoords];
  const sqSum = combined.reduce((s, v) => s + v * v, 0);
  const norm = Math.sqrt(sqSum) || 1;

  return combined.map(val => Number((val / norm).toFixed(6)));
}
