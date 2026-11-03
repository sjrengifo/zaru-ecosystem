// HU-57: pruebas unitarias del ciclo de vida de establecimientos desde el superadmin.
// No requiere Supabase real: se simulan las consultas y las operaciones de Auth.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { supabase, respuestas, llamadas, inviteUserByEmail, deleteUser } = vi.hoisted(() => {
  const estado = { respuestas: [], llamadas: [] };
  const inviteUserByEmail = vi.fn();
  const deleteUser = vi.fn();

  function crearConsulta(tabla) {
    const respuesta = estado.respuestas.shift() ?? { data: null, error: null };
    const consulta = {};
    for (const metodo of ['select', 'insert', 'update', 'delete', 'eq', 'lte', 'order', 'single', 'maybeSingle']) {
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
    auth: { admin: { inviteUserByEmail, deleteUser } },
  };
  return { supabase, respuestas: estado.respuestas, llamadas: estado.llamadas, inviteUserByEmail, deleteUser };
});

vi.mock('../../src/config/supabase.js', () => ({ supabase }));
const { listar, crear, activar, suspender } = await import('../../src/controllers/superadmin.controller.js');

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
  delete process.env.FRONTEND_URL;
});

describe('HU-57 · controlador de superadministración', () => {
  it('CA2: actualiza las pruebas vencidas antes de devolver el listado global', async () => {
    respuestas.push(
      { data: null, error: null },
      { data: [establecimiento], error: null },
    );

    const { res, error } = await ejecutar(listar);

    expect(error).toBeUndefined();
    expect(res.body).toEqual([establecimiento]);
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
    expect(res.body.establecimiento).toEqual(establecimiento);
    expect(res.body.invitacion).toEqual({ correo: 'admin@example.com', enviada: true });
    expect(inviteUserByEmail).toHaveBeenCalledWith('admin@example.com', expect.objectContaining({
      redirectTo: 'http://localhost:5173/login',
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
  ])('CA3: permite %s un establecimiento existente', async (_nombre, controlador, estado) => {
    const actualizado = { ...establecimiento, estado };
    respuestas.push({ data: null, error: null }, { data: actualizado, error: null });

    const { res, error } = await ejecutar(controlador, { params: { id: ESTABLECIMIENTO_ID } });

    expect(error).toBeUndefined();
    expect(res.body).toEqual(actualizado);
    expect(llamadas).toContainEqual(['establecimientos', 'update', expect.objectContaining({ estado })]);
    expect(llamadas).toContainEqual(['establecimientos', 'eq', 'id', ESTABLECIMIENTO_ID]);
  });

  it('devuelve 404 al intentar cambiar el estado de un establecimiento inexistente', async () => {
    respuestas.push({ data: null, error: null }, { data: null, error: null });

    const { error } = await ejecutar(activar, { params: { id: ESTABLECIMIENTO_ID } });

    expect(error).toMatchObject({ codigo: 'NO_ENCONTRADO', status: 404 });
  });
});
