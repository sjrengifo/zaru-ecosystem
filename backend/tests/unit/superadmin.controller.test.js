// HU-57: pruebas unitarias del ciclo de vida de establecimientos desde el superadmin.
// No requiere Supabase real: se simulan las consultas y las operaciones de Auth.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { supabase, respuestas, llamadas, inviteUserByEmail, deleteUser, listUsers, getUserById, registrarAuditoria } = vi.hoisted(() => {
  const estado = { respuestas: [], llamadas: [] };
  const inviteUserByEmail = vi.fn();
  const deleteUser = vi.fn();
  const listUsers = vi.fn();
  const getUserById = vi.fn();
  const registrarAuditoria = vi.fn(async () => {});

  function crearConsulta(tabla) {
    const respuesta = estado.respuestas.shift() ?? { data: null, error: null };
    const consulta = {};
    for (const metodo of ['select', 'insert', 'update', 'delete', 'eq', 'in', 'ilike', 'lte', 'order', 'limit', 'single', 'maybeSingle']) {
      consulta[metodo] = (...args) => {
        estado.llamadas.push([tabla, metodo, ...args]);
        return consulta;
      };
    }
    consulta.then = (resolve, reject) => Promise.resolve(respuesta).then(resolve, reject);
    return consulta;
  }

  const supabase = {
    from: (tabla) => {
      estado.llamadas.push(['from', tabla]);
      return crearConsulta(tabla);
    },
    auth: { admin: { inviteUserByEmail, deleteUser, listUsers, getUserById } },
  };
  return { supabase, respuestas: estado.respuestas, llamadas: estado.llamadas, inviteUserByEmail, deleteUser, listUsers, getUserById, registrarAuditoria };
});

vi.mock('../../src/config/supabase.js', () => ({ supabase }));
vi.mock('../../src/shared/auditoria.js', () => ({ registrarAuditoria }));
const { listar, crear, activar, suspender, reenviarInvitacion, diasRestantes, TRANSICIONES } = await import('../../src/controllers/superadmin.controller.js');

const ESTABLECIMIENTO_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const USUARIO_ID = 'bbbbbbbb-0000-4000-8000-000000000002';
const establecimiento = {
  id: ESTABLECIMIENTO_ID,
  nombre: 'Car Wash Central',
  plan: 'basico',
  estado: 'prueba',
  prueba_inicia_at: '2026-11-03T10:00:00.000Z',
  prueba_finaliza_at: '2026-11-17T10:00:00.000Z',
};

function respuestaHttp() {
  return {
    status: vi.fn(function (codigo) { this.statusCode = codigo; return this; }),
    json: vi.fn(function (cuerpo) { this.body = cuerpo; return this; }),
  };
}

async function ejecutar(controlador, req = {}) {
  const res = respuestaHttp();
  let error;
  await controlador(req, res, (e) => { error = e; });
  return { req, res, error };
}

beforeEach(() => {
  respuestas.length = 0;
  llamadas.length = 0;
  inviteUserByEmail.mockReset();
  deleteUser.mockReset();
  listUsers.mockReset().mockResolvedValue({ data: { users: [] }, error: null });
  getUserById.mockReset();
  registrarAuditoria.mockClear();
  delete process.env.FRONTEND_URL;
});

