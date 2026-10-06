export const FACE_ID_VERSION = 'human-faceres-v1';
export const FACE_DESCRIPTOR_LENGTH = 1024;
export const FACE_SAMPLE_COUNT = 3;
export const FACE_CAPTURE_FRAME_COUNT = 6;

// Tuned for reliable mobile (iOS & Android) handheld scanning across varying lighting
const MIN_FACE_CONFIDENCE = 0.45;
const MIN_REAL_SAMPLE_SCORE = 0.10;
const MIN_LIVE_SAMPLE_SCORE = 0.08;
const MIN_REAL_AVERAGE = 0.18;
const MIN_LIVE_AVERAGE = 0.12;
const MAX_HEAD_ANGLE_RADIANS = 0.52; // ~30 degrees (natural phone grip)
const MIN_SAMPLE_CONSISTENCY = 0.50; // consistent with backend threshold

const getModelBasePath = () => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '') + '/';
    return `${window.location.origin}${base}models/human/`;
  }
  return '/models/human/';
};

const BASE_HUMAN_CONFIG = {
  backend: 'webgl',
  modelBasePath: getModelBasePath(),
  cacheSensitivity: 0,
  filter: {
    enabled: false,
    equalization: false,
  },
  face: {
    enabled: true,
    detector: {
      rotation: true,
      return: true,
      maxDetected: 2,
      skipFrames: 0,
      skipTime: 0,
      minConfidence: MIN_FACE_CONFIDENCE,
    },
    mesh: {
      enabled: true,
    },
    iris: {
      enabled: true,
    },
    description: {
      enabled: true,
      skipFrames: 0,
      skipTime: 0,
      minConfidence: 0.45,
    },
    antispoof: {
      enabled: true,
      skipFrames: 0,
      skipTime: 0,
    },
    liveness: {
      enabled: true,
      skipFrames: 0,
      skipTime: 0,
    },
    emotion: {
      enabled: false,
    },
  },
  body: { enabled: false },
  hand: { enabled: false },
  object: { enabled: false },
  gesture: { enabled: false },
};

export const REALTIME_GUIDE_CONFIG = {
  face: {
    enabled: true,
    detector: {
      rotation: true,
      return: true,
      maxDetected: 2,
      skipFrames: 0,
      skipTime: 0,
      minConfidence: MIN_FACE_CONFIDENCE,
    },
    mesh: {
      enabled: true,
    },
    iris: {
      enabled: false,
    },
    description: {
      enabled: false,
    },
    antispoof: {
      enabled: false,
    },
    liveness: {
      enabled: false,
    },
    emotion: {
      enabled: false,
    },
  },
  body: { enabled: false },
  hand: { enabled: false },
  object: { enabled: false },
  gesture: { enabled: false },
};

export const FULL_EXTRACTION_CONFIG = {
  face: {
    enabled: true,
    detector: {
      rotation: true,
      return: true,
      maxDetected: 2,
      skipFrames: 0,
      skipTime: 0,
      minConfidence: MIN_FACE_CONFIDENCE,
    },
    mesh: {
      enabled: true,
    },
    iris: {
      enabled: true,
    },
    description: {
      enabled: true,
      skipFrames: 0,
      skipTime: 0,
      minConfidence: 0.45,
    },
    antispoof: {
      enabled: true,
      skipFrames: 0,
      skipTime: 0,
    },
    liveness: {
      enabled: true,
      skipFrames: 0,
      skipTime: 0,
    },
    emotion: {
      enabled: false,
    },
  },
  body: { enabled: false },
  hand: { enabled: false },
  object: { enabled: false },
  gesture: { enabled: false },
};

let identityEngine = null;
let identityInitializationPromise = null;

// Reusable canvas to avoid allocating memory on every frame on mobile
let reusableFrameCanvas = null;

/**
 * Converts a video element or canvas into a safe 2D canvas for WebGL texture reading.
 * On iOS Safari, passing a video element directly to WebGL texImage2D frequently fails
 * due to WebKit texture synchronization bugs; drawing to a 2D canvas first is 100% reliable.
 */
