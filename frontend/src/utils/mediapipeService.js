import { FaceDetector, FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

let detectorInstance = null;
let landmarkerInstance = null;
let visionResolver = null;
let detectorPromise = null;
let landmarkerPromise = null;

// Keep the browser WASM runtime aligned with the installed JS package.
const TASKS_VISION_VERSION = '0.10.35';
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;
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
  if (detectorPromise) return detectorPromise;

  detectorPromise = (async () => {
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
  })().catch(error => {
    detectorPromise = null;
    throw error;
  });

  return detectorPromise;
}

/**
 * Initializes and returns the MediaPipe FaceLandmarker instance.
 */
export async function getFaceLandmarker() {
  if (landmarkerInstance) return landmarkerInstance;
  if (landmarkerPromise) return landmarkerPromise;

  landmarkerPromise = (async () => {
    const vision = await getVisionResolver();
    const options = delegate => ({
      baseOptions: {
        modelAssetPath: LANDMARKER_MODEL_URL,
        delegate,
      },
      runningMode: 'IMAGE',
      numFaces: 2,
      minFaceDetectionConfidence: 0.55,
      minFacePresenceConfidence: 0.55,
    });

    try {
      landmarkerInstance = await FaceLandmarker.createFromOptions(vision, options('GPU'));
    } catch (err) {
      console.warn('GPU delegate failed for FaceLandmarker, falling back to CPU:', err);
      landmarkerInstance = await FaceLandmarker.createFromOptions(vision, options('CPU'));
    }
    return landmarkerInstance;
  })().catch(error => {
    landmarkerPromise = null;
    throw new Error(`Face ID engine failed to load: ${error?.message || 'unknown MediaPipe error'}`);
  });

  return landmarkerPromise;
}

export async function initializeFaceModels() {
  await getFaceLandmarker();
  return true;
}

function assessSingleFace(landmarks) {
  if (!Array.isArray(landmarks) || landmarks.length < 474) {
    return {
      valid: false,
      faceCount: 1,
      error: 'Face landmarks were incomplete. Hold still and try again.'
    };
  }

  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;
  for (const point of landmarks) {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }

  const faceWidth = maxX - minX;
  const faceHeight = maxY - minY;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  if (faceWidth < 0.12 || faceHeight < 0.12) {
    return { valid: false, faceCount: 1, error: 'Face too far. Move closer to the camera.' };
  }
  if (faceWidth > 0.85 || faceHeight > 0.85) {
    return { valid: false, faceCount: 1, error: 'Face too close. Move slightly back.' };
  }
  if (centerX < 0.28 || centerX > 0.72 || centerY < 0.25 || centerY > 0.72) {
    return { valid: false, faceCount: 1, error: 'Center your full face inside the oval.' };
  }

  const leftEye = landmarks[33];
  const rightEye = landmarks[263];
  const nose = landmarks[1];
  const leftCheek = landmarks[234];
  const rightCheek = landmarks[454];

  const rawRoll = Math.abs(
    Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * (180 / Math.PI)
  );
  const rollDegrees = Math.min(rawRoll, Math.abs(180 - rawRoll));
  if (rollDegrees > 14) {
    return { valid: false, faceCount: 1, error: 'Keep your head upright and level.' };
  }

  const leftNoseSpan = Math.abs(nose.x - leftCheek.x);
  const rightNoseSpan = Math.abs(rightCheek.x - nose.x);
  const yawBalance = Math.min(leftNoseSpan, rightNoseSpan)
    / Math.max(leftNoseSpan, rightNoseSpan, 0.0001);
  if (yawBalance < 0.5) {
    return { valid: false, faceCount: 1, error: 'Face the camera directly—do not turn sideways.' };
  }

  return {
    valid: true,
    faceCount: 1,
    detection: { faceWidth, faceHeight, centerX, centerY, rollDegrees, yawBalance }
  };
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

    return assessSingleFace(faceLandmarks[0]);
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
  if (result.faceLandmarks.length > 1) {
    throw new Error('Multiple faces detected. Only one person may be in the frame.');
  }

  const landmarks = result.faceLandmarks[0];
  if (!landmarks || landmarks.length === 0) {
    throw new Error('Facial landmarks array is empty.');
  }
  const quality = assessSingleFace(landmarks);
  if (!quality.valid) {
    throw new Error(quality.error || 'Face position is not suitable for Face ID.');
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
