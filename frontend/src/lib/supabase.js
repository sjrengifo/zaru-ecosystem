// Conexión con Supabase desde el navegador (login y tiempo real).
// Usa la "anon key", que es pública. Los datos están protegidos por RLS.
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.warn('⚠️ Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en frontend/.env');
}

export const supabase = createClient(url || 'http://localhost', anonKey || 'sin-clave');