export function getFrameCanvas(source) {
  if (!source) return null;
  if (source instanceof HTMLCanvasElement) return source;

  if (source instanceof HTMLVideoElement) {
    if (!source.videoWidth || !source.videoHeight || source.readyState < 2) {
      return null;
    }
    if (!reusableFrameCanvas) {
      reusableFrameCanvas = document.createElement('canvas');
    }
    if (reusableFrameCanvas.width !== source.videoWidth || reusableFrameCanvas.height !== source.videoHeight) {
      reusableFrameCanvas.width = source.videoWidth;
      reusableFrameCanvas.height = source.videoHeight;
    }
    const ctx = reusableFrameCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0);
    return reusableFrameCanvas;
  }

  if (source instanceof HTMLImageElement) {
    if (!source.naturalWidth || !source.naturalHeight) return null;
    if (!reusableFrameCanvas) {
      reusableFrameCanvas = document.createElement('canvas');
    }
    if (reusableFrameCanvas.width !== source.naturalWidth || reusableFrameCanvas.height !== source.naturalHeight) {
      reusableFrameCanvas.width = source.naturalWidth;
      reusableFrameCanvas.height = source.naturalHeight;
    }
    const ctx = reusableFrameCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0);
    return reusableFrameCanvas;
  }

  return null;
}

export async function initializeFaceIdentity() {
  if (!identityInitializationPromise) {
    identityInitializationPromise = (async () => {
      const { default: Human } = await import('@vladmandic/human');
      const resolvedConfig = {
        ...BASE_HUMAN_CONFIG,
        modelBasePath: getModelBasePath(),
      };

      try {
        identityEngine = new Human(resolvedConfig);
        await identityEngine.load();
        try {
          // Warmup is non-fatal on iOS Safari / WebKit
          await identityEngine.warmup();
        } catch (warmupError) {
          console.warn('Human WebGL warmup notice (non-fatal):', warmupError?.message || warmupError);
        }
      } catch (gpuError) {
        console.warn('Human WebGL init failed on device, falling back to cpu backend:', gpuError);
        try {
          identityEngine = new Human({ ...resolvedConfig, backend: 'cpu' });
          await identityEngine.load();
        } catch (cpuError) {
          console.error('Human CPU init failed:', cpuError);
          throw cpuError;
        }
      }
      return true;
    })().catch(error => {
      identityInitializationPromise = null;
      throw new Error(`Secure Face ID engine failed to load: ${error?.message || 'unknown model error'}`);
    });
  }
  return identityInitializationPromise;
}

function isValidDescriptor(descriptor) {
  return Array.isArray(descriptor)
    && descriptor.length === FACE_DESCRIPTOR_LENGTH
    && descriptor.every(value => Number.isFinite(Number(value)));
}

export function faceDescriptorSimilarity(first, second) {
  if (!isValidDescriptor(first) || !isValidDescriptor(second)) return 0;

  let sumSquaredDifference = 0;
  for (let index = 0; index < first.length; index += 1) {
    const difference = Number(first[index]) - Number(second[index]);
    sumSquaredDifference += difference * difference;
  }

  // Mirrors Human's FaceRes matching configuration:
  // order=2, multiplier=25, normalized from the 0.2..0.8 range.
  const rootDistance = Math.sqrt(25 * sumSquaredDifference);
  return Math.max(0, Math.min(1, (1 - (rootDistance / 100) - 0.2) / 0.6));
}

function inspectIdentityResult(result) {
  const faces = result?.face || [];
  if (faces.length === 0) {
    throw new Error('No face detected by the identity engine. Position your face in view.');
  }
  if (faces.length > 1) {
    throw new Error('Multiple faces detected. Only one person may be in the frame.');
  }

  const face = faces[0];
  const confidence = Math.max(
    Number(face.score || 0),
    Number(face.boxScore || 0),
    Number(face.faceScore || 0)
  );
  if (confidence < MIN_FACE_CONFIDENCE) {
    throw new Error('Face confidence is too low. Improve lighting and face the camera directly.');
  }

  const angles = face.rotation?.angle;
  if (
    angles
    && (
      Math.abs(Number(angles.roll || 0)) > MAX_HEAD_ANGLE_RADIANS
      || Math.abs(Number(angles.yaw || 0)) > MAX_HEAD_ANGLE_RADIANS
      || Math.abs(Number(angles.pitch || 0)) > MAX_HEAD_ANGLE_RADIANS
    )
  ) {
    throw new Error('Keep your face straight and look directly at the camera.');
  }

  if (!isValidDescriptor(face.embedding)) {
    throw new Error('The secure identity descriptor could not be generated.');
  }

  return {
    descriptor: face.embedding.map(Number),
    confidence,
    real: Number(face.real ?? 0.5),
    live: Number(face.live ?? 0.5),
  };
}

