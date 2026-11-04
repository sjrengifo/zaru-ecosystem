// HU-41 CA1: los controladores de establecimientos usan req.tenant.
// Se permiten excepciones justificadas para autenticación y operaciones globales.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '../../src');

function archivos(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? archivos(join(dir, e.name))
      : e.name.endsWith('.js')
        ? [join(dir, e.name)]
        : [],
  );
}

// Excepciones justificadas:
// - auth.js: debe validar el token y resolver el perfil antes de crear req.tenant.
// - superadmin.controller.js: realiza operaciones globales sobre establecimientos.
// - usuarios.controller.js (HU-02): usa la Admin API de Auth para invitar y leer correos, e inserta
//   el perfil con el id que devuelve Auth (req.tenant.crear no permite fijarlo).
// - auditoria.js y politicas.js: utilidades compartidas.
const PERMITIDOS = new Set([
  'config/supabase.js',
  'shared/tenant.js',
  'shared/auditoria.js',
  'shared/politicas.js',
  'middlewares/auth.js',
  'controllers/superadmin.controller.js',
  'controllers/usuarios.controller.js',
]);

describe('acceso a datos', () => {
  it('los controladores y servicios de cada tenant usan req.tenant', () => {
    const infractores = archivos(raiz)
      .map((ruta) => ({
        ruta: ruta.slice(raiz.length + 1).replaceAll('\\', '/'),
        codigo: readFileSync(ruta, 'utf8'),
      }))
      .filter(({ ruta }) => !PERMITIDOS.has(ruta))
      .filter(({ codigo }) =>
        /\bsupabase\s*\.\s*from\s*\(|config\/supabase\.js/.test(codigo),
      )
      .map(({ ruta }) => ruta);

    expect(infractores).toEqual([]);
  });
});