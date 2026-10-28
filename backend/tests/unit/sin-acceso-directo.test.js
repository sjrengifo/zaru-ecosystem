// HU-41 CA1: ningún controlador consulta la base sin pasar por la capa multi-tenant.
// Si alguien escribe `supabase.from(...)` en un controlador, esta prueba falla en CI.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '../../src');

function archivos(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? archivos(join(dir, e.name)) : e.name.endsWith('.js') ? [join(dir, e.name)] : [],
  );
}

// Únicos archivos autorizados a usar el cliente service_role directamente.
const PERMITIDOS = ['config/supabase.js', 'shared/tenant.js', 'shared/auditoria.js', 'middlewares/auth.js'];

describe('acceso a datos', () => {
  it('los controladores y servicios solo usan req.tenant', () => {
    const infractores = archivos(raiz)
      .map((ruta) => ({ ruta: ruta.slice(raiz.length + 1), codigo: readFileSync(ruta, 'utf8') }))
      .filter(({ ruta }) => !PERMITIDOS.includes(ruta))
      .filter(({ codigo }) => /\bsupabase\s*\.\s*from\s*\(|config\/supabase\.js/.test(codigo))
      .map(({ ruta }) => ruta);
    expect(infractores).toEqual([]);
  });
});
