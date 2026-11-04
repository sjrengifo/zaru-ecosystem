// Conexión con Supabase usando la "service_role key".
// Esta clave tiene permisos totales: SOLO se usa en el backend.
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('⚠️  Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en backend/.env');
}

export const supabase = createClient(
  SUPABASE_URL || 'http://localhost',
  SUPABASE_SERVICE_ROLE_KEY || 'sin-clave',
  { auth: { persistSession: false } }
);
