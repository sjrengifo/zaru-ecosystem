// HU-06: historial de servicios de un vehículo, probado de punta a punta contra la API y Supabase.
// Requiere backend/.env y backend/.env.spike.local; sin ellos se omite.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hayEntornoIntegracion, faltantes } from '../helpers/entorno.js';

const EST_A = '00000000-0000-0000-0000-00000000a058';
const TEL = '3007070701';
const ETIQUETA = '[Prueba HU-06]';

describe.skipIf(!hayEntornoIntegracion)(`Historial de vehículo${hayEntornoIntegracion ? '' : ` (omitida: faltan ${faltantes.join(', ')})`}`, () => {
  let request, app, admin, tokenA, tokenB, conServicios, sinServicios, basico, premium, ordenReciente, ordenAntigua;

  const con = (token) => (r) => r.set('Authorization', `Bearer ${token}`);
  const consultar = (id, token = tokenA) => request(app).get(`/api/v1/vehiculos/${id}/historial`).use(con(token));

  async function limpiar() {
    const { data: vehiculos } = await admin.from('vehiculos').select('id').in('placa', ['HUC601', 'HUC602']).eq('establecimiento_id', EST_A);
    const ids = (vehiculos ?? []).map((v) => v.id);
    if (ids.length) await admin.from('ordenes').delete().in('vehiculo_id', ids);
    await admin.from('clientes').delete().eq('telefono', TEL).eq('establecimiento_id', EST_A);
    await admin.from('servicios').delete().like('nombre', `${ETIQUETA}%`);
  }

  async function crearOrden(vehiculo_id, estado, fecha, descuento, lineas) {
    const subtotal = lineas.reduce((suma, l) => suma + l.precio, 0);
    const { data } = await admin
      .from('ordenes')
      .insert({ establecimiento_id: EST_A, vehiculo_id, estado, subtotal, descuento, total: subtotal - descuento, created_at: fecha, entregada_at: estado === 'entregado' ? fecha : null })
      .select()
      .single()
      .throwOnError();
    await admin.from('orden_servicios').insert(lineas.map((l) => ({ orden_id: data.id, servicio_id: l.id, precio: l.precio, duracion_min: 30 }))).throwOnError();
    return data;
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
    const { data: cliente } = await admin.from('clientes').insert({ establecimiento_id: EST_A, nombre: `${ETIQUETA} Titular`, telefono: TEL, autorizacion_datos: true }).select().single().throwOnError();
    const { data: vehiculos } = await admin
      .from('vehiculos')
      .insert([
        { establecimiento_id: EST_A, cliente_id: cliente.id, placa: 'HUC601', tipo: 'carro' },
        { establecimiento_id: EST_A, cliente_id: cliente.id, placa: 'HUC602', tipo: 'carro' },
      ])
      .select()
      .throwOnError();
    conServicios = vehiculos.find((v) => v.placa === 'HUC601');
    sinServicios = vehiculos.find((v) => v.placa === 'HUC602');
    const { data: servicios } = await admin
      .from('servicios')
      .insert([
        { establecimiento_id: EST_A, nombre: `${ETIQUETA} Básico`, precio: 25000, duracion_min: 30 },
        { establecimiento_id: EST_A, nombre: `${ETIQUETA} Premium`, precio: 45000, duracion_min: 60 },
      ])
      .select()
      .throwOnError();
    basico = servicios.find((s) => s.precio === 25000);
    premium = servicios.find((s) => s.precio === 45000);

    ordenAntigua = await crearOrden(conServicios.id, 'entregado', '2026-08-01T10:00:00Z', 0, [{ id: basico.id, precio: 20000 }]);
    ordenReciente = await crearOrden(conServicios.id, 'entregado', '2026-10-01T10:00:00Z', 5000, [
      { id: basico.id, precio: 25000 },
      { id: premium.id, precio: 45000 },
    ]);
    await crearOrden(conServicios.id, 'en_lavado', '2026-10-20T10:00:00Z', 0, [{ id: premium.id, precio: 45000 }]);
  });

  afterAll(async () => {
    await limpiar();
  });

  describe('CA1: servicios anteriores con fecha, servicio y valor', () => {
    it('lista las órdenes entregadas de la más reciente a la más antigua, sin las que siguen en curso', async () => {
      const res = await consultar(conServicios.id);
      expect(res.status).toBe(200);
      expect(res.body.map((o) => o.ordenId)).toEqual([ordenReciente.id, ordenAntigua.id]);
    });

    it('cada orden trae fecha, servicios con su precio, descuento y total', async () => {
      const [reciente] = (await consultar(conServicios.id)).body;
      expect(new Date(reciente.fecha).toISOString()).toBe('2026-10-01T10:00:00.000Z');
      expect(reciente).toMatchObject({ subtotal: 70000, descuento: 5000, total: 65000 });
      expect(reciente.servicios).toHaveLength(2);
      expect(reciente.servicios).toEqual(
        expect.arrayContaining([
          { nombre: `${ETIQUETA} Básico`, precio: 25000 },
          { nombre: `${ETIQUETA} Premium`, precio: 45000 },
        ]),
      );
    });

    it('conserva el precio de la orden aunque el catálogo cambie', async () => {
      await admin.from('servicios').update({ precio: 99000 }).eq('id', basico.id).throwOnError();
      const historial = (await consultar(conServicios.id)).body;
      expect(historial[1].servicios).toEqual([{ nombre: `${ETIQUETA} Básico`, precio: 20000 }]);
    });
  });

  describe('CA2: vehículo sin servicios previos', () => {
    it('responde una lista vacía', async () => {
      const res = await consultar(sinServicios.id);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('aislamiento', () => {
    it('un vehículo de otro establecimiento responde 404, igual que uno inexistente', async () => {
      const [ajeno, inexistente] = await Promise.all([consultar(conServicios.id, tokenB), consultar('00000000-0000-4000-8000-000000000000', tokenB)]);
      expect(ajeno.status).toBe(404);
      expect(inexistente.status).toBe(404);
      expect(ajeno.body.error.mensaje).toBe(inexistente.body.error.mensaje);
    });
  });
});
