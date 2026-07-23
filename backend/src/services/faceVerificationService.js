import { supabase } from '../supabaseClient.js';
import { compareFaceEmbeddings } from '../utils/compareFaces.js';

/**
 * Registers a user's facial embedding in Supabase accounts table.
 * @param {number|string} userId 
 * @param {number[]} embedding 
 * @param {string} [photoUrl] 
 */
export async function registerUserFace(userId, embedding, photoUrl = null) {
  if (!userId) {
    throw new Error('User ID is required for face registration');
  }
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error('Valid facial embedding vector is required');
  }

  const updatePayload = {
    face_embedding: embedding,
    face_registered: true,
    face_registered_at: new Date().toISOString(),
  };

  if (photoUrl) {
    updatePayload.face_photo = photoUrl;
  }

  const { data, error } = await supabase
    .from('accounts')
    .update(updatePayload)
    .eq('id', userId)
    .select('id, full_name, email, face_registered, face_registered_at')
    .single();

  if (error) {
    console.error('Supabase face registration error:', error);
    throw new Error(`Failed to save face registration: ${error.message}`);
  }

  return data;
}

/**
 * Verifies a live facial embedding against the stored embedding for the given user.
 * @param {number|string} userId 
 * @param {number[]} liveEmbedding 
 */
export async function verifyUserFace(userId, liveEmbedding) {
  if (!userId) {
    throw new Error('User ID is required for face verification');
  }
  if (!Array.isArray(liveEmbedding) || liveEmbedding.length === 0) {
    throw new Error('Valid live face embedding is required for verification');
  }

  const { data: user, error } = await supabase
    .from('accounts')
    .select('id, full_name, face_embedding, face_registered')
    .eq('id', userId)
    .single();

  if (error || !user) {
    throw new Error('User account not found');
  }

  if (!user.face_registered || !user.face_embedding) {
    return {
      verified: false,
      similarity: 0,
      distance: 999,
      code: 'FACE_NOT_REGISTERED',
      message: 'Face embedding not registered. Please register your face in your profile first.'
    };
  }

  let storedEmbedding = user.face_embedding;
  // If retrieved as JSON string from DB, parse it
  if (typeof storedEmbedding === 'string') {
    try {
      storedEmbedding = JSON.parse(storedEmbedding);
    } catch (e) {
      return {
        verified: false, similarity: 0, distance: 999,
        code: 'FACE_NOT_REGISTERED',
        message: 'Stored face data is corrupted. Please re-register your face in your profile.'
      };
    }
  }

  // Normalize: Supabase jsonb may return an object like { "0": 0.1, "1": 0.2, ... }
  if (storedEmbedding && !Array.isArray(storedEmbedding) && typeof storedEmbedding === 'object') {
    storedEmbedding = Object.values(storedEmbedding);
  }

  // Validate it's a usable flat numeric array
  if (!Array.isArray(storedEmbedding) || storedEmbedding.length === 0) {
    return {
      verified: false, similarity: 0, distance: 999,
      code: 'FACE_NOT_REGISTERED',
      message: 'Stored face embedding is invalid. Please re-register your face in your profile.'
    };
  }

  // Dimension mismatch between old and new embedding format — prompt re-registration
  if (storedEmbedding.length !== liveEmbedding.length) {
    return {
      verified: false, similarity: 0, distance: 999,
      code: 'FACE_NOT_REGISTERED',
      message: 'Your face registration is outdated. Please re-register your face in your profile.'
    };
  }

  let result;
  try {
    result = compareFaceEmbeddings(liveEmbedding, storedEmbedding);
  } catch (compareErr) {
    console.error('Face comparison error:', compareErr.message);
    return {
      verified: false, similarity: 0, distance: 999,
      code: 'FACE_NOT_REGISTERED',
      message: 'Face comparison failed. Please re-register your face in your profile.'
    };
  }

  if (result.dimensionMismatch) {
    return {
      verified: false, similarity: 0, distance: 999,
      code: 'FACE_NOT_REGISTERED',
      message: 'Your facial registration profile format is outdated. Please re-register your face in your profile.'
    };
  }

  if (result.isMatch) {
    return {
      verified: true,
      similarity: result.similarity,
      distance: result.distance,
      message: 'Face verified successfully.'
    };
  } else {
    return {
      verified: false,
      similarity: result.similarity,
      distance: result.distance,
      code: 'FACE_MISMATCH',
      message: 'Face verification failed. Please try again.'
    };
  }
}