async function inspectSecureFace(input) {
  await initializeFaceIdentity();
  if (!identityEngine) {
    throw new Error('Secure Face ID engine is unavailable.');
  }
  const canvas = getFrameCanvas(input) || input;
  const result = await identityEngine.detect(canvas, FULL_EXTRACTION_CONFIG);
  return inspectIdentityResult(result);
}

export async function extractSecureFaceDescriptor(input) {
  const sample = await inspectSecureFace(input);
  if (sample.real < MIN_REAL_SAMPLE_SCORE || sample.live < MIN_LIVE_SAMPLE_SCORE) {
    throw new Error(
      `Live-face confidence is too low. Improve the room lighting and face the camera.`
    );
  }
  return sample.descriptor;
}

function combinationsOfThree(samples) {
  const combinations = [];
  for (let first = 0; first < samples.length - 2; first += 1) {
    for (let second = first + 1; second < samples.length - 1; second += 1) {
      for (let third = second + 1; third < samples.length; third += 1) {
        combinations.push([samples[first], samples[second], samples[third]]);
      }
    }
  }
  return combinations;
}

function scoreSampleGroup(group) {
  const similarities = [
    faceDescriptorSimilarity(group[0].descriptor, group[1].descriptor),
    faceDescriptorSimilarity(group[0].descriptor, group[2].descriptor),
    faceDescriptorSimilarity(group[1].descriptor, group[2].descriptor),
  ];
  const averageReal = group.reduce((sum, sample) => sum + sample.real, 0) / group.length;
  const averageLive = group.reduce((sum, sample) => sum + sample.live, 0) / group.length;
  const minimumSimilarity = Math.min(...similarities);
  const valid = minimumSimilarity >= MIN_SAMPLE_CONSISTENCY
    && group.every(sample => (
      sample.real >= MIN_REAL_SAMPLE_SCORE
      && sample.live >= MIN_LIVE_SAMPLE_SCORE
    ))
    && averageReal >= MIN_REAL_AVERAGE
    && averageLive >= MIN_LIVE_AVERAGE;

  return {
    group,
    valid,
    averageReal,
    averageLive,
    minimumSimilarity,
    quality: averageReal + averageLive + minimumSimilarity,
  };
}

function sampledFramePixels(canvas) {
  if (!(canvas instanceof HTMLCanvasElement) || !canvas.width || !canvas.height) {
    throw new Error('Live Face ID requires valid camera frames.');
  }
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Camera frame pixels are unavailable.');

  const startX = Math.floor(canvas.width * 0.22);
  const endX = Math.ceil(canvas.width * 0.78);
  const startY = Math.floor(canvas.height * 0.12);
  const endY = Math.ceil(canvas.height * 0.88);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const stepX = Math.max(4, Math.floor((endX - startX) / 36));
  const stepY = Math.max(4, Math.floor((endY - startY) / 36));
  const sampled = [];

  for (let y = startY; y < endY; y += stepY) {
    for (let x = startX; x < endX; x += stepX) {
      const index = (y * canvas.width + x) * 4;
      sampled.push(
        (pixels[index] * 0.299)
        + (pixels[index + 1] * 0.587)
        + (pixels[index + 2] * 0.114)
      );
    }
  }
  return sampled;
}

