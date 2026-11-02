// HU-41 (ZARU-47): aislamiento de datos entre establecimientos, probado de punta a punta
// contra la API y un proyecto real de Supabase.
//
// Requiere backend/.env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) y backend/.env.spike.local
// (SUPABASE_ANON_KEY y los administradores de prueba de los establecimientos A y B del spike HU-58).
// Sin esas variables, la suite se omite.
//
// Los datos que crea se marcan con "[Prueba HU-41]" y se eliminan al terminar.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { hayEntornoIntegracion, faltantes } from '../helpers/entorno.js';

const EST_A = '00000000-0000-0000-0000-00000000a058';
const EST_B = '00000000-0000-0000-0000-00000000b058';
const CLIENTE_A = '00000000-0000-0000-0000-0000000ac058';
const CLIENTE_B = '00000000-0000-0000-0000-0000000bc058';
const ETIQUETA = '[Prueba HU-41]';

describe.skipIf(!hayEntornoIntegracion)(`Aislamiento multi-tenant${hayEntornoIntegracion ? '' : ` (omitida: faltan ${faltantes.join(', ')})`}`, () => {
  let request, app, admin;
  const tokens = {};
  const creados = { usuarios: [], establecimientos: [], clientes: [] };
  const tenantC = { id: randomUUID(), clienteId: randomUUID(), email: `hu41-${Date.now()}@zaru.test` };

  async function iniciarSesion(email, password = process.env.SPIKE_PASSWORD) {
    const { createClient } = await import('@supabase/supabase-js');
    const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await anon.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.session.access_token;
  }

  const get = (ruta, quien) => request(app).get(ruta).set('Authorization', `Bearer ${tokens[quien]}`);
  const post = (ruta, quien, cuerpo) => request(app).post(ruta).set('Authorization', `Bearer ${tokens[quien]}`).send(cuerpo);
  const put = (ruta, quien, cuerpo) => request(app).put(ruta).set('Authorization', `Bearer ${tokens[quien]}`).send(cuerpo);

  beforeAll(async () => {
    request = (await import('supertest')).default;
    app = (await import('../../src/app.js')).default;
    admin = (await import('../../src/config/supabase.js')).supabase;

    // Servicios de prueba en A y B.
    const { error: errServ } = await admin.from('servicios').insert([
      { establecimiento_id: EST_A, nombre: `${ETIQUETA} Lavado A`, precio: 20000, duracion_min: 30 },
      { establecimiento_id: EST_B, nombre: `${ETIQUETA} Lavado B`, precio: 20000, duracion_min: 30 },
    ]);
    if (errServ) throw errServ;

    // CA3: alta de un establecimiento nuevo (C) en tiempo de prueba, solo con datos; sin tocar el código.
    const password = `Hu41-${randomUUID()}`;
    await admin.from('establecimientos').insert({ id: tenantC.id, nombre: `${ETIQUETA} Lavadero C` }).throwOnError();
    creados.establecimientos.push(tenantC.id);
    const { data: usuario, error: errUsuario } = await admin.auth.admin.createUser({
      email: tenantC.email,
      password,
      email_confirm: true,
    });
    if (errUsuario) throw errUsuario;
    creados.usuarios.push(usuario.user.id);
    await admin.from('perfiles').insert({ id: usuario.user.id, establecimiento_id: tenantC.id, nombre: 'Admin C', rol: 'admin' }).throwOnError();
    await admin
      .from('clientes')
      .insert({ id: tenantC.clienteId, establecimiento_id: tenantC.id, nombre: 'Cliente solo de C', telefono: '3200000041', autorizacion_datos: true })
      .throwOnError();

    tokens.A = await iniciarSesion(process.env.SPIKE_A_EMAIL);
    tokens.B = await iniciarSesion(process.env.SPIKE_B_EMAIL);
    tokens.C = await iniciarSesion(tenantC.email, password);
  });

  afterAll(async () => {
    if (!admin) return;
    await admin.from('servicios').delete().like('nombre', `${ETIQUETA}%`);
    if (creados.clientes.length) await admin.from('clientes').delete().in('id', creados.clientes);
    for (const id of creados.usuarios) await admin.auth.admin.deleteUser(id);
    if (creados.establecimientos.length) await admin.from('establecimientos').delete().in('id', creados.establecimientos);
  });

  describe('CA1: cada usuario solo ve los datos de su establecimiento', () => {
    it('GET /api/clientes devuelve solo clientes del establecimiento A', async () => {
      const res = await get('/api/clientes', 'A');
      expect(res.status).toBe(200);
      const ids = res.body.map((c) => c.id);
      expect(ids).toContain(CLIENTE_A);
      expect(ids).not.toContain(CLIENTE_B);
      expect(ids).not.toContain(tenantC.clienteId);
    });

    it('GET /api/servicios devuelve solo servicios del establecimiento de la sesión', async () => {
      const [a, b] = await Promise.all([get('/api/servicios', 'A'), get('/api/servicios', 'B')]);
      expect(a.body.map((s) => s.nombre)).toEqual([`${ETIQUETA} Lavado A`]);
      expect(b.body.map((s) => s.nombre)).toEqual([`${ETIQUETA} Lavado B`]);
      expect(a.body.every((s) => s.establecimiento_id === EST_A)).toBe(true);
    });

    it('GET /api/establecimiento devuelve el establecimiento propio', async () => {
      const res = await get('/api/establecimiento', 'B');
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(EST_B);
    });

    it('un parámetro establecimiento_id en la URL no cambia el filtro', async () => {
      const res = await get(`/api/clientes?establecimiento_id=${EST_B}`, 'A');
      expect(res.body.map((c) => c.id)).not.toContain(CLIENTE_B);
    });

    it('POST /api/clientes guarda en el establecimiento de la sesión aunque el cuerpo indique otro', async () => {
      const res = await post('/api/clientes', 'A', {
        nombre: `${ETIQUETA} Intento de cruce`,
        telefono: '3100004141',
        correo: 'cruce.hu41@correo.com',
        autorizacionDatos: true,
        politicaVersion: (await request(app).get('/api/v1/politicas-datos/vigente')).body.version,
        establecimiento_id: EST_B,
      });
      expect(res.status).toBe(201);
      creados.clientes.push(res.body.id);
      expect(res.body.establecimiento_id).toBe(EST_A);
    });
  });

  describe('CA2: un recurso de otro establecimiento se rechaza sin revelar que existe', () => {
    it('GET de un cliente de B responde 404, idéntico a un id inexistente o inválido', async () => {
      const [ajeno, inexistente, invalido] = await Promise.all([
        get(`/api/clientes/${CLIENTE_B}`, 'A'),
        get(`/api/clientes/${randomUUID()}`, 'A'),
        get('/api/clientes/no-es-un-id', 'A'),
      ]);
      expect(ajeno.status).toBe(404);
      // Idénticas salvo el requestId, que es propio de cada petición.
      const sinRequestId = ({ error: { requestId, ...resto } }) => resto;
      expect(sinRequestId(ajeno.body)).toEqual({ codigo: 'NO_ENCONTRADO', mensaje: 'Cliente no encontrado' });
      expect(inexistente.status).toBe(404);
      expect(sinRequestId(inexistente.body)).toEqual(sinRequestId(ajeno.body));
      expect(invalido.status).toBe(404);
      expect(sinRequestId(invalido.body)).toEqual(sinRequestId(ajeno.body));
    });

    it('PUT de un cliente de B responde 404 y no lo modifica', async () => {
      const res = await put(`/api/clientes/${CLIENTE_B}`, 'A', { nombre: 'Modificado por A' });
      expect(res.status).toBe(404);
      expect(res.body.error.codigo).toBe('NO_ENCONTRADO');
      const { data } = await admin.from('clientes').select('nombre').eq('id', CLIENTE_B).single();
      expect(data.nombre).toBe('Cliente solo de B');
    });

    it('B tampoco puede leer clientes de A', async () => {
      const res = await get(`/api/clientes/${CLIENTE_A}`, 'B');
      expect(res.status).toBe(404);
    });
  });

  describe('CA3: un establecimiento nuevo queda aislado sin cambios de código', () => {
    it('el administrador de C solo ve los datos de C', async () => {
      const res = await get('/api/clientes', 'C');
      expect(res.status).toBe(200);
      expect(res.body.map((c) => c.id)).toEqual([tenantC.clienteId]);
      const est = await get('/api/establecimiento', 'C');
      expect(est.body.id).toBe(tenantC.id);
    });

    it('C no puede leer datos de A, y A no puede leer datos de C', async () => {
      const [cLeeA, aLeeC] = await Promise.all([
        get(`/api/clientes/${CLIENTE_A}`, 'C'),
        get(`/api/clientes/${tenantC.clienteId}`, 'A'),
      ]);
      expect(cLeeA.status).toBe(404);
      expect(aLeeC.status).toBe(404);
    });

    it('los listados de A y B no incluyen al cliente de C', async () => {
      const [a, b] = await Promise.all([get('/api/clientes', 'A'), get('/api/clientes', 'B')]);
      expect(a.body.map((c) => c.id)).not.toContain(tenantC.clienteId);
      expect(b.body.map((c) => c.id)).not.toContain(tenantC.clienteId);
    });
  });

  describe('sesión', () => {
    it('sin token responde 401', async () => {
      const res = await request(app).get('/api/clientes');
      expect(res.status).toBe(401);
      expect(res.body.error.codigo).toBe('NO_AUTENTICADO');
    });
  });
});
