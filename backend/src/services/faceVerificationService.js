import { supabase } from '../supabaseClient.js';
import {
  compareFacePackages,
  validateFacePackage,
} from '../utils/compareFaces.js';

const MAX_FACE_PHOTO_BYTES = 2 * 1024 * 1024;
const DEFAULT_IDENTITY_MARGIN = 0.08;

function parseStoredFacePackage(value) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function invalidEnrollmentResult(message) {
  return {
    verified: false,
    similarity: 0,
    distance: 999,
    code: 'FACE_NOT_REGISTERED',
    message,
  };
}

function safelyCompareFacePackages(livePackage, storedValue) {
  const storedPackage = parseStoredFacePackage(storedValue);
  try {
    return compareFacePackages(livePackage, validateFacePackage(storedPackage));
  } catch {
    return null;
  }
}

async function findCompetingIdentity(livePackage, claimedUserId) {
  const { data: accounts, error } = await supabase
    .from('accounts')
    .select('id, face_embedding')
    .eq('face_registered', true)
    .neq('id', Number(claimedUserId));

  if (error) {
    console.error('Face identity uniqueness lookup failed:', error);
    const lookupError = new Error('Unable to confirm face identity uniqueness. Please try again.');
    lookupError.code = 'FACE_IDENTITY_CHECK_FAILED';
    throw lookupError;
  }

  let strongestCompetitor = null;
  for (const account of accounts || []) {
    const comparison = safelyCompareFacePackages(livePackage, account.face_embedding);
    if (!comparison) continue;
    if (!strongestCompetitor || comparison.similarity > strongestCompetitor.similarity) {
      strongestCompetitor = {
        accountId: account.id,
        ...comparison,
      };
    }
  }

  return strongestCompetitor;
}

export function validateFacePhoto(photo) {
  if (typeof photo !== 'string' || !/^data:image\/jpeg;base64,/i.test(photo)) {
    throw new Error('A JPEG enrollment photo is required');
  }

  const encoded = photo.slice(photo.indexOf(',') + 1);
  const estimatedBytes = Math.floor(encoded.length * 0.75);
  if (estimatedBytes <= 0 || estimatedBytes > MAX_FACE_PHOTO_BYTES) {
    throw new Error('Enrollment photo must be smaller than 2 MB');
  }

  return photo;
}

/**
 * Registers a versioned, multi-sample Face ID package for a user.
 * The same identity cannot be enrolled to another account.
 * @param {number|string} userId
 * @param {{version: string, samples: number[][]}} facePackage
 * @param {string} photoUrl
 */
export async function registerUserFace(userId, facePackage, photoUrl, {
  actorId,
  reason,
  requestId = null,
} = {}) {
  if (!userId) {
    throw new Error('User ID is required for face registration');
  }
  if (!actorId) {
    throw new Error('Enrollment actor is required');
  }
  const cleanReason = String(reason || '').trim();
  if (cleanReason.length < 10 || cleanReason.length > 500) {
    throw new Error('Enrollment reason must be between 10 and 500 characters');
  }

  const validatedPackage = validateFacePackage(facePackage);
  const validatedPhoto = validateFacePhoto(photoUrl);

  const duplicateIdentity = await findCompetingIdentity(validatedPackage, userId);
  if (duplicateIdentity?.isMatch) {
    const duplicateError = new Error(
      'This face is already enrolled to another account. Enrollment was rejected.'
    );
    duplicateError.code = 'FACE_ALREADY_ENROLLED';
    throw duplicateError;
  }

  const { data, error } = await supabase
    .rpc('complete_face_enrollment', {
      p_intern_id: Number(userId),
      p_embedding: validatedPackage,
      p_photo: validatedPhoto,
      p_actor_id: Number(actorId),
      p_reason: cleanReason,
      p_request_id: requestId ? Number(requestId) : null,
    });

  if (error) {
    console.error('Supabase face registration error:', error);
    if (error.code === 'PGRST202' || /complete_face_enrollment/i.test(error.message || '')) {
      throw new Error('Face enrollment workflow is not installed. Run migration_face_enrollment_workflow.sql first.');
    }
    throw new Error(error.message || 'Failed to save face registration');
  }

  return data;
}

/**
 * Verifies a live Face ID package against the claimed user and all other
 * securely enrolled accounts. A scan fails if another identity is a plausible
 * match or the claimed account does not pass every sample threshold.
 * @param {number|string} userId
 * @param {{version: string, samples: number[][]}} livePackage
 */
export async function verifyUserFace(userId, livePackage) {
  if (!userId) {
    throw new Error('User ID is required for face verification');
  }

  let validatedLivePackage;
  try {
    validatedLivePackage = validateFacePackage(livePackage);
  } catch (error) {
    return {
      verified: false,
      similarity: 0,
      distance: 999,
      code: 'INVALID_FACE_CAPTURE',
      message: error.message || 'Secure face capture is invalid. Please try again.',
    };
  }

  const { data: user, error } = await supabase
    .from('accounts')
    .select('id, face_embedding, face_registered')
    .eq('id', userId)
    .single();

  if (error || !user) {
    throw new Error('User account not found');
  }

  if (!user.face_registered || !user.face_embedding) {
    return invalidEnrollmentResult(
      'Secure Face ID is not registered. Ask authorized staff to enroll your face.'
    );
  }

  const storedPackage = parseStoredFacePackage(user.face_embedding);
  try {
    validateFacePackage(storedPackage);
  } catch {
    return invalidEnrollmentResult(
      'Your previous Face ID was disabled because it cannot securely identify you. Ask authorized staff to re-enroll your face.'
    );
  }

  const claimedResult = compareFacePackages(validatedLivePackage, storedPackage);
  if (!claimedResult.isMatch) {
    return {
      verified: false,
      similarity: claimedResult.similarity,
      distance: claimedResult.distance,
      code: 'FACE_MISMATCH',
      message: 'This face does not match the signed-in user. Attendance was not recorded.',
    };
  }

  const competingIdentity = await findCompetingIdentity(validatedLivePackage, userId);
  const identityMargin = Number(
    process.env.FACE_IDENTITY_MARGIN || DEFAULT_IDENTITY_MARGIN
  );
  const identityConflict = competingIdentity?.isMatch
    && competingIdentity.similarity + identityMargin >= claimedResult.similarity;

  if (identityConflict) {
    return {
      verified: false,
      similarity: claimedResult.similarity,
      distance: claimedResult.distance,
      code: 'FACE_IDENTITY_CONFLICT',
      message: 'Face identity is ambiguous or belongs to another account. Attendance was not recorded.',
    };
  }

  return {
    verified: true,
    similarity: claimedResult.similarity,
    distance: claimedResult.distance,
    sample_similarities: claimedResult.sampleSimilarities,
    message: 'Face identity verified successfully.',
  };
}
