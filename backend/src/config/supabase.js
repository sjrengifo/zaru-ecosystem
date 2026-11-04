// Conexión con Supabase usando la "service_role key".
// Esta clave tiene permisos totales: SOLO se usa en el backend.
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('⚠️  Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en backend/.env');
}

// El backend solo usa REST, pero @supabase/supabase-js inicializa Realtime al
// crear el cliente. Node 22 ya trae WebSocket nativo; en Node 20 hay que
// entregarle una implementación o el proceso falla al arrancar.
const opciones = { auth: { persistSession: false } };
if (typeof globalThis.WebSocket === 'undefined') {
  opciones.realtime = { transport: WebSocket };
}

export const supabase = createClient(
  SUPABASE_URL || 'http://localhost',
  SUPABASE_SERVICE_ROLE_KEY || 'sin-clave',
  opciones
);
