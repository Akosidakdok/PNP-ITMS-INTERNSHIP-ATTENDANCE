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
    .select('id, username, password_hash, role, full_name, email')
    .eq('username', username)
    .single();

  if (error || !data) {
    throw new Error('Invalid username or password');
  }

  const isValid = await bcrypt.compare(password, data.password_hash);
  if (!isValid) {
    throw new Error('Invalid username or password');
  }

  const token = jwt.sign({ userId: data.id, role: data.role }, JWT_SECRET, { expiresIn: '8h' });

  return {
    user: {
      id: data.id,
      username: data.username,
      full_name: data.full_name,
      email: data.email,
      role: data.role,
    },
    token,
  };
}
