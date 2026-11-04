// HU-02: controlador de operarios sin Supabase real. Se simulan Auth y las consultas.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { supabase, respuestas, respuestasAuth, llamadas, auth } = vi.hoisted(() => {
  const estado = { respuestas: [], respuestasAuth: [], llamadas: [] };

  function crearConsulta(tabla) {
    const respuesta = estado.respuestas.shift() ?? { data: null, error: null };
    const consulta = {};
    for (const metodo of ['select', 'insert', 'update', 'delete', 'eq', 'order', 'single', 'maybeSingle']) {
      consulta[metodo] = (...args) => {
        estado.llamadas.push([tabla, metodo, ...args]);
        return consulta;
      };
    }
    consulta.then = (resolve, reject) => Promise.resolve(respuesta).then(resolve, reject);
    return consulta;
  }

  const listUsers = vi.fn(async () => estado.respuestasAuth.shift() ?? { data: { users: [], nextPage: null }, error: null });
  const inviteUserByEmail = vi.fn();
  const createUser = vi.fn();
  const generateLink = vi.fn();
  const deleteUser = vi.fn();
  const supabase = {
    from: (tabla) => {
      estado.llamadas.push(['from', tabla]);
      return crearConsulta(tabla);
    },
    auth: { admin: { listUsers, inviteUserByEmail, createUser, generateLink, deleteUser } },
  };

  return {
    supabase,
    respuestas: estado.respuestas,
    respuestasAuth: estado.respuestasAuth,
    llamadas: estado.llamadas,
    auth: { listUsers, inviteUserByEmail, createUser, generateLink, deleteUser },
  };
});

vi.mock('../../src/config/supabase.js', () => ({ supabase }));
const { listar, crear, actualizar } = await import('../../src/controllers/usuarios.controller.js');

const ESTABLECIMIENTO_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const USUARIO_ID = 'bbbbbbbb-0000-4000-8000-000000000002';
const OTRO_ID = 'cccccccc-0000-4000-8000-000000000003';
const ENLACE = 'https://proyecto.supabase.co/auth/v1/verify?token=seguro&type=invite';
const perfil = {
  id: USUARIO_ID,
  nombre: 'Laura Gómez',
  rol: 'operario',
  activo: true,
  created_at: '2026-11-03T10:00:00.000Z',
};
const ctx = { usuarioId: 'dddddddd-0000-4000-8000-000000000004', rol: 'admin', establecimientoId: ESTABLECIMIENTO_ID };

function respuestaHttp() {
  return {
    status: vi.fn(function (codigo) { this.statusCode = codigo; return this; }),
    set: vi.fn(function () { return this; }),
    json: vi.fn(function (cuerpo) { this.body = cuerpo; return this; }),
  };
}

async function ejecutar(controlador, req = {}) {
  const res = respuestaHttp();
  let error;
  await controlador(req, res, (e) => { error = e; });
  return { req, res, error };
}

function consultaTenant(respuesta, filtros = []) {
  const consulta = {
    eq: (campo, valor) => (filtros.push([campo, valor]), consulta),
    order: (...args) => (filtros.push(['order', ...args]), consulta),
    then: (resolve, reject) => Promise.resolve(respuesta).then(resolve, reject),
  };
  return consulta;
}

function cuenta(email, extra = {}) {
  return { id: USUARIO_ID, email, ...extra };
}

beforeEach(() => {
  respuestas.length = 0;
  respuestasAuth.length = 0;
  llamadas.length = 0;
  auth.listUsers.mockClear();
  auth.inviteUserByEmail.mockReset();
  auth.createUser.mockReset();
  auth.generateLink.mockReset();
  auth.deleteUser.mockReset();
  delete process.env.FRONTEND_URL;
});

