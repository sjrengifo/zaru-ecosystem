// HU-43 (ZARU-50): validación y versionado probados de punta a punta contra la API y Supabase.
// Requiere backend/.env y backend/.env.spike.local; sin ellos se omite.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hayEntornoIntegracion, faltantes } from '../helpers/entorno.js';

const CLIENTE_A = '00000000-0000-0000-0000-0000000ac058';

describe.skipIf(!hayEntornoIntegracion)(`API REST${hayEntornoIntegracion ? '' : ` (omitida: faltan ${faltantes.join(', ')})`}`, () => {
  let request, app, admin, token;
  const creados = [];

  beforeAll(async () => {
    request = (await import('supertest')).default;
    app = (await import('../../src/app.js')).default;
    admin = (await import('../../src/config/supabase.js')).supabase;
    const { createClient } = await import('@supabase/supabase-js');
    const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await anon.auth.signInWithPassword({ email: process.env.SPIKE_A_EMAIL, password: process.env.SPIKE_PASSWORD });
    if (error) throw error;
    token = data.session.access_token;
  });

  afterAll(async () => {
    if (creados.length) await admin.from('clientes').delete().in('id', creados);
  });

  const conSesion = (r) => r.set('Authorization', `Bearer ${token}`);

  describe('CA2: datos inválidos o incompletos', () => {
    it('POST /api/v1/clientes sin datos responde 400 con cada campo a corregir y no crea nada', async () => {
      const antes = await admin.from('clientes').select('id', { count: 'exact', head: true });
      const res = await request(app).post('/api/v1/clientes').use(conSesion).send({});
      expect(res.status).toBe(400);
      expect(res.body.error.codigo).toBe('VALIDACION');
      expect(res.body.error.detalles.map((d) => d.campo)).toEqual(['nombre', 'telefono', 'autorizacionDatos']);
      const despues = await admin.from('clientes').select('id', { count: 'exact', head: true });
      expect(despues.count).toBe(antes.count);
    });

    it('un teléfono repetido responde 409 CONFLICTO e indica el cliente existente', async () => {
      const res = await request(app)
        .post('/api/v1/clientes')
        .use(conSesion)
        .send({ nombre: 'Duplicado', telefono: '3000000058', autorizacionDatos: true });
      expect(res.status).toBe(409);
      expect(res.body.error.codigo).toBe('CONFLICTO');
      expect(res.body.error.detalles[0]).toMatchObject({ campo: 'telefono', clienteId: CLIENTE_A });
    });

    it('un cliente válido se crea con 201 y los datos normalizados', async () => {
      const res = await request(app)
        .post('/api/v1/clientes')
        .use(conSesion)
        .send({ nombre: '  [Prueba HU-43] Ana  ', telefono: '3004343434', correo: '', autorizacionDatos: true });
      expect(res.status).toBe(201);
      creados.push(res.body.id);
      expect(res.body).toMatchObject({ nombre: '[Prueba HU-43] Ana', telefono: '3004343434', correo: null, autorizacion_datos: true });
    });

    it('PUT con un teléfono inválido responde 400 y no modifica el cliente', async () => {
      const res = await request(app).put(`/api/v1/clientes/${CLIENTE_A}`).use(conSesion).send({ telefono: '12' });
      expect(res.status).toBe(400);
      expect(res.body.error.detalles[0].campo).toBe('telefono');
      const { data } = await admin.from('clientes').select('telefono').eq('id', CLIENTE_A).single();
      expect(data.telefono).toBe('3000000058');
    });
  });

  describe('CA3: versiones', () => {
    it('GET /api/clientes (sin versión) y GET /api/v1/clientes devuelven los mismos datos', async () => {
      const [anterior, actual] = await Promise.all([
        request(app).get('/api/clientes').use(conSesion),
        request(app).get('/api/v1/clientes').use(conSesion),
      ]);
      expect(anterior.status).toBe(200);
      expect(anterior.body).toEqual(actual.body);
      expect(anterior.headers.deprecation).toBe('true');
      expect(actual.headers.deprecation).toBeUndefined();
    });
  });
});
