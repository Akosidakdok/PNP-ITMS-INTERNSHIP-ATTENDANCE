import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { supabase } from './supabaseClient.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in .env');
}

export async function loginUser(username, password) {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('username', username)
    .single();

  if (error) {
    throw new Error(error.details || error.message || 'Login error');
  }

  if (!data) {
    throw new Error('Invalid username or password');
  }

  const isValid = await bcrypt.compare(password, data.password_hash);
  if (!isValid) {
    throw new Error('Invalid username or password');
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
    department_name: divName
  };

  const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '8h' });

  return {
    user: userPayload,
    token,
  };
}