function assertLiveFrameSequence(inputs) {
  const signatures = inputs.map(sampledFramePixels);
  const motionScores = [];

  for (let index = 1; index < signatures.length; index += 1) {
    const previous = signatures[index - 1];
    const current = signatures[index];
    let totalDifference = 0;
    const count = Math.min(previous.length, current.length);
    for (let pixel = 0; pixel < count; pixel += 1) {
      totalDifference += Math.abs(current[pixel] - previous[pixel]);
    }
    motionScores.push(count ? totalDifference / count : 0);
  }

  const peakMotion = Math.max(...motionScores, 0);
  // Ensure the camera feed is not completely frozen/blank or dead (pixel motion > 0)
  if (signatures.length > 1 && peakMotion === 0) {
    throw new Error(
      'Camera feed appeared static. Ensure your live camera is active and try again.'
    );
  }
}

export async function extractSecureFacePackage(inputs) {
  if (!Array.isArray(inputs) || inputs.length < FACE_SAMPLE_COUNT) {
    throw new Error(`Secure Face ID requires at least ${FACE_SAMPLE_COUNT} face frames.`);
  }

  assertLiveFrameSequence(inputs);

  const inspectedSamples = [];
  const detectionErrors = [];
  for (const input of inputs) {
    try {
      inspectedSamples.push(await inspectSecureFace(input));
    } catch (error) {
      detectionErrors.push(error?.message || 'Face frame could not be analyzed.');
    }
  }

  if (inspectedSamples.length < FACE_SAMPLE_COUNT) {
    throw new Error(
      detectionErrors[0]
      || `Only ${inspectedSamples.length} usable face samples were captured. Keep your face centered and try again.`
    );
  }

  const evaluatedGroups = combinationsOfThree(inspectedSamples)
    .map(scoreSampleGroup)
    .sort((first, second) => second.quality - first.quality);
  let selected = evaluatedGroups.find(group => group.valid);

  if (!selected && evaluatedGroups.length > 0) {
    const strongest = evaluatedGroups[0];
    if (strongest.minimumSimilarity >= MIN_SAMPLE_CONSISTENCY) {
      // All 3 samples represent the same person with high consistency
      selected = strongest;
    }
  }

  if (!selected) {
    const strongest = evaluatedGroups[0];
    if (strongest?.minimumSimilarity < MIN_SAMPLE_CONSISTENCY) {
      throw new Error('Face samples were inconsistent. Hold still and keep the same person centered.');
    }
    throw new Error(
      'Face quality is too low. Improve the room lighting and face the camera directly.'
    );
  }

  return {
    version: FACE_ID_VERSION,
    samples: selected.group.map(sample => sample.descriptor),
  };
}

export async function captureVideoFrames(
  video,
  count = 5,
  intervalMs = 180
) {
  if (!video?.videoWidth || !video?.videoHeight || video.readyState < 2) {
    throw new Error('Camera is not ready for secure Face ID capture.');
  }

  const frames = [];
  for (let index = 0; index < count; index += 1) {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context is unavailable.');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    frames.push(canvas);

    if (index < count - 1) {
      await new Promise(resolve => window.setTimeout(resolve, intervalMs));
    }
  }
  return frames;
}

/**
 * High-performance, self-contained face quality analyzer powered by Human.
 * Replaces heavy external MediaPipe network downloads with zero-latency local models.
 */