describe('HU-57 · controlador de superadministración', () => {
  it('CA2: actualiza las pruebas vencidas antes de devolver el listado global', async () => {
    respuestas.push(
      { data: null, error: null },
      { data: [establecimiento], error: null },
    );

    const { res, error } = await ejecutar(listar, { query: {} });

    expect(error).toBeUndefined();
    expect(res.body).toEqual([{ ...establecimiento, dias_restantes: expect.any(Number), administrador: null }]);
    expect(llamadas).toContainEqual(['establecimientos', 'update', { estado: 'pendiente_activacion' }]);
    expect(llamadas).toContainEqual(['establecimientos', 'eq', 'estado', 'prueba']);
    expect(llamadas).toContainEqual(['establecimientos', 'select', expect.any(String)]);
  });

  it('CA1: crea establecimiento en prueba, invita al administrador y crea su perfil', async () => {
    respuestas.push(
      { data: establecimiento, error: null },
      { data: { id: USUARIO_ID }, error: null },
    );
    inviteUserByEmail.mockResolvedValue({ data: { user: { id: USUARIO_ID } }, error: null });

    const { res, error } = await ejecutar(crear, {
      body: { nombre: 'Car Wash Central', plan: 'basico', correoAdministrador: 'admin@example.com', diasPrueba: 14 },
    });

    expect(error).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.body.establecimiento).toMatchObject(establecimiento);
    expect(res.body.establecimiento.administrador).toEqual({ nombre: 'admin', correo: 'admin@example.com', invitacionAceptada: false });
    expect(registrarAuditoria).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ accion: 'superadmin.establecimiento.registrar', recursoId: ESTABLECIMIENTO_ID }));
    expect(res.body.invitacion).toEqual({ correo: 'admin@example.com', enviada: true });
    expect(inviteUserByEmail).toHaveBeenCalledWith('admin@example.com', expect.objectContaining({
      redirectTo: 'http://localhost:5173/aceptar-invitacion',
    }));
    expect(llamadas).toContainEqual(['perfiles', 'insert', {
      id: USUARIO_ID,
      establecimiento_id: ESTABLECIMIENTO_ID,
      nombre: 'admin',
      rol: 'admin',
      activo: true,
    }]);
  });

  it('CA1: si falla la invitación, elimina el establecimiento creado y devuelve conflicto', async () => {
    respuestas.push(
      { data: establecimiento, error: null },
      { data: null, error: null },
    );
    inviteUserByEmail.mockResolvedValue({ data: null, error: { message: 'correo rechazado' } });

    const { error } = await ejecutar(crear, {
      body: { nombre: 'Car Wash Central', plan: 'basico', correoAdministrador: 'admin@example.com', diasPrueba: 14 },
    });

    expect(error).toMatchObject({ codigo: 'CONFLICTO', status: 409 });
    expect(deleteUser).not.toHaveBeenCalled();
    expect(llamadas).toContainEqual(['establecimientos', 'delete']);
    expect(llamadas).toContainEqual(['establecimientos', 'eq', 'id', ESTABLECIMIENTO_ID]);
  });

  it('CA1: si falla la creación del perfil, revierte el usuario invitado y el establecimiento', async () => {
    respuestas.push(
      { data: establecimiento, error: null },
      { data: null, error: { code: '23505', message: 'perfil duplicado' } },
      { data: null, error: null },
    );
    inviteUserByEmail.mockResolvedValue({ data: { user: { id: USUARIO_ID } }, error: null });
    deleteUser.mockResolvedValue({ data: { user: { id: USUARIO_ID } }, error: null });

    const { error } = await ejecutar(crear, {
      body: { nombre: 'Car Wash Central', plan: 'basico', correoAdministrador: 'admin@example.com', diasPrueba: 14 },
    });

    expect(error).toMatchObject({ codigo: 'CONFLICTO', status: 409 });
    expect(deleteUser).toHaveBeenCalledWith(USUARIO_ID);
    expect(llamadas).toContainEqual(['establecimientos', 'delete']);
  });

  it.each([
    ['activar', activar, 'activo'],
    ['suspender', suspender, 'suspendido'],
  ])('CA3: permite %s un establecimiento existente y lo audita', async (accion, controlador, estado) => {
    const actualizado = { ...establecimiento, estado };
    respuestas.push({ data: null, error: null }, { data: establecimiento, error: null }, { data: actualizado, error: null });

    const { res, error } = await ejecutar(controlador, { params: { id: ESTABLECIMIENTO_ID }, body: { motivo: 'Prueba' } });

    expect(error).toBeUndefined();
    expect(res.body).toEqual({ ...actualizado, dias_restantes: null });
    expect(llamadas).toContainEqual(['establecimientos', 'update', expect.objectContaining({ estado })]);
    expect(llamadas).toContainEqual(['establecimientos', 'eq', 'id', ESTABLECIMIENTO_ID]);
    expect(llamadas).toContainEqual(['establecimientos', 'eq', 'estado', 'prueba']); // no pisa cambios simultáneos
    expect(registrarAuditoria).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      accion: `superadmin.establecimiento.${accion}`, motivo: 'Prueba', detalle: { desde: 'prueba', hacia: estado },
    }));
  });

  it.each([
    ['activar', activar, 'activo'],
    ['suspender', suspender, 'suspendido'],
  ])('no permite %s un establecimiento que ya está en ese estado', async (_accion, controlador, estado) => {
    respuestas.push({ data: null, error: null }, { data: { ...establecimiento, estado }, error: null });
    const { error } = await ejecutar(controlador, { params: { id: ESTABLECIMIENTO_ID } });
    expect(error).toMatchObject({ codigo: 'CONFLICTO', status: 409 });
    expect(llamadas).not.toContainEqual(['establecimientos', 'update', expect.objectContaining({ estado })]);
  });

  it('las transiciones permitidas cubren el ciclo prueba → pendiente → activo ⇄ suspendido', () => {
    expect(TRANSICIONES.activar).toEqual(['prueba', 'pendiente_activacion', 'suspendido']);
    expect(TRANSICIONES.suspender).toEqual(['prueba', 'activo', 'pendiente_activacion']);
  });

  it('devuelve 404 al intentar cambiar el estado de un establecimiento inexistente', async () => {
    respuestas.push({ data: null, error: null }, { data: null, error: null });

    const { error } = await ejecutar(activar, { params: { id: ESTABLECIMIENTO_ID } });

    expect(error).toMatchObject({ codigo: 'NO_ENCONTRADO', status: 404 });
  });
});

