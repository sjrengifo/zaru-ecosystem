// HU-02 CA2 y CA3 — La API completa rechaza al operario y al superadministrador en las
// rutas administrativas, aunque envíen un token válido. No requiere Supabase real.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const getUser = vi.fn();
const perfil = { data: null };
const establecimiento = { data: { estado: 'activo', prueba_finaliza_at: null }, error: null };

/** Query builder flexible: devuelve listas vacías y el perfil/establecimiento que pide la sesión. */
function crearConsulta(tabla) {
  const vacio = { data: [], error: null, count: 0 };
  const consulta = {
    select: () => consulta,
    insert: () => consulta,
    update: () => consulta,
    upsert: () => consulta,
    delete: () => consulta,
    eq: () => consulta,
    neq: () => consulta,
    gt: () => consulta,
    gte: () => consulta,
    lt: () => consulta,
    lte: () => consulta,
    in: () => consulta,
    is: () => consulta,
    not: () => consulta,
    or: () => consulta,
    ilike: () => consulta,
    order: () => consulta,
    range: () => consulta,
    limit: () => consulta,
    maybeSingle: async () => {
      if (tabla === 'perfiles') return perfil;
      if (tabla === 'establecimientos') return establecimiento;
      return { data: null, error: null };
    },
    single: async () => ({ data: null, error: null }),
    then: (resolver, rechazar) => Promise.resolve(vacio).then(resolver, rechazar),
  };
  return consulta;
}

vi.mock('../../src/config/supabase.js', () => ({
  supabase: {
    auth: {
      getUser: (...args) => getUser(...args),
      admin: {
        listUsers: async () => ({ data: { users: [], nextPage: null }, error: null }),
        createUser: async () => ({ data: { user: null }, error: null }),
        generateLink: async () => ({ data: { properties: { action_link: 'https://zaru.test/invitacion' }, user: null }, error: null }),
        deleteUser: async () => ({ error: null }),
      },
    },
    from: (tabla) => crearConsulta(tabla),
    rpc: () => crearConsulta('rpc'),
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        remove: async () => ({ error: null }),
        getPublicUrl: () => ({ data: { publicUrl: 'https://zaru.test/logo.png' } }),
      }),
    },
  },
}));

const registrarAuditoria = vi.fn(async () => {});
vi.mock('../../src/shared/auditoria.js', () => ({ registrarAuditoria: (...args) => registrarAuditoria(...args) }));

const { default: app } = await import('../../src/app.js');

const EST = 'aaaaaaaa-0000-4000-8000-000000000001';
const USUARIO = 'bbbbbbbb-0000-4000-8000-000000000002';
const ID = 'cccccccc-0000-4000-8000-000000000003';

const RUTAS_ADMIN = [
  ['GET', '/api/v1/usuarios'],
  ['POST', '/api/v1/usuarios'],
  ['PUT', `/api/v1/usuarios/${ID}`],
  ['POST', '/api/v1/servicios'],
  ['PATCH', `/api/v1/servicios/${ID}`],
  ['POST', '/api/v1/promociones'],
  ['PATCH', `/api/v1/promociones/${ID}`],
  ['PUT', '/api/v1/establecimiento/branding'],
  ['POST', '/api/v1/establecimiento/logo'],
  ['GET', '/api/v1/reportes/servicios'],
  ['GET', '/api/v1/reportes/afluencia'],
  ['GET', '/api/v1/notificaciones'],
  ['GET', `/api/v1/notificaciones/${ID}`],
];

function pedir(metodo, ruta, token, cuerpo = {}) {
  return request(app)[metodo.toLowerCase()](ruta)
    .set('Authorization', `Bearer ${token}`)
    .send(cuerpo);
}

beforeEach(() => {
  getUser.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: USUARIO } }, error: null });
  registrarAuditoria.mockClear();
  perfil.data = { id: USUARIO, nombre: 'Operario', rol: 'operario', activo: true, establecimiento_id: EST };
  establecimiento.data = { estado: 'activo', prueba_finaliza_at: null };
});

describe('CA2: rutas administrativas protegidas en el backend', () => {
  it.each(RUTAS_ADMIN)('%s %s responde 403 a un operario y registra la denegación', async (metodo, ruta) => {
    const res = await pedir(metodo, ruta, 'token-operario');

    expect(res.status).toBe(403);
    expect(res.body.error).toMatchObject({ codigo: 'SIN_PERMISO', mensaje: 'No tienes permiso para realizar esta acción' });
    expect(registrarAuditoria).toHaveBeenCalled();
  });

  it('el operario sí puede leer los catálogos que necesita para atender órdenes', async () => {
    for (const ruta of ['/api/v1/servicios', '/api/v1/promociones', '/api/v1/establecimiento']) {
      const res = await pedir('GET', ruta, 'token-operario');
      expect(res.status, ruta).toBe(200);
    }
  });

  it('el administrador pasa el control de rol en todas las secciones', async () => {
    perfil.data = { id: USUARIO, nombre: 'Admin', rol: 'admin', activo: true, establecimiento_id: EST };

    const listado = await pedir('GET', '/api/v1/usuarios', 'token-admin');
    expect(listado.status).toBe(200);

    // Un cuerpo inválido responde 400: la petición ya cruzó el filtro de rol (no es 403).
    const escrituras = [
      ['POST', '/api/v1/usuarios'],
      ['PUT', `/api/v1/usuarios/${ID}`],
      ['POST', '/api/v1/servicios'],
      ['PATCH', `/api/v1/servicios/${ID}`],
      ['POST', '/api/v1/promociones'],
      ['PATCH', `/api/v1/promociones/${ID}`],
      ['PUT', '/api/v1/establecimiento/branding'],
      ['POST', '/api/v1/establecimiento/logo'],
      ['GET', '/api/v1/reportes/servicios'],
      ['GET', '/api/v1/reportes/afluencia'],
    ];

    for (const [metodo, ruta] of escrituras) {
      const res = await pedir(metodo, ruta, 'token-admin');
      expect(res.status, `${metodo} ${ruta}`).toBe(400);
    }
  });

  it('CA3: un operario desactivado recibe 403 en las rutas protegidas aunque su token sea válido', async () => {
    perfil.data = { ...perfil.data, activo: false };

    const res = await pedir('GET', '/api/v1/me', 'token-operario');
    expect(res.status).toBe(403);
    expect(res.body.error.codigo).toBe('SIN_PERMISO');

    const catalogo = await pedir('GET', '/api/v1/servicios', 'token-operario');
    expect(catalogo.status).toBe(403);
  });

  it('CA3: al reactivarse, el mismo token vuelve a entrar', async () => {
    perfil.data = { ...perfil.data, activo: false };
    expect((await pedir('GET', '/api/v1/me', 'token-operario')).status).toBe(403);

    perfil.data = { ...perfil.data, activo: true };
    expect((await pedir('GET', '/api/v1/me', 'token-operario')).status).toBe(200);
  });

  it('el superadministrador no puede usar los endpoints operativos aunque conozca la URL', async () => {
    perfil.data = { id: USUARIO, nombre: 'Superadmin', rol: 'superadmin', activo: true, establecimiento_id: null };

    for (const ruta of ['/api/v1/clientes', '/api/v1/servicios', '/api/v1/usuarios']) {
      const res = await pedir('GET', ruta, 'token-superadmin');
      expect(res.status, ruta).toBe(403);
    }
  });
});
