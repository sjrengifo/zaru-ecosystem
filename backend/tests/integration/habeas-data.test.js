// HU-51 (ZARU-58): autorización del titular para el tratamiento de datos (Ley 1581 de 2012),
// probada contra la API y Supabase. Requiere backend/.env y backend/.env.spike.local; sin ellos se omite.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hayEntornoIntegracion, faltantes } from '../helpers/entorno.js';

const EST_A = '00000000-0000-0000-0000-00000000a058';
const ADMIN_A = '00000000-0000-0000-0000-0000000a0058';
const TEL = { valido: '3005151001', sinAutorizar: '3005151002', versionVieja: '3005151003' };

describe.skipIf(!hayEntornoIntegracion)(`Habeas Data${hayEntornoIntegracion ? '' : ` (omitida: faltan ${faltantes.join(', ')})`}`, () => {
  let request, app, admin;
  const tokens = {};
  const creados = [];

  beforeAll(async () => {
    request = (await import('supertest')).default;
    app = (await import('../../src/app.js')).default;
    admin = (await import('../../src/config/supabase.js')).supabase;
    const { createClient } = await import('@supabase/supabase-js');
    for (const [quien, email] of [['A', process.env.SPIKE_A_EMAIL], ['B', process.env.SPIKE_B_EMAIL]]) {
      const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
      const { data, error } = await anon.auth.signInWithPassword({ email, password: process.env.SPIKE_PASSWORD });
      if (error) throw error;
      tokens[quien] = data.session.access_token;
    }
  });

  afterAll(async () => {
    // El borrado del titular elimina en cascada su evidencia de autorización.
    await admin.from('clientes').delete().in('telefono', Object.values(TEL));
  });

  const con = (quien) => (r) => r.set('Authorization', `Bearer ${tokens[quien]}`);
  const clientesConTelefono = async (telefono) => (await admin.from('clientes').select('id').eq('telefono', telefono)).data;

  describe('CA1: la política de tratamiento se muestra antes del registro', () => {
    it('GET /api/v1/politicas-datos/vigente es pública y devuelve versión y texto', async () => {
      const res = await request(app).get('/api/v1/politicas-datos/vigente');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ version: '1.0', titulo: 'Política de tratamiento de datos personales' });
      expect(res.body.contenido).toContain('Ley 1581 de 2012');
      expect(res.body.contenido).toContain('Derechos del titular');
    });
  });

  describe('CA2: al aceptar se guarda fecha, hora y versión de la política', () => {
    let clienteId;

    it('POST /api/v1/clientes con autorización crea el cliente y su evidencia', async () => {
      const antes = Date.now();
      const res = await request(app)
        .post('/api/v1/clientes')
        .use(con('A'))
        .send({ nombre: '[Prueba HU-51] Titular', telefono: TEL.valido, autorizacionDatos: true, politicaVersion: '1.0' });
      expect(res.status).toBe(201);
      clienteId = res.body.id;
      creados.push(clienteId);
      // HU-03 CA1: el cliente queda con la fecha de autorización registrada.
      expect(new Date(res.body.fecha_autorizacion).getTime()).toBeGreaterThanOrEqual(antes - 5000);

      const { data } = await admin.from('consentimientos').select('*').eq('cliente_id', clienteId);
      expect(data).toHaveLength(1);
      expect(data[0]).toMatchObject({
        establecimiento_id: EST_A,
        tipo: 'tratamiento_datos',
        otorgado: true,
        canal: 'panel',
        politica_version: '1.0',
        registrado_por: ADMIN_A,
      });
      expect(data[0].ip).toBeTruthy();
      expect(new Date(data[0].created_at).getTime()).toBeGreaterThanOrEqual(antes - 5000);
    });

    it('el administrador consulta la evidencia de autorización del cliente', async () => {
      const res = await request(app).get(`/api/v1/clientes/${clienteId}/consentimientos`).use(con('A'));
      expect(res.status).toBe(200);
      expect(res.body).toEqual([{ tipo: 'tratamiento_datos', otorgado: true, canal: 'panel', politicaVersion: '1.0', fecha: expect.any(String) }]);
    });

    it('otro establecimiento no puede consultar esa evidencia', async () => {
      const res = await request(app).get(`/api/v1/clientes/${clienteId}/consentimientos`).use(con('B'));
      expect(res.status).toBe(404);
    });

    it('la evidencia no se puede modificar ni borrar, ni siquiera con la clave del backend', async () => {
      const { error: errUpdate } = await admin.from('consentimientos').update({ otorgado: false }).eq('cliente_id', clienteId);
      const { error: errDelete } = await admin.from('consentimientos').delete().eq('cliente_id', clienteId);
      expect(errUpdate?.message).toMatch(/no se puede modificar/);
      expect(errDelete?.message).toMatch(/no se puede modificar/);
    });
  });

  describe('CA3: sin autorización no se guarda ningún dato personal', () => {
    it('sin aceptar la autorización responde 400 e informa que es necesaria', async () => {
      const res = await request(app)
        .post('/api/v1/clientes')
        .use(con('A'))
        .send({ nombre: '[Prueba HU-51] Sin autorizar', telefono: TEL.sinAutorizar, autorizacionDatos: false, politicaVersion: '1.0' });
      expect(res.status).toBe(400);
      expect(res.body.error.detalles).toContainEqual({
        campo: 'autorizacionDatos',
        mensaje: 'La autorización de tratamiento de datos es obligatoria (Ley 1581 de 2012)',
      });
      expect(await clientesConTelefono(TEL.sinAutorizar)).toEqual([]);
    });

    it('si la versión aceptada ya no es la vigente responde 409 y no guarda nada', async () => {
      const res = await request(app)
        .post('/api/v1/clientes')
        .use(con('A'))
        .send({ nombre: '[Prueba HU-51] Versión vieja', telefono: TEL.versionVieja, autorizacionDatos: true, politicaVersion: '0.9' });
      expect(res.status).toBe(409);
      expect(res.body.error.detalles[0].campo).toBe('politicaVersion');
      expect(await clientesConTelefono(TEL.versionVieja)).toEqual([]);
    });
  });
});
