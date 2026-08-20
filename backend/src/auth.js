import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { supabase } from './supabaseClient.js';
import {
  completeLoginSuccess,
  getLoginBlockState,
  recordLoginFailure,
} from './security/attemptLockoutService.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in .env');
}

function invalidCredentialsError() {
  const error = new Error('Invalid username or password');
  error.code = 'INVALID_CREDENTIALS';
  error.statusCode = 401;
  return error;
}

function loginBlockError(block) {
  const error = new Error(block.message);
  error.code = block.code;
  error.statusCode = 429;
  error.retryAfterSeconds = block.retryAfterSeconds;
  return error;
}

export async function loginUser(username, password) {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('username', username)
    .single();

  if (error) {
    if (error.code === 'PGRST116') throw invalidCredentialsError();
    const loginError = new Error('Unable to process login');
    loginError.code = 'LOGIN_SERVICE_UNAVAILABLE';
    loginError.statusCode = 503;
    throw loginError;
  }

  if (!data) {
    throw invalidCredentialsError();
  }

  const existingBlock = getLoginBlockState(data);
  if (existingBlock.blocked) {
    throw loginBlockError(existingBlock);
  }

  const isValid = await bcrypt.compare(password, data.password_hash);
  if (!isValid) {
    const failureBlock = await recordLoginFailure(data.id);
    if (failureBlock.blocked) {
      throw loginBlockError(failureBlock);
    }
    throw invalidCredentialsError();
  }

  const completionBlock = await completeLoginSuccess(data.id);
  if (completionBlock.blocked) {
    throw loginBlockError(completionBlock);
  }

  const divId = data.division_id ?? data.department_id ?? null;
  const divName = data.division_name ?? data.department_name ?? null;

  const userPayload = {
    id: data.id,
    username: data.username,
    full_name: data.full_name,
    email: data.email,
    role: data.role,
    division_id: divId,
    division_name: divName,
    department_id: divId,
    department_name: divName,
    face_registered: Boolean(data.face_registered),
    self_face_enrollment_available: Boolean(data.self_face_enrollment_available),
  };

  const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '8h' });

  return {
    user: userPayload,
    token,
  };
}
