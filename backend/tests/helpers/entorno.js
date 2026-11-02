// Carga las variables de entorno locales para las pruebas de integración, si existen.
// - .env: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY del backend.
// - .env.spike.local: SUPABASE_ANON_KEY y los usuarios de prueba de los establecimientos A y B.
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '../..');
for (const archivo of ['.env', '.env.spike.local']) {
  const ruta = join(raiz, archivo);
  if (existsSync(ruta) && typeof process.loadEnvFile === 'function') process.loadEnvFile(ruta);
}

export const REQUERIDAS = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY', 'SPIKE_A_EMAIL', 'SPIKE_B_EMAIL', 'SPIKE_PASSWORD'];
export const faltantes = REQUERIDAS.filter((v) => !process.env[v]);
export const hayEntornoIntegracion = faltantes.length === 0;
