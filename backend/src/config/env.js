// HU-50 CA3 / RNF-F0-01 — Variables de entorno validadas al arrancar.
// Los secretos viven en el gestor de cada ambiente (Render, GitHub Secrets) o en backend/.env
// (ignorado por git), nunca en el código. Si falta uno obligatorio, el servidor no arranca.
import { z } from 'zod';

const base64De32Bytes = z
  .string()
  .refine((v) => Buffer.from(v, 'base64').length === 32, 'debe ser una clave de 32 bytes en base64 (openssl rand -base64 32)');

const esquema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    SUPABASE_URL: z.string().url().startsWith('https://', 'debe usar https://'),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20, 'falta la clave secreta de Supabase'),
    FRONTEND_URL: z.string().url().default('http://localhost:5173'),
    ZARU_CLAVE_CIFRADO: base64De32Bytes,
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.FRONTEND_URL.startsWith('https://')) {
      ctx.addIssue({ code: 'custom', path: ['FRONTEND_URL'], message: 'en producción debe usar https://' });
    }
  });

/** Valida un objeto de variables. Lanza un error que nombra cada variable faltante o inválida, sin mostrar valores. */
export function validarEntorno(variables = process.env) {
  const resultado = esquema.safeParse(variables);
  if (!resultado.success) {
    const lista = resultado.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuración inválida. Revisa backend/.env o las variables del ambiente:\n${lista}`);
  }
  return Object.freeze(resultado.data);
}
