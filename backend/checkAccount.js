import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('MISSING ENV VARS', { supabaseUrl, supabaseKey });
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const username = process.argv[2] || 'intern';

async function main() {
  const { data, error } = await supabase.from('accounts').select('*').eq('username', username).single();
  if (error) {
    console.error('ERROR', error);
    process.exit(1);
  }
  console.log('FOUND', JSON.stringify(data, null, 2));
}

main().catch(err => { console.error('FATAL', err); process.exit(1); });
