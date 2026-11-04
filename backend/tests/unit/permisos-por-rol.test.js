// HU-59 — Cada usuario ve y usa solo lo que le corresponde según su rol.
// Se prueba la matriz de permisos y la API completa (Express real) con una sesión simulada:
// el rol llega en el encabezado de prueba x-rol en lugar de un JWT de Supabase.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { crearTenantFalso } from '../helpers/tenantFalso.js';

const registrarAuditoria = vi.fn(async () => {});
vi.mock('../../src/shared/auditoria.js', () => ({ registrarAuditoria: (...a) => registrarAuditoria(...a) }));
vi.mock('../../src/config/supabase.js', () => ({ supabase: {} }));
vi.mock('../../src/middlewares/auth.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    // Sesión simulada: el rol sale del encabezado y el tenant es falso (sin Supabase).
    requiereSesion: (req, res, next) => {
      const rol = req.get('x-rol');
      if (!rol) return next(new (class extends Error { constructor() { super('Debes iniciar sesión'); this.codigo = 'NO_AUTENTICADO'; this.status = 401; } })());
      const establecimientoId = rol === 'superadmin' ? null : 'eeeeeeee-0000-4000-8000-000000000001';
      req.ctx = { usuarioId: 'u-1', rol, establecimientoId, tokenExpira: null };
      req.usuario = { id: 'u-1', nombre: `Usuario ${rol}`, rol, establecimientoId };
      if (establecimientoId) {
        req.tenant = crearTenantFalso({ establecimientos: [{ data: { id: establecimientoId, nombre: 'Lavadero A' }, error: null }] });
      }
      next();
    },
  };
});

const { default: app } = await import('../../src/app.js');
const { MODULOS_POR_ROL, puedeUsar, permisosDe, rolesConModulo } = await import('../../src/shared/permisos.js');

const como = (rol) => (req) => req.set('x-rol', rol);

beforeEach(() => registrarAuditoria.mockClear());

describe('HU-59 · matriz de permisos', () => {
  it('CA1: el operario solo tiene su trabajo diario (órdenes y vehículos), sin configuración, promociones ni reportes', () => {
    expect(MODULOS_POR_ROL.operario).toEqual(['dashboard', 'clientes', 'vehiculos']);
    for (const modulo of ['servicios', 'promociones', 'usuarios', 'branding', 'reportes', 'superadmin']) {
      expect(puedeUsar('operario', modulo)).toBe(false);
    }
  });

  it('CA2: el administrador tiene todos los módulos de su establecimiento, pero no la administración de Zaru', () => {
    expect(MODULOS_POR_ROL.admin).toEqual(['dashboard', 'clientes', 'vehiculos', 'servicios', 'promociones', 'usuarios', 'branding', 'reportes']);
    expect(puedeUsar('admin', 'superadmin')).toBe(false);
  });

  it('un rol desconocido no tiene ningún módulo', () => {
    expect(permisosDe('visitante')).toEqual({ modulos: [], inicio: '/' });
    expect(rolesConModulo('promociones')).toEqual(['admin']);
  });
});

describe('HU-59 · GET /me entrega al panel los módulos del rol', () => {
  it.each([
    ['operario', ['dashboard', 'clientes', 'vehiculos'], '/'],
    ['admin', MODULOS_POR_ROL.admin, '/'],
  ])('%s', async (rol, modulos, inicio) => {
    const res = await request(app).get('/api/v1/me').use(como(rol));
    expect(res.status).toBe(200);
    expect(res.body.permisos).toEqual({ modulos: [...modulos], inicio });
    expect(res.body.usuario.rol).toBe(rol);
  });
});

describe('HU-59 CA3 · la API niega las secciones ajenas aunque se escriba la dirección a mano', () => {
  it.each([
    ['GET', '/api/v1/promociones'],
    ['POST', '/api/v1/promociones'],
    ['GET', '/api/v1/usuarios'],
    ['POST', '/api/v1/servicios'],
    ['PUT', '/api/v1/servicios/00000000-0000-4000-8000-000000000001'],
    ['PUT', '/api/v1/establecimiento/branding'],
    ['POST', '/api/v1/establecimiento/logo'],
    ['DELETE', '/api/v1/clientes/00000000-0000-4000-8000-000000000001'],
    ['GET', '/api/v1/superadmin/establecimientos'],
  ])('operario: %s %s → 403 y queda en la auditoría', async (metodo, ruta) => {
    const res = await request(app)[metodo.toLowerCase()](ruta).use(como('operario')).send({});
    expect(res.status).toBe(403);
    expect(res.body.error.codigo).toBe('SIN_PERMISO');
    expect(registrarAuditoria).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ resultado: 'denegado' }));
  });

  it.each([
    ['GET', '/api/v1/ordenes/activas'],
    ['GET', '/api/v1/clientes'],
    ['GET', '/api/v1/vehiculos'],
    ['GET', '/api/v1/servicios'], // solo lectura, para elegir servicios al registrar un ingreso
    ['GET', '/api/v1/establecimiento'],
  ])('operario: %s %s no se bloquea por rol', async (metodo, ruta) => {
    const res = await request(app)[metodo.toLowerCase()](ruta).use(como('operario'));
    expect(res.status).not.toBe(403);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });

  it.each([
    ['GET', '/api/v1/promociones'],
    ['GET', '/api/v1/ordenes/activas'],
    ['GET', '/api/v1/servicios'],
  ])('admin: %s %s está permitido', async (metodo, ruta) => {
    const res = await request(app)[metodo.toLowerCase()](ruta).use(como('admin'));
    expect(res.status).not.toBe(403);
  });

  it('el superadministrador no entra a los módulos operativos de un establecimiento', async () => {
    const res = await request(app).get('/api/v1/ordenes/activas').use(como('superadmin'));
    expect(res.status).toBe(403);
  });
});
