import bcrypt from 'bcryptjs';
import { supabase } from './supabaseClient.js';
import { createSession } from './services/sessionService.js';
import {
  completeLoginSuccess,
  getLoginBlockState,
  recordLoginFailure,
} from './security/attemptLockoutService.js';

if (!process.env.JWT_SECRET) {
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
  if (['archived', 'inactive', 'disabled'].includes(String(data.status || '').toLowerCase())) {
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

  return createSession(data);
}
