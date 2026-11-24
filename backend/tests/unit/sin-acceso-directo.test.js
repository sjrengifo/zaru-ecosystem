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
// - accesoCliente.js (HU-17): igual que seguimiento.js, solo busca la sede por su slug (único en la
//   plataforma) y el resto lo lee con el acceso del tenant de esa sede.
// - bajaPublica.js (HU-30): el enlace "dejar de recibir" no tiene sesión; el token firmado trae el
//   establecimiento y el resto se lee con el acceso del tenant de ese establecimiento.
// - seguimiento.js (HU-18): el cliente final no tiene sesión; solo busca la orden por su código de
//   seguimiento (único en la plataforma) y el resto lo lee con el acceso del tenant de esa orden.
// - paseCliente.js (HU-23/HU-24): el cliente final tampoco tiene sesión; recibe un pase firmado con
//   la sede y el cliente, y desde ahí lee con el acceso del tenant de esa sede.
// - promocionesPublicas.js (HU-26): sin sesión, como accesoCliente.js: resuelve la sede por su slug y
//   lee las promociones vigentes con el acceso del tenant de esa sede.
// - otpCliente.js (RF-F5-11/12): el cliente aún no tiene sesión cuando pide o valida su código;
//   resuelve la sede por su slug y lee el cliente y los códigos con el acceso del tenant de esa sede.
// - workerNotificaciones.js (HU-34): cola global de envíos en segundo plano, sin petición ni sesión;
//   cada notificación se procesa con el acceso del tenant de su establecimiento.
// - consumo.js (HU-39): el reporte global, el catálogo de planes y las alertas a la plataforma no
//   tienen tenant; el consumo propio y las reservas SÍ pasan por tenant.rpc / tenant.listar.
// - notificaciones.controller.js (HU-31/HU-39): la prueba real lee el correo/celular del
//   administrador desde Supabase Auth; el envío y el consumo usan tenant.rpc / tenant.listar.
// - recordatorioPublico.js (HU-36): el enlace de baja por vehículo no tiene sesión; el token firmado
//   trae el establecimiento, el cliente y el vehículo, y el resto se lee con el tenant de esa sede.
const PERMITIDOS = new Set([
  'config/supabase.js',
  'shared/tenant.js',
  'shared/auditoria.js',
  'shared/politicas.js',
  'shared/seguimiento.js',
  'shared/accesoCliente.js',
  'shared/bajaPublica.js',
  'shared/paseCliente.js',
  'shared/otpCliente.js',
  'shared/promocionesPublicas.js',
  'shared/workerNotificaciones.js',
  'shared/consumo.js',
  'shared/recordatorioPublico.js',
  // HU-33 CA4: el webhook no tiene sesión; el establecimiento sale de la notificación misma.
  'controllers/webhooks.controller.js',
  'middlewares/auth.js',
  'controllers/superadmin.controller.js',
  'controllers/usuarios.controller.js',
  'controllers/notificaciones.controller.js',
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