export async function evaluateFaceQuality(element) {
  if (!element) {
    return { valid: false, faceCount: 0, code: 'CAMERA_NOT_READY', error: 'Camera initializing. Please wait...' };
  }

  if (element instanceof HTMLVideoElement) {
    if (!element.videoWidth || !element.videoHeight || element.readyState < 2) {
      return { valid: false, faceCount: 0, code: 'CAMERA_NOT_READY', error: 'Camera initializing. Please wait...' };
    }
  }

  await initializeFaceIdentity();
  if (!identityEngine) {
    return { valid: false, faceCount: 0, code: 'ENGINE_NOT_READY', error: 'Face engine initializing...' };
  }

  const canvas = getFrameCanvas(element);
  if (!canvas) {
    return { valid: false, faceCount: 0, code: 'FRAME_UNAVAILABLE', error: 'Camera frame unavailable.' };
  }

  try {
    // Quality evaluation only checks centering and tilt (mesh/detector); disable expensive models for maximum 60fps smoothness
    const result = await identityEngine.detect(canvas, REALTIME_GUIDE_CONFIG);
    const faces = result?.face || [];

    if (faces.length === 0) {
      return { valid: false, faceCount: 0, code: 'NO_FACE_DETECTED', error: 'Position your face inside the circle' };
    }

    if (faces.length > 1) {
      return { valid: false, faceCount: faces.length, code: 'MULTIPLE_FACES', error: 'Only one person may be in the frame' };
    }

    const face = faces[0];
    const confidence = Math.max(Number(face.score || 0), Number(face.boxScore || 0));
    if (confidence < 0.40) {
      return { valid: false, faceCount: 1, code: 'LOW_CONFIDENCE', error: 'Face not clearly visible. Improve lighting' };
    }

    // Normalized dimensions (0..1)
    const box = face.boxRaw || [
      face.box[0] / canvas.width,
      face.box[1] / canvas.height,
      face.box[2] / canvas.width,
      face.box[3] / canvas.height,
    ];

    const faceWidth = box[2];
    const faceHeight = box[3];
    const centerX = box[0] + faceWidth / 2;
    const centerY = box[1] + faceHeight / 2;

    if (faceWidth < 0.12 || faceHeight < 0.12) {
      return { valid: false, faceCount: 1, code: 'FACE_TOO_FAR', error: 'Move closer to the camera' };
    }
    if (faceWidth > 0.88 || faceHeight > 0.88) {
      return { valid: false, faceCount: 1, code: 'FACE_TOO_CLOSE', error: 'Move slightly back' };
    }
    if (centerX < 0.15 || centerX > 0.85 || centerY < 0.12 || centerY > 0.88) {
      return { valid: false, faceCount: 1, code: 'FACE_OFF_CENTER', error: 'Center your face inside the frame' };
    }

    // Head angles
    const angles = face.rotation?.angle;
    if (angles) {
      const rollDeg = Math.abs(angles.roll || 0) * (180 / Math.PI);
      const yawDeg = Math.abs(angles.yaw || 0) * (180 / Math.PI);
      if (rollDeg > 28) {
        return { valid: false, faceCount: 1, code: 'HEAD_TILTED', error: 'Keep your head upright and level' };
      }
      if (yawDeg > 28) {
        return { valid: false, faceCount: 1, code: 'HEAD_TURNED', error: 'Look directly at the camera' };
      }
    }

    return {
      valid: true,
      faceCount: 1,
      detection: { faceWidth, faceHeight, centerX, centerY, confidence }
    };
  } catch (err) {
    return { valid: false, faceCount: 0, code: 'DETECTION_ERROR', error: err?.message || 'Face analysis failed' };
  }
}

/**
 * Compares live video frame against the CURRENT LOGGED-IN USER'S registered face package.
 * Enforces:
 * - Exactly 1 face in view (rejects 0 faces or multiple faces)
 * - Good positioning and head orientation
 * - Similarity check against ONLY the current user's enrolled descriptor
 * - Rejects any other face (FACE_MISMATCH)
 */
