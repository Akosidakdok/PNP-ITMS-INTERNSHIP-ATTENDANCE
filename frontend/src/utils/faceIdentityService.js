export const FACE_ID_VERSION = 'human-faceres-v1';
export const FACE_DESCRIPTOR_LENGTH = 1024;
export const FACE_SAMPLE_COUNT = 3;
export const FACE_CAPTURE_FRAME_COUNT = 6;

const MIN_FACE_CONFIDENCE = 0.7;
const MIN_REAL_SAMPLE_SCORE = 0.35;
const MIN_LIVE_SAMPLE_SCORE = 0.25;
const MIN_REAL_AVERAGE = 0.5;
const MIN_LIVE_AVERAGE = 0.35;
const MAX_HEAD_ANGLE_RADIANS = 0.35;
const MIN_SAMPLE_CONSISTENCY = 0.65;
const MIN_SEQUENCE_PEAK_MOTION = 0.35;
const MIN_SEQUENCE_AVERAGE_MOTION = 0.08;

const appBase = import.meta.env.BASE_URL || '/';
const normalizedBase = appBase.endsWith('/') ? appBase : `${appBase}/`;

const identityConfig = {
  backend: 'webgl',
  modelBasePath: `${normalizedBase}models/human/`,
  cacheSensitivity: 0,
  filter: {
    enabled: true,
    equalization: true,
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
      minConfidence: 0.6,
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

export async function initializeFaceIdentity() {
  if (!identityInitializationPromise) {
    identityInitializationPromise = (async () => {
      const { default: Human } = await import('@vladmandic/human');
      identityEngine = new Human(identityConfig);
      await identityEngine.load();
      await identityEngine.warmup();
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
    throw new Error('No face detected by the secure identity model.');
  }
  if (faces.length > 1) {
    throw new Error('Multiple faces detected. Only the enrolled user may be in the frame.');
  }

  const face = faces[0];
  const confidence = Math.min(
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
    real: Number(face.real || 0),
    live: Number(face.live || 0),
  };
}

async function inspectSecureFace(input) {
  await initializeFaceIdentity();
  if (!identityEngine) {
    throw new Error('Secure Face ID engine is unavailable.');
  }
  const result = await identityEngine.detect(input);
  return inspectIdentityResult(result);
}

export async function extractSecureFaceDescriptor(input) {
  const sample = await inspectSecureFace(input);
  if (sample.real < MIN_REAL_SAMPLE_SCORE || sample.live < MIN_LIVE_SAMPLE_SCORE) {
    throw new Error(
      `Live-face confidence is too low (${Math.round(sample.live * 100)}% live, ${Math.round(sample.real * 100)}% real). Improve the lighting and move naturally.`
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
  const stepX = Math.max(4, Math.floor((endX - startX) / 48));
  const stepY = Math.max(4, Math.floor((endY - startY) / 48));
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
  const averageMotion = motionScores.length
    ? motionScores.reduce((sum, score) => sum + score, 0) / motionScores.length
    : 0;

  if (
    peakMotion < MIN_SEQUENCE_PEAK_MOTION
    || averageMotion < MIN_SEQUENCE_AVERAGE_MOTION
  ) {
    throw new Error(
      'The camera sequence appears frozen. Use a live camera, blink once, and move your head slightly.'
    );
  }
}

export async function extractSecureFacePackage(inputs) {
  if (!Array.isArray(inputs) || inputs.length < FACE_SAMPLE_COUNT) {
    throw new Error(`Secure Face ID requires ${FACE_SAMPLE_COUNT} consecutive face samples.`);
  }

  assertLiveFrameSequence(inputs);

  const inspectedSamples = [];
  const detectionErrors = [];
  for (const input of inputs) {
    try {
      inspectedSamples.push(await inspectSecureFace(input));
    } catch (error) {
      detectionErrors.push(error?.message || 'Face sample could not be analyzed.');
    }
  }

  if (inspectedSamples.length < FACE_SAMPLE_COUNT) {
    throw new Error(
      detectionErrors[0]
      || `Only ${inspectedSamples.length} usable face samples were captured. Keep one face centered and try again.`
    );
  }

  const evaluatedGroups = combinationsOfThree(inspectedSamples)
    .map(scoreSampleGroup)
    .sort((first, second) => second.quality - first.quality);
  const selected = evaluatedGroups.find(group => group.valid);

  if (!selected) {
    const strongest = evaluatedGroups[0];
    if (strongest?.minimumSimilarity < MIN_SAMPLE_CONSISTENCY) {
      throw new Error('Face samples were inconsistent. Keep the same person centered for the entire capture.');
    }
    throw new Error(
      `Live-face confidence is too low (${Math.round((strongest?.averageLive || 0) * 100)}% live, ${Math.round((strongest?.averageReal || 0) * 100)}% real). Improve the lighting, blink once, and move your head slightly.`
    );
  }

  return {
    version: FACE_ID_VERSION,
    samples: selected.group.map(sample => sample.descriptor),
  };
}

export async function captureVideoFrames(
  video,
  count = FACE_CAPTURE_FRAME_COUNT,
  intervalMs = 280
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