describe('HU-57 · mejoras del listado y de la invitación', () => {
  it('incluye el administrador inicial con su correo y si aceptó la invitación', async () => {
    respuestas.push(
      { data: null, error: null },
      { data: [establecimiento], error: null },
      { data: [{ id: USUARIO_ID, nombre: 'Laura', establecimiento_id: ESTABLECIMIENTO_ID }], error: null },
    );
    listUsers.mockResolvedValue({ data: { users: [{ id: USUARIO_ID, email: 'laura@lavadero.co', email_confirmed_at: null }] }, error: null });

    const { res } = await ejecutar(listar, { query: {} });

    expect(res.body[0].administrador).toEqual({ nombre: 'Laura', correo: 'laura@lavadero.co', invitacionAceptada: false });
  });

  it('si Auth no responde, el listado se muestra igual sin los correos', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    respuestas.push(
      { data: null, error: null },
      { data: [establecimiento], error: null },
      { data: [{ id: USUARIO_ID, nombre: 'Laura', establecimiento_id: ESTABLECIMIENTO_ID }], error: null },
    );
    listUsers.mockRejectedValue(new Error('timeout'));

    const { res, error } = await ejecutar(listar, { query: {} });

    expect(error).toBeUndefined();
    expect(res.body[0].administrador).toEqual({ nombre: 'Laura', correo: null, invitacionAceptada: null });
  });

  it('filtra por estado y busca por nombre escapando comodines', async () => {
    respuestas.push({ data: null, error: null }, { data: [], error: null });
    await ejecutar(listar, { query: { estado: 'suspendido', buscar: '100%' } });
    expect(llamadas).toContainEqual(['establecimientos', 'eq', 'estado', 'suspendido']);
    expect(llamadas).toContainEqual(['establecimientos', 'ilike', 'nombre', '%100\\%%']);
  });

  it('calcula los días restantes solo para establecimientos en prueba', () => {
    const ahora = new Date('2026-11-10T10:00:00Z');
    expect(diasRestantes(establecimiento, ahora)).toBe(7);
    expect(diasRestantes({ ...establecimiento, prueba_finaliza_at: '2026-11-01T00:00:00Z' }, ahora)).toBe(0);
    expect(diasRestantes({ ...establecimiento, estado: 'activo' }, ahora)).toBeNull();
  });

  it('reenvía la invitación si el administrador aún no la aceptó', async () => {
    respuestas.push({ data: establecimiento, error: null }, { data: { id: USUARIO_ID }, error: null });
    getUserById.mockResolvedValue({ data: { user: { id: USUARIO_ID, email: 'laura@lavadero.co', email_confirmed_at: null } }, error: null });
    inviteUserByEmail.mockResolvedValue({ data: {}, error: null });

    const { res, error } = await ejecutar(reenviarInvitacion, { params: { id: ESTABLECIMIENTO_ID } });

    expect(error).toBeUndefined();
    expect(res.body).toEqual({ correo: 'laura@lavadero.co', enviada: true });
    expect(inviteUserByEmail).toHaveBeenCalledWith('laura@lavadero.co', { redirectTo: 'http://localhost:5173/aceptar-invitacion' });
  });

  it('no reenvía si el administrador ya activó su cuenta', async () => {
    respuestas.push({ data: establecimiento, error: null }, { data: { id: USUARIO_ID }, error: null });
    getUserById.mockResolvedValue({ data: { user: { id: USUARIO_ID, email: 'laura@lavadero.co', email_confirmed_at: '2026-11-04T00:00:00Z' } }, error: null });

    const { error } = await ejecutar(reenviarInvitacion, { params: { id: ESTABLECIMIENTO_ID } });

    expect(error).toMatchObject({ codigo: 'CONFLICTO' });
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });

  it('no reenvía la invitación de un establecimiento suspendido', async () => {
    respuestas.push({ data: { ...establecimiento, estado: 'suspendido' }, error: null });
    const { error } = await ejecutar(reenviarInvitacion, { params: { id: ESTABLECIMIENTO_ID } });
    expect(error).toMatchObject({ codigo: 'CONFLICTO' });
  });
});
