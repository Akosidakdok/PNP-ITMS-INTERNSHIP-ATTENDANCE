import {
  evaluateFaceQuality,
  initializeFaceIdentity,
} from './faceIdentityService.js';

let detectorInstance = null;
let landmarkerInstance = null;
let visionResolver = null;
let detectorPromise = null;
let landmarkerPromise = null;

const TASKS_VISION_VERSION = '0.10.35';
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;
const DETECTOR_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';
const LANDMARKER_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

async function getVisionResolver() {
  if (!visionResolver) {
    const { FilesetResolver } = await import('@mediapipe/tasks-vision');
    visionResolver = await FilesetResolver.forVisionTasks(WASM_URL);
  }
  return visionResolver;
}

export async function getFaceDetector() {
  if (detectorInstance) return detectorInstance;
  if (detectorPromise) return detectorPromise;

  detectorPromise = (async () => {
    const { FaceDetector } = await import('@mediapipe/tasks-vision');
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
    } catch {
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

export async function getFaceLandmarker() {
  if (landmarkerInstance) return landmarkerInstance;
  if (landmarkerPromise) return landmarkerPromise;

  landmarkerPromise = (async () => {
    const { FaceLandmarker } = await import('@mediapipe/tasks-vision');
    const vision = await getVisionResolver();
    const options = delegate => ({
      baseOptions: {
        modelAssetPath: LANDMARKER_MODEL_URL,
        delegate,
      },
      runningMode: 'IMAGE',
      numFaces: 2,
      minFaceDetectionConfidence: 0.50,
      minFacePresenceConfidence: 0.50,
    });

    try {
      landmarkerInstance = await FaceLandmarker.createFromOptions(vision, options('GPU'));
    } catch {
      landmarkerInstance = await FaceLandmarker.createFromOptions(vision, options('CPU'));
    }
    return landmarkerInstance;
  })().catch(error => {
    landmarkerPromise = null;
    throw new Error(`Face Landmarker failed to load: ${error?.message || 'unknown error'}`);
  });

  return landmarkerPromise;
}

/**
 * Initializes face models. Delegates directly to local Human model loader to ensure
 * high performance without external 12.5MB cloud downloads.
 */
export async function initializeFaceModels() {
  await initializeFaceIdentity();
  return true;
}

/**
 * Analyzes an image or video frame for face position, centering, distance, and lighting.
 * Backed by Human for rock-solid performance on mobile devices (iOS Safari & Android Chrome).
 */
export async function analyzeFaceQuality(imageElement) {
  return await evaluateFaceQuality(imageElement);
}