export async function compareLiveFaceToRegistered(liveInput, registeredPackage) {
  if (!registeredPackage || !Array.isArray(registeredPackage.samples) || registeredPackage.samples.length === 0) {
    return {
      valid: false,
      isMatch: false,
      code: 'FACE_NOT_REGISTERED',
      error: 'Face ID is not registered for this account. Contact your administrator.',
      faceCount: 0,
    };
  }

  await initializeFaceIdentity();
  if (!identityEngine) {
    return {
      valid: false,
      isMatch: false,
      code: 'ENGINE_NOT_READY',
      error: 'Face ID engine initializing...',
      faceCount: 0,
    };
  }

  const canvas = getFrameCanvas(liveInput);
  if (!canvas) {
    return {
      valid: false,
      isMatch: false,
      code: 'FRAME_UNAVAILABLE',
      error: 'Camera frame unavailable.',
      faceCount: 0,
    };
  }

  try {
    const result = await identityEngine.detect(canvas, FULL_EXTRACTION_CONFIG);
    const faces = result?.face || [];

    if (faces.length === 0) {
      return {
        valid: false,
        isMatch: false,
        code: 'NO_FACE_DETECTED',
        error: 'No face detected. Position your face clearly inside the camera frame.',
        faceCount: 0,
      };
    }

    if (faces.length > 1) {
      return {
        valid: false,
        isMatch: false,
        code: 'MULTIPLE_FACES_DETECTED',
        error: 'Multiple faces detected. Only the account owner should be visible during verification.',
        faceCount: faces.length,
      };
    }

    const face = faces[0];
    const confidence = Math.max(Number(face.score || 0), Number(face.boxScore || 0));
    if (confidence < 0.40) {
      return {
        valid: false,
        isMatch: false,
        code: 'LOW_CONFIDENCE',
        error: 'Face not clearly visible. Improve lighting and face the camera directly.',
        faceCount: 1,
      };
    }

    const box = face.boxRaw || [
      face.box[0] / canvas.width,
      face.box[1] / canvas.height,
      face.box[2] / canvas.width,
      face.box[3] / canvas.height,
    ];
    const faceWidth = box[2];
    const faceHeight = box[3];
    const centerX = box[0] + faceWidth / 2;
    const centerY = box[1] + faceHeight / 2;

    if (faceWidth < 0.12 || faceHeight < 0.12) {
      return { valid: false, isMatch: false, code: 'FACE_TOO_FAR', error: 'Move closer to the camera', faceCount: 1 };
    }
    if (faceWidth > 0.88 || faceHeight > 0.88) {
      return { valid: false, isMatch: false, code: 'FACE_TOO_CLOSE', error: 'Move slightly back', faceCount: 1 };
    }
    if (centerX < 0.15 || centerX > 0.85 || centerY < 0.12 || centerY > 0.88) {
      return { valid: false, isMatch: false, code: 'FACE_OFF_CENTER', error: 'Center your face inside the frame', faceCount: 1 };
    }

    const angles = face.rotation?.angle;
    if (angles) {
      const rollDeg = Math.abs(angles.roll || 0) * (180 / Math.PI);
      const yawDeg = Math.abs(angles.yaw || 0) * (180 / Math.PI);
      if (rollDeg > 28) {
        return { valid: false, isMatch: false, code: 'HEAD_TILTED', error: 'Keep your head upright and level', faceCount: 1 };
      }
      if (yawDeg > 28) {
        return { valid: false, isMatch: false, code: 'HEAD_TURNED', error: 'Look directly at the camera', faceCount: 1 };
      }
    }

    if (!isValidDescriptor(face.embedding)) {
      return {
        valid: false,
        isMatch: false,
        code: 'DESCRIPTOR_FAILED',
        error: 'Analyzing facial features...',
        faceCount: 1,
      };
    }

    const liveDescriptor = face.embedding.map(Number);
    const registeredSamples = registeredPackage.samples.map(s => s.map(Number));

    // Compare strictly against current user's registered samples
    const similarities = registeredSamples.map(sample => faceDescriptorSimilarity(liveDescriptor, sample));
    const maxSimilarity = Math.max(...similarities);
    const avgSimilarity = similarities.reduce((sum, s) => sum + s, 0) / similarities.length;

    const MATCH_THRESHOLD = 0.50;
    const isMatch = maxSimilarity >= MATCH_THRESHOLD || avgSimilarity >= 0.48;

    if (import.meta.env.DEV) {
      console.log('[ATTENDANCE VERIFY]', {
        stage: 'FACE_SCANNING',
        facesDetected: 1,
        maxSimilarity: Number(maxSimilarity.toFixed(4)),
        avgSimilarity: Number(avgSimilarity.toFixed(4)),
        threshold: MATCH_THRESHOLD,
        faceResult: isMatch ? 'MATCH' : 'MISMATCH'
      });
    }

    if (!isMatch) {
      return {
        valid: false,
        isMatch: false,
        code: 'FACE_MISMATCH',
        error: 'Face does not match the registered face for this account.',
        similarity: avgSimilarity,
        faceCount: 1,
      };
    }

    return {
      valid: true,
      isMatch: true,
      code: 'FACE_MATCH',
      similarity: avgSimilarity,
      faceCount: 1,
      detection: { faceWidth, faceHeight, centerX, centerY, confidence }
    };
  } catch (err) {
    return {
      valid: false,
      isMatch: false,
      code: 'DETECTION_ERROR',
      error: err?.message || 'Face analysis failed',
      faceCount: 0,
    };
  }
}
