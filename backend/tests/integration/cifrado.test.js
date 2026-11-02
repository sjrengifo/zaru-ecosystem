// HU-50 (ZARU-57) CA2: el correo del cliente queda cifrado en la base y la API lo entrega descifrado.
// Requiere backend/.env (con ZARU_CLAVE_CIFRADO) y backend/.env.spike.local; sin ellos se omite.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hayEntornoIntegracion, faltantes } from '../helpers/entorno.js';

const listo = hayEntornoIntegracion && Boolean(process.env.ZARU_CLAVE_CIFRADO);
const TELEFONO = '3005050505';
const CORREO = 'titular.hu50@correo.com';

describe.skipIf(!listo)(`Cifrado en reposo${listo ? '' : ` (omitida: faltan ${[...faltantes, 'ZARU_CLAVE_CIFRADO'].join(', ')})`}`, () => {
  let request, app, admin, token, clienteId;

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
    await admin.from('clientes').delete().eq('telefono', TELEFONO);
  });

  it('al registrar, la API responde el correo legible', async () => {
    const res = await request(app)
      .post('/api/v1/clientes')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: '[Prueba HU-50] Titular', telefono: TELEFONO, correo: CORREO, autorizacionDatos: true, politicaVersion: (await request(app).get('/api/v1/politicas-datos/vigente')).body.version });
    expect(res.status).toBe(201);
    expect(res.body.correo).toBe(CORREO);
    clienteId = res.body.id;
  });

  it('en la base de datos el correo está cifrado y no contiene el texto original', async () => {
    const { data } = await admin.from('clientes').select('correo').eq('id', clienteId).single();
    expect(data.correo.startsWith('v1:')).toBe(true);
    expect(data.correo).not.toContain('titular');
    expect(data.correo).not.toContain('@');
  });

  it('al consultar y al listar, la API lo descifra para el usuario autorizado', async () => {
    const detalle = await request(app).get(`/api/v1/clientes/${clienteId}`).set('Authorization', `Bearer ${token}`);
    expect(detalle.body.correo).toBe(CORREO);
    const lista = await request(app).get('/api/v1/clientes').query({ buscar: TELEFONO }).set('Authorization', `Bearer ${token}`);
    expect(lista.body.find((c) => c.id === clienteId).correo).toBe(CORREO);
  });

  it('al editar el correo se vuelve a guardar cifrado', async () => {
    const res = await request(app).put(`/api/v1/clientes/${clienteId}`).set('Authorization', `Bearer ${token}`).send({ correo: 'nuevo.hu50@correo.com' });
    expect(res.body.correo).toBe('nuevo.hu50@correo.com');
    const { data } = await admin.from('clientes').select('correo').eq('id', clienteId).single();
    expect(data.correo.startsWith('v1:')).toBe(true);
    expect(data.correo).not.toContain('nuevo');
  });
});
