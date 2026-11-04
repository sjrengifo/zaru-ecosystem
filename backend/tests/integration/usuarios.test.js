// HU-02: gestión de operarios probada contra la API y Supabase.
// Requiere backend/.env y backend/.env.spike.local (ver tests/helpers/entorno.js); sin ellos se omite.
// Crea un operario por invitación y lo elimina al terminar; los perfiles caen con la cuenta de Auth.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { hayEntornoIntegracion, faltantes } from '../helpers/entorno.js';

const EST_A = '00000000-0000-0000-0000-00000000a058';
const correo = `hu02-operario-${Date.now()}@zaru.test`;

describe.skipIf(!hayEntornoIntegracion)(`HU-02 · operarios${hayEntornoIntegracion ? '' : ` (omitida: faltan ${faltantes.join(', ')})`}`, () => {
  let request, app, admin, crearCliente, token, adminId;
  let creado;
  let claveOperario;
  let tokenOperario;
  const con = (r) => r.set('Authorization', `Bearer ${token}`);
  const crear = (cuerpo) => request(app).post('/api/v1/usuarios').use(con).send(cuerpo);

  beforeAll(async () => {
    request = (await import('supertest')).default;
    app = (await import('../../src/app.js')).default;
    admin = (await import('../../src/config/supabase.js')).supabase;
    ({ createClient: crearCliente } = await import('@supabase/supabase-js'));

    const cliente = crearCliente(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await cliente.auth.signInWithPassword({
      email: process.env.SPIKE_A_EMAIL,
      password: process.env.SPIKE_PASSWORD,
    });
    if (error) throw error;
    token = data.session.access_token;

    const yo = await request(app).get('/api/v1/me').use(con);
    adminId = yo.body.usuario.id;
  });

  afterAll(async () => {
    if (creado?.id) await admin.auth.admin.deleteUser(creado.id);
  });

  it('CA1: el administrador lista solo operarios del establecimiento', async () => {
    const res = await request(app).get('/api/v1/usuarios').use(con);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.every((usuario) => usuario.rol === 'operario')).toBe(true);
    expect(res.body.some((usuario) => usuario.id === adminId)).toBe(false);
  });

  it('CA1: crea el operario, fija su rol y envía la invitación', async () => {
    const res = await crear({
      nombre: '[Prueba HU-02] Operario',
      correo,
      rol: 'admin',
      establecimiento_id: 'ffffffff-0000-4000-8000-000000000009',
    });

    expect(res.status).toBe(201);
    expect(res.body.usuario).toMatchObject({
      nombre: '[Prueba HU-02] Operario',
      correo: correo.toLowerCase(),
      rol: 'operario',
      activo: true,
    });
    expect(res.headers['cache-control']).toBe('no-store');

    // Según SMTP/límites del proyecto, el correo puede salir o devolverse un enlace seguro.
    const { invitacion } = res.body;
    expect(invitacion.correo).toBe(correo.toLowerCase());
    expect(typeof invitacion.enviada).toBe('boolean');
    if (invitacion.enviada) {
      expect(invitacion.enlace).toBeUndefined();
    } else {
      expect(invitacion.enlace).toMatch(/^https?:\/\//);
    }
    creado = res.body.usuario;

    const { data } = await admin.from('perfiles').select('rol, activo, establecimiento_id').eq('id', creado.id).single();
    expect(data).toEqual({ rol: 'operario', activo: true, establecimiento_id: EST_A });
  });

  it('CA1: rechaza un correo duplicado con 409', async () => {
    const res = await crear({ nombre: 'Otra persona', correo });
    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('CONFLICTO');
  });

  it('CA2: permite editar el nombre sin cambiar el rol', async () => {
    const res = await request(app)
      .put(`/api/v1/usuarios/${creado.id}`)
      .use(con)
      .send({ nombre: '[Prueba HU-02] Operario editado', rol: 'admin' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ nombre: '[Prueba HU-02] Operario editado', rol: 'operario' });
  });

  it('CA2: no permite editar un administrador', async () => {
    const res = await request(app).put(`/api/v1/usuarios/${adminId}`).use(con).send({ activo: false });
    expect(res.status).toBe(403);
    expect(res.body.error.codigo).toBe('SIN_PERMISO');

    const yo = await request(app).get('/api/v1/me').use(con);
    expect(yo.status).toBe(200);
  });

  it('CA2: responde 404 para un operario de otro establecimiento o inexistente', async () => {
    const res = await request(app)
      .put('/api/v1/usuarios/00000000-0000-4000-8000-0000000000ff')
      .use(con)
      .send({ activo: false });
    expect(res.status).toBe(404);
    expect(res.body.error.codigo).toBe('NO_ENCONTRADO');
  });

  it('CA1: el operario acepta la invitación y accede con sus credenciales', async () => {
    claveOperario = `Hu02-${randomUUID()}`;
    const { error } = await admin.auth.admin.updateUserById(creado.id, {
      password: claveOperario,
      email_confirm: true,
    });
    expect(error).toBeNull();

    const cliente = crearCliente(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    const { data, error: errorLogin } = await cliente.auth.signInWithPassword({
      email: correo,
      password: claveOperario,
    });
    expect(errorLogin).toBeNull();
    tokenOperario = data.session.access_token;

    const me = await request(app).get('/api/v1/me').set('Authorization', `Bearer ${tokenOperario}`);
    expect(me.status).toBe(200);
    expect(me.body.usuario).toMatchObject({ id: creado.id, rol: 'operario' });
  });

  it('CA3: desactivar bloquea el acceso, conserva el historial y la reactivación lo habilita', async () => {
    // Historial previo: un intento denegado queda en auditoría y una orden asociada al operario.
    const denegado = await request(app)
      .post('/api/v1/servicios')
      .set('Authorization', `Bearer ${tokenOperario}`)
      .send({ nombre: 'No permitido', precio: 1, duracion_min: 10 });
    expect(denegado.status).toBe(403);

    const { data: auditoria, error: errorAuditoria } = await admin
      .from('auditoria')
      .select('id')
      .eq('request_id', denegado.headers['x-request-id'])
      .single();
    if (errorAuditoria) throw errorAuditoria;

    const { data: orden, error: errorOrden } = await admin
      .from('ordenes')
      .insert({
        establecimiento_id: EST_A,
        creada_por: creado.id,
        codigo_seguimiento: `HU02${String(Date.now()).slice(-6)}${randomUUID().slice(0, 4).toUpperCase()}`,
      })
      .select('id')
      .single();
    if (errorOrden) throw errorOrden;

    const desactivado = await request(app).put(`/api/v1/usuarios/${creado.id}`).use(con).send({ activo: false });
    expect(desactivado.status).toBe(200);
    expect(desactivado.body.activo).toBe(false);

    const { data: perfil } = await admin.from('perfiles').select('activo').eq('id', creado.id).single();
    expect(perfil.activo).toBe(false);

    // Una sesión abierta pierde el acceso de inmediato.
    const sesionAbierta = await request(app)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${tokenOperario}`);
    expect(sesionAbierta.status).toBe(403);
    expect(sesionAbierta.body.error.codigo).toBe('SIN_PERMISO');

    // Un inicio de sesión nuevo tampoco sirve para entrar al panel: /me sigue rechazándolo.
    const cliente = crearCliente(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    const { data: nuevo, error: errorLogin } = await cliente.auth.signInWithPassword({
      email: correo,
      password: claveOperario,
    });
    if (!errorLogin) {
      const intento = await request(app)
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${nuevo.session.access_token}`);
      expect(intento.status).toBe(403);
    }

    // Nada se borra: perfil, auditoría y orden siguen existiendo.
    const { data: ordenSigue } = await admin.from('ordenes').select('id, creada_por').eq('id', orden.id).single();
    expect(ordenSigue).toMatchObject({ id: orden.id, creada_por: creado.id });
    const { data: auditoriaSigue } = await admin.from('auditoria').select('id').eq('id', auditoria.id).single();
    expect(auditoriaSigue.id).toBe(auditoria.id);

    // Reactivar vuelve a permitir el acceso con el flujo normal de autenticación.
    const reactivado = await request(app).put(`/api/v1/usuarios/${creado.id}`).use(con).send({ activo: true });
    expect(reactivado.status).toBe(200);
    expect(reactivado.body.activo).toBe(true);

    const segundoLogin = await cliente.auth.signInWithPassword({ email: correo, password: claveOperario });
    expect(segundoLogin.error).toBeNull();
    const me = await request(app)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${segundoLogin.data.session.access_token}`);
    expect(me.status).toBe(200);

    await admin.from('ordenes').delete().eq('id', orden.id);
  });
});
