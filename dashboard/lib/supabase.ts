import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error(
    'Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local'
  );
}

// Client server-side (service role). Nunca importar em componentes "use client".
export const supabase = createClient(url, key, {
  auth: { persistSession: false },
});