describe('HU-02 · listado de operarios', () => {
  it('filtra por rol operario, ordena por nombre y agrega el correo de Auth', async () => {
    const filtros = [];
    respuestasAuth.push({ data: { users: [{ id: USUARIO_ID, email: 'LAURA@EXAMPLE.COM' }], nextPage: null }, error: null });
    const tenant = { listar: vi.fn(() => consultaTenant({ data: [perfil], error: null }, filtros)) };

    const { res, error } = await ejecutar(listar, { tenant });

    expect(error).toBeUndefined();
    expect(tenant.listar).toHaveBeenCalledWith('perfiles', expect.any(String));
    expect(filtros).toContainEqual(['rol', 'operario']);
    expect(filtros).toContainEqual(['order', 'nombre']);
    expect(res.body).toEqual([{ ...perfil, correo: 'laura@example.com' }]);
  });

  it('no consulta Auth si el establecimiento no tiene operarios', async () => {
    const tenant = { listar: vi.fn(() => consultaTenant({ data: [], error: null })) };
    const { res, error } = await ejecutar(listar, { tenant });

    expect(error).toBeUndefined();
    expect(auth.listUsers).not.toHaveBeenCalled();
    expect(res.body).toEqual([]);
  });
});

describe('HU-02 · creación e invitación', () => {
  it('CA1: invita, fija rol operario y usa el establecimiento de la sesión', async () => {
    respuestasAuth.push({ data: { users: [], nextPage: null }, error: null });
    respuestas.push({ data: perfil, error: null });
    auth.inviteUserByEmail.mockResolvedValue({ data: { user: { id: USUARIO_ID } }, error: null });

    const { res, error } = await ejecutar(crear, {
      ctx,
      body: {
        nombre: 'Laura Gómez',
        correo: 'laura@example.com',
        rol: 'admin',
        establecimiento_id: 'ffffffff-0000-4000-8000-000000000009',
      },
    });

    expect(error).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.body.usuario).toEqual({ ...perfil, correo: 'laura@example.com' });
    expect(res.body.invitacion).toEqual({ correo: 'laura@example.com', enviada: true });
    expect(auth.inviteUserByEmail).toHaveBeenCalledWith('laura@example.com', expect.objectContaining({
      data: { nombre: 'Laura Gómez' },
      redirectTo: 'http://localhost:5173/aceptar-invitacion',
    }));
    expect(llamadas).toContainEqual(['perfiles', 'insert', {
      id: USUARIO_ID,
      establecimiento_id: ESTABLECIMIENTO_ID,
      nombre: 'Laura Gómez',
      rol: 'operario',
      activo: true,
    }]);
  });

  it('CA1: rechaza un correo ya registrado y confirmado', async () => {
    respuestasAuth.push({
      data: { users: [cuenta('laura@example.com', { email_confirmed_at: '2026-11-03T10:00:00.000Z' })], nextPage: null },
      error: null,
    });

    const { error } = await ejecutar(crear, { ctx, body: { nombre: 'Laura', correo: 'laura@example.com' } });

    expect(error).toMatchObject({ codigo: 'CONFLICTO', status: 409 });
    expect(auth.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it('CA1: rechaza un correo cuya cuenta ya tiene perfil', async () => {
    respuestasAuth.push({ data: { users: [cuenta('laura@example.com')], nextPage: null }, error: null });
    respuestas.push({ data: { id: OTRO_ID }, error: null }); // tienePerfil

    const { error } = await ejecutar(crear, { ctx, body: { nombre: 'Laura', correo: 'laura@example.com' } });

    expect(error).toMatchObject({ codigo: 'CONFLICTO', status: 409 });
    expect(auth.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it('CA1: si el correo no puede enviarse, crea la cuenta y devuelve un enlace seguro', async () => {
    respuestasAuth.push(
      { data: { users: [], nextPage: null }, error: null }, // búsqueda inicial
      { data: { users: [], nextPage: null }, error: null }, // asegurarCuentaAuth
    );
    respuestas.push({ data: perfil, error: null });
    auth.inviteUserByEmail.mockResolvedValue({ data: null, error: { message: 'email rate limit exceeded' } });
    auth.createUser.mockResolvedValue({ data: { user: { id: USUARIO_ID } }, error: null });
    auth.generateLink.mockResolvedValue({ data: { user: { id: USUARIO_ID }, properties: { action_link: ENLACE } }, error: null });

    const { res, error } = await ejecutar(crear, {
      ctx,
      body: { nombre: 'Laura Gómez', correo: 'laura@example.com', rol: 'admin' },
    });

    expect(error).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.body.invitacion).toEqual({ correo: 'laura@example.com', enviada: false, enlace: ENLACE });
    expect(auth.createUser).toHaveBeenCalledWith({
      email: 'laura@example.com',
      email_confirm: false,
      user_metadata: { nombre: 'Laura Gómez' },
    });
    expect(llamadas).toContainEqual(['perfiles', 'insert', expect.objectContaining({ rol: 'operario' })]);
  });

  it('CA1: reutiliza una cuenta que quedó sin perfil tras una invitación anterior', async () => {
    respuestasAuth.push({ data: { users: [cuenta('laura@example.com')], nextPage: null }, error: null });
    respuestas.push({ data: null, error: null }); // tienePerfil
    respuestas.push({ data: perfil, error: null }); // perfil nuevo
    auth.generateLink.mockResolvedValue({ data: { user: { id: USUARIO_ID }, properties: { action_link: ENLACE } }, error: null });

    const { res, error } = await ejecutar(crear, { ctx, body: { nombre: 'Laura', correo: 'laura@example.com' } });

    expect(error).toBeUndefined();
    expect(auth.inviteUserByEmail).not.toHaveBeenCalled();
    expect(auth.createUser).not.toHaveBeenCalled();
    expect(res.body.invitacion).toEqual({ correo: 'laura@example.com', enviada: false, enlace: ENLACE });
  });

  it('CA1: si la invitación creó la cuenta, la reutiliza en lugar de crear otra', async () => {
    respuestasAuth.push(
      { data: { users: [], nextPage: null }, error: null },
      { data: { users: [cuenta('laura@example.com')], nextPage: null }, error: null },
    );
    respuestas.push({ data: perfil, error: null });
    auth.inviteUserByEmail.mockResolvedValue({ data: null, error: { message: 'error sending invite email' } });
    auth.generateLink.mockResolvedValue({ data: { user: { id: USUARIO_ID }, properties: { action_link: ENLACE } }, error: null });

    const { res, error } = await ejecutar(crear, { ctx, body: { nombre: 'Laura', correo: 'laura@example.com' } });

    expect(error).toBeUndefined();
    expect(auth.createUser).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('CA1: reintenta el enlace sin redirectTo si Supabase rechaza esa URL', async () => {
    respuestasAuth.push(
      { data: { users: [], nextPage: null }, error: null },
      { data: { users: [], nextPage: null }, error: null },
    );
    respuestas.push({ data: perfil, error: null });
    auth.inviteUserByEmail.mockResolvedValue({ data: null, error: { message: 'redirect not allowed' } });
    auth.createUser.mockResolvedValue({ data: { user: { id: USUARIO_ID } }, error: null });
    auth.generateLink
      .mockResolvedValueOnce({ data: null, error: { message: 'redirect not allowed' } })
      .mockResolvedValueOnce({ data: { user: { id: USUARIO_ID }, properties: { action_link: ENLACE } }, error: null });

    const { error } = await ejecutar(crear, { ctx, body: { nombre: 'Laura', correo: 'laura@example.com' } });

    expect(error).toBeUndefined();
    expect(auth.generateLink).toHaveBeenCalledTimes(2);
    expect(auth.generateLink.mock.calls[1][0].options.redirectTo).toBeUndefined();
  });

  it('CA1: si no puede generar el enlace, responde error interno y revierte la cuenta creada', async () => {
    respuestasAuth.push(
      { data: { users: [], nextPage: null }, error: null },
      { data: { users: [], nextPage: null }, error: null },
    );
    respuestas.push({ data: null, error: null }); // compensación: no hay perfil
    auth.inviteUserByEmail.mockResolvedValue({ data: null, error: { message: 'sin correo' } });
    auth.createUser.mockResolvedValue({ data: { user: { id: USUARIO_ID } }, error: null });
    auth.generateLink.mockResolvedValue({ data: null, error: { message: 'enlace falló' } });
    auth.deleteUser.mockResolvedValue({ data: {}, error: null });

    const { error } = await ejecutar(crear, { ctx, body: { nombre: 'Laura', correo: 'laura@example.com' } });

    expect(error).toMatchObject({ codigo: 'ERROR_INTERNO', status: 500 });
    expect(auth.deleteUser).toHaveBeenCalledWith(USUARIO_ID);
  });

  it('CA1: si falla el perfil, revierte la cuenta huérfana', async () => {
    respuestasAuth.push({ data: { users: [], nextPage: null }, error: null });
    respuestas.push(
      { data: null, error: { code: '23505', message: 'perfil duplicado' } },
      { data: null, error: null },
    );
    auth.inviteUserByEmail.mockResolvedValue({ data: { user: { id: USUARIO_ID } }, error: null });
    auth.deleteUser.mockResolvedValue({ data: {}, error: null });

    const { error } = await ejecutar(crear, { ctx, body: { nombre: 'Laura', correo: 'laura@example.com' } });

    expect(error).toMatchObject({ codigo: 'CONFLICTO', status: 409 });
    expect(auth.deleteUser).toHaveBeenCalledWith(USUARIO_ID);
  });

  it('CA1: nunca borra una cuenta que ya tenía perfil', async () => {
    respuestasAuth.push({ data: { users: [], nextPage: null }, error: null });
    respuestas.push(
      { data: null, error: { code: '23505', message: 'perfil duplicado' } },
      { data: { id: USUARIO_ID }, error: null },
    );
    auth.inviteUserByEmail.mockResolvedValue({ data: { user: { id: USUARIO_ID } }, error: null });

    await ejecutar(crear, { ctx, body: { nombre: 'Laura', correo: 'laura@example.com' } });

    expect(auth.deleteUser).not.toHaveBeenCalled();
  });
});

describe('HU-02 · edición y desactivación', () => {
  it('CA2: solo envía nombre y estado; el rol no se puede escalar', async () => {
    const actualizado = { ...perfil, nombre: 'Laura Pérez', activo: false };
    respuestasAuth.push({ data: { users: [{ id: USUARIO_ID, email: 'laura@example.com' }], nextPage: null }, error: null });
    const tenant = {
      obtener: vi.fn(async () => perfil),
      actualizar: vi.fn(async () => actualizado),
    };

    const { res, error } = await ejecutar(actualizar, {
      tenant,
      params: { id: USUARIO_ID },
      body: { nombre: 'Laura Pérez', activo: false, rol: 'admin' },
    });

    expect(error).toBeUndefined();
    expect(tenant.obtener).toHaveBeenCalledWith('perfiles', USUARIO_ID, expect.any(String), 'Usuario');
    expect(tenant.actualizar).toHaveBeenCalledWith(
      'perfiles', USUARIO_ID, { nombre: 'Laura Pérez', activo: false }, expect.any(String), 'Usuario',
    );
    expect(res.body).toEqual({ ...actualizado, correo: 'laura@example.com' });
  });

  it('CA2: no permite editar a un administrador', async () => {
    const tenant = {
      obtener: vi.fn(async () => ({ ...perfil, rol: 'admin' })),
      actualizar: vi.fn(),
    };

    const { error } = await ejecutar(actualizar, { tenant, params: { id: USUARIO_ID }, body: { nombre: 'Otro' } });

    expect(error).toMatchObject({ codigo: 'SIN_PERMISO', status: 403 });
    expect(tenant.actualizar).not.toHaveBeenCalled();
  });

  it('CA3: desactivar solo cambia activo y conserva el perfil', async () => {
    const desactivado = { ...perfil, activo: false };
    const tenant = {
      obtener: vi.fn(async () => perfil),
      actualizar: vi.fn(async () => desactivado),
    };
    respuestasAuth.push({ data: { users: [{ id: USUARIO_ID, email: 'laura@example.com' }], nextPage: null }, error: null });

    const { error } = await ejecutar(actualizar, { tenant, params: { id: USUARIO_ID }, body: { activo: false } });

    expect(error).toBeUndefined();
    expect(tenant.actualizar).toHaveBeenCalledWith(
      'perfiles', USUARIO_ID, { activo: false }, expect.any(String), 'Usuario',
    );
  });

  it('propaga el 404 del tenant cuando el operario es de otro establecimiento', async () => {
    const noEncontrado = Object.assign(new Error('Usuario no encontrado'), { codigo: 'NO_ENCONTRADO', status: 404 });
    const tenant = { obtener: vi.fn(async () => { throw noEncontrado; }), actualizar: vi.fn() };

    const { error } = await ejecutar(actualizar, { tenant, params: { id: OTRO_ID }, body: { activo: false } });

    expect(error).toBe(noEncontrado);
  });
});
