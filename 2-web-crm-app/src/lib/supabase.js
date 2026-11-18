import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Tryb demo włącza się automatycznie, gdy w .env nie ma prawdziwych kluczy
export const isDemo =
  import.meta.env.VITE_DEMO_MODE === 'true' ||
  !url ||
  !key ||
  url.includes('TWOJ-PROJEKT') ||
  key.includes('TWOJ_KLUCZ');

export const supabase = isDemo
  ? null
  : createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'lead-crm-auth',
      },
    });
