// HU-44: pruebas unitarias de los middlewares de autenticación y autorización por rol.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getUser = vi.fn();
const perfil = { data: null };
vi.mock('../../src/config/supabase.js', () => ({
  supabase: {
    auth: { getUser: (...a) => getUser(...a) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => perfil }) }) }),
  },
}));
const registrarAuditoria = vi.fn(async () => {});
vi.mock('../../src/shared/auditoria.js', () => ({ registrarAuditoria: (...a) => registrarAuditoria(...a) }));

const { requiereSesion, requiereRol } = await import('../../src/middlewares/auth.js');

const EST = 'aaaaaaaa-0000-4000-8000-000000000001';
const USUARIO = 'bbbbbbbb-0000-4000-8000-000000000002';

function tokenFalso(exp) {
  const parte = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${parte({ alg: 'HS256' })}.${parte({ sub: USUARIO, exp })}.firma`;
}

function ejecutar(middleware, { authorization, ctx } = {}) {
  const encabezados = {};
  const req = { get: (n) => (n.toLowerCase() === 'authorization' ? authorization : undefined), ctx };
  const res = { set: (k, v) => { encabezados[k] = v; } };
  return new Promise((resolver) => middleware(req, res, (err) => resolver({ err, req, encabezados })));
}

beforeEach(() => {
  getUser.mockReset();
  registrarAuditoria.mockClear();
  perfil.data = { id: USUARIO, nombre: 'Ana', rol: 'operario', activo: true, establecimiento_id: EST };
});

describe('requiereSesion', () => {
  it.each([
    ['sin encabezado', undefined],
    ['con un esquema distinto de Bearer', 'Basic abc'],
    ['con Bearer vacío', 'Bearer '],
  ])('CA3: rechaza la petición %s con 401 NO_AUTENTICADO', async (_, authorization) => {
    const { err, encabezados } = await ejecutar(requiereSesion, { authorization });
    expect(err).toMatchObject({ codigo: 'NO_AUTENTICADO', status: 401 });
    expect(encabezados['WWW-Authenticate']).toBe('Bearer error="invalid_token"');
    expect(getUser).not.toHaveBeenCalled();
  });

  it('CA3: rechaza un token vencido o inválido según Supabase Auth y pide iniciar sesión de nuevo', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'token is expired' } });
    const { err, encabezados } = await ejecutar(requiereSesion, { authorization: `Bearer ${tokenFalso(1)}` });
    expect(err).toMatchObject({ codigo: 'NO_AUTENTICADO', status: 401 });
    expect(err.message).toMatch(/Inicia sesión de nuevo/);
    expect(encabezados['WWW-Authenticate']).toBeDefined();
  });

  it('CA1: con un token válido arma el contexto con rol, establecimiento y vencimiento', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    getUser.mockResolvedValue({ data: { user: { id: USUARIO } }, error: null });
    const { err, req } = await ejecutar(requiereSesion, { authorization: `Bearer ${tokenFalso(exp)}` });
    expect(err).toBeUndefined();
    expect(req.ctx).toEqual({ usuarioId: USUARIO, rol: 'operario', establecimientoId: EST, tokenExpira: new Date(exp * 1000).toISOString() });
    expect(req.tenant.establecimientoId).toBe(EST);
  });

  it('un usuario desactivado recibe 403 aunque su token sea válido', async () => {
    getUser.mockResolvedValue({ data: { user: { id: USUARIO } }, error: null });
    perfil.data = { ...perfil.data, activo: false };
    const { err } = await ejecutar(requiereSesion, { authorization: `Bearer ${tokenFalso(9999999999)}` });
    expect(err).toMatchObject({ codigo: 'SIN_PERMISO', status: 403 });
  });

  it('un usuario sin perfil en el panel recibe 403', async () => {
    getUser.mockResolvedValue({ data: { user: { id: USUARIO } }, error: null });
    perfil.data = null;
    const { err } = await ejecutar(requiereSesion, { authorization: `Bearer ${tokenFalso(9999999999)}` });
    expect(err).toMatchObject({ codigo: 'SIN_PERMISO', status: 403 });
  });
});

describe('requiereRol', () => {
  it('deja pasar a un rol permitido sin registrar auditoría', async () => {
    const { err } = await ejecutar(requiereRol('admin'), { ctx: { rol: 'admin' } });
    expect(err).toBeUndefined();
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });

  it('CA2: deniega a un operario con 403 y registra el intento como denegado', async () => {
    const { err } = await ejecutar(requiereRol('admin'), { ctx: { rol: 'operario', usuarioId: USUARIO, establecimientoId: EST } });
    expect(err).toMatchObject({ codigo: 'SIN_PERMISO', status: 403 });
    expect(registrarAuditoria).toHaveBeenCalledTimes(1);
    expect(registrarAuditoria.mock.calls[0][1]).toMatchObject({ resultado: 'denegado', motivo: expect.stringContaining('operario') });
  });

  it('acepta varios roles', async () => {
    const { err } = await ejecutar(requiereRol('admin', 'operario'), { ctx: { rol: 'operario' } });
    expect(err).toBeUndefined();
  });
});
