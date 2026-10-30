// HU-05: registrar vehículos asociados a un cliente, probado de punta a punta contra la API y Supabase.
// Requiere backend/.env y backend/.env.spike.local; sin ellos se omite.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hayEntornoIntegracion, faltantes } from '../helpers/entorno.js';

const EST_A = '00000000-0000-0000-0000-00000000a058';
const EST_B = '00000000-0000-0000-0000-00000000b058';
const TEL = { ana: '3006060601', luis: '3006060602', ajeno: '3006060603' };

describe.skipIf(!hayEntornoIntegracion)(`Vehículos${hayEntornoIntegracion ? '' : ` (omitida: faltan ${faltantes.join(', ')})`}`, () => {
  let request, app, admin, tokenA, tokenB, ana, luis, ajeno;

  const con = (token) => (r) => r.set('Authorization', `Bearer ${token}`);
  const registrar = (cuerpo, token = tokenA) => request(app).post('/api/v1/vehiculos').use(con(token)).send(cuerpo);
  const detalle = (id, token = tokenA) => request(app).get(`/api/v1/clientes/${id}`).use(con(token));

  async function limpiar() {
    await admin.from('clientes').delete().in('telefono', Object.values(TEL)); // Sus vehículos se borran en cascada.
  }

  beforeAll(async () => {
    request = (await import('supertest')).default;
    app = (await import('../../src/app.js')).default;
    admin = (await import('../../src/config/supabase.js')).supabase;
    const { createClient } = await import('@supabase/supabase-js');
    const sesion = async (email) => {
      const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
      const { data, error } = await anon.auth.signInWithPassword({ email, password: process.env.SPIKE_PASSWORD });
      if (error) throw error;
      return data.session.access_token;
    };
    tokenA = await sesion(process.env.SPIKE_A_EMAIL);
    tokenB = await sesion(process.env.SPIKE_B_EMAIL);

    await limpiar();
    const crear = async (establecimiento_id, nombre, telefono) =>
      (await admin.from('clientes').insert({ establecimiento_id, nombre, telefono, autorizacion_datos: true }).select().single().throwOnError()).data;
    ana = await crear(EST_A, '[Prueba HU-05] Ana', TEL.ana);
    luis = await crear(EST_A, '[Prueba HU-05] Luis', TEL.luis);
    ajeno = await crear(EST_B, '[Prueba HU-05] Ajeno', TEL.ajeno);
  });

  afterAll(async () => {
    await limpiar();
  });

  describe('CA1: registrar un vehículo con placa válida', () => {
    it('queda asociado al cliente, con la placa normalizada, en el establecimiento de la sesión', async () => {
      const res = await registrar({ clienteId: ana.id, placa: 'hub-501', tipo: 'carro', marca: 'Mazda', color: 'Rojo', establecimiento_id: EST_B });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ cliente_id: ana.id, establecimiento_id: EST_A, placa: 'HUB501', tipo: 'carro', marca: 'Mazda', color: 'Rojo' });
    });

    it('una placa con formato inválido responde 400 y no guarda nada', async () => {
      const res = await registrar({ clienteId: ana.id, placa: 'HUB12D', tipo: 'carro' });
      expect(res.status).toBe(400);
      expect(res.body.error.detalles[0].campo).toBe('placa');
      const { data } = await admin.from('vehiculos').select('id').eq('placa', 'HUB12D');
      expect(data).toEqual([]);
    });

    it('un cliente de otro establecimiento o inexistente responde 404', async () => {
      expect((await registrar({ clienteId: ajeno.id, placa: 'HUB502', tipo: 'carro' })).status).toBe(404);
      expect((await registrar({ clienteId: 'no-es-un-id', placa: 'HUB502', tipo: 'carro' })).status).toBe(404);
    });
  });

  describe('CA2: la placa no se repite en el establecimiento', () => {
    it('responde 409 e indica a qué cliente pertenece, aunque se escriba distinto', async () => {
      const res = await registrar({ clienteId: luis.id, placa: 'hub 501', tipo: 'carro' });
      expect(res.status).toBe(409);
      expect(res.body.error.detalles[0]).toEqual({ campo: 'placa', mensaje: 'La placa ya está registrada a nombre de [Prueba HU-05] Ana', clienteId: ana.id });
    });

    it('en registros simultáneos solo uno se crea y los demás reciben el cliente', async () => {
      const respuestas = await Promise.all(Array.from({ length: 5 }, () => registrar({ clienteId: luis.id, placa: 'HUB503', tipo: 'carro' })));
      expect(respuestas.filter((r) => r.status === 201)).toHaveLength(1);
      const rechazadas = respuestas.filter((r) => r.status === 409);
      expect(rechazadas).toHaveLength(4);
      for (const r of rechazadas) expect(r.body.error.detalles[0].clienteId).toBe(luis.id);
    });

    it('otro establecimiento sí puede registrar la misma placa', async () => {
      const res = await registrar({ clienteId: ajeno.id, placa: 'HUB501', tipo: 'carro' }, tokenB);
      expect(res.status).toBe(201);
      expect(res.body.establecimiento_id).toBe(EST_B);
    });
  });

  describe('CA3: el perfil del cliente muestra todos sus vehículos', () => {
    it('lista cada vehículo con sus datos', async () => {
      expect((await registrar({ clienteId: ana.id, placa: 'HUB50D', tipo: 'moto' })).status).toBe(201);
      const res = await detalle(ana.id);
      expect(res.body.vehiculos.map((v) => v.placa).sort()).toEqual(['HUB501', 'HUB50D']);
      expect(res.body.vehiculos.find((v) => v.placa === 'HUB501')).toMatchObject({ tipo: 'carro', marca: 'Mazda', color: 'Rojo' });
    });
  });

  describe('GET /vehiculos', () => {
    const buscar = (placa, token = tokenA) => request(app).get('/api/v1/vehiculos').query(placa ? { placa } : {}).use(con(token));

    it('busca por placa, sin importar mayúsculas ni guiones, e indica el cliente', async () => {
      const res = await buscar('hub-50');
      expect(res.status).toBe(200);
      expect(res.body.map((v) => v.placa)).toEqual(['HUB501', 'HUB503', 'HUB50D']);
      expect(res.body[0].clientes).toEqual({ id: ana.id, nombre: '[Prueba HU-05] Ana' });
    });

    it('otro establecimiento solo ve sus propios vehículos', async () => {
      const res = await buscar('hub-50', tokenB);
      expect(res.body.map((v) => v.placa)).toEqual(['HUB501']);
      expect(res.body[0].clientes.id).toBe(ajeno.id);
    });
  });
});
