// HU-10: avance, cierre y reversión del estado de una orden contra la API y Supabase.
// Requiere backend/.env, backend/.env.spike.local y la migración 20261103090100_hu10_cambiar_estado aplicada.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hayEntornoIntegracion, faltantes } from '../helpers/entorno.js';

const EST_A = '00000000-0000-0000-0000-00000000a058';
const EST_B = '00000000-0000-0000-0000-00000000b058';
const TEL = { a: '3009101001', b: '3009101002' };
const ETIQUETA = '[Prueba HU-10]';
const PLACA = { completo: 'HUE101', invalido: 'HUE102', revertir: 'HUE103', ajeno: 'HUE104', entregado: 'HUE105' };
const CODIGO = {
  completo: 'HU2E2E2222',
  invalido: 'HU2E2E3333',
  revertir: 'HU2E2E4444',
  ajeno: 'HU2E2E5555',
  entregado: 'HU2E2E6666',
};

describe.skipIf(!hayEntornoIntegracion)(`Estado de una orden${hayEntornoIntegracion ? '' : ` (omitida: faltan ${faltantes.join(', ')})`}`, () => {
  let request, app, admin, tokenA, usuarioA, vehiculoA, vehiculoB, vehiculoInvalido, vehiculoRevertir, vehiculoEntregado;
  const ordenes = [];

  const con = (token) => (r) => r.set('Authorization', `Bearer ${token}`);
  const cambiar = (id, cuerpo, token = tokenA) => request(app).patch(`/api/v1/ordenes/${id}/estado`).use(con(token)).send(cuerpo);

  async function limpiar() {
    if (!admin) return;
    await admin.from('ordenes').delete().like('codigo_seguimiento', 'HU2E2E%');
    await admin.from('clientes').delete().in('telefono', Object.values(TEL));
  }

  async function crearOrden(vehiculoId, codigo) {
    const { data } = await admin
      .from('ordenes')
      .insert({
        establecimiento_id: vehiculoId === vehiculoB.id ? EST_B : EST_A,
        vehiculo_id: vehiculoId,
        estado: 'recibido',
        subtotal: 25000,
        descuento: 0,
        total: 25000,
        codigo_seguimiento: codigo,
      })
      .select()
      .single()
      .throwOnError();
    ordenes.push(data.id);
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

    await limpiar();
    tokenA = await sesion(process.env.SPIKE_A_EMAIL);
    usuarioA = (await admin.auth.getUser(tokenA)).data.user.id;

    const cliente = async (establecimiento_id, telefono) =>
      (await admin
        .from('clientes')
        .insert({ establecimiento_id, nombre: `${ETIQUETA} Cliente`, telefono, autorizacion_datos: true })
        .select()
        .single()
        .throwOnError()).data;
    const clienteA = await cliente(EST_A, TEL.a);
    const clienteB = await cliente(EST_B, TEL.b);

    const vehiculo = async (establecimiento_id, cliente_id, placa) =>
      (await admin.from('vehiculos').insert({ establecimiento_id, cliente_id, placa, tipo: 'carro' }).select().single().throwOnError()).data;
    vehiculoA = await vehiculo(EST_A, clienteA.id, PLACA.completo);
    vehiculoInvalido = await vehiculo(EST_A, clienteA.id, PLACA.invalido);
    vehiculoRevertir = await vehiculo(EST_A, clienteA.id, PLACA.revertir);
    vehiculoEntregado = await vehiculo(EST_A, clienteA.id, PLACA.entregado);
    vehiculoB = await vehiculo(EST_B, clienteB.id, PLACA.ajeno);
  });

  afterAll(async () => {
    await limpiar();
  });

  describe('CA1: avanzar el estado de la orden', () => {
    it('recorre recibido, en_lavado, secado, listo y entregado guardando historial y evento', async () => {
      const orden = await crearOrden(vehiculoA.id, CODIGO.completo);
      let ultima;

      for (const estado of ['en_lavado', 'secado', 'listo', 'entregado']) {
        ultima = await cambiar(orden.id, { estado });
        expect(ultima.status).toBe(200);
        expect(ultima.body).toMatchObject({ id: orden.id, estado });
      }

      expect(ultima.body.entregada_at).toBeTruthy();

      const { data: historial } = await admin
        .from('historial_estados')
        .select('estado_anterior, estado, usuario_id, revertido, created_at')
        .eq('orden_id', orden.id)
        .order('id');
      expect(historial.map((h) => h.estado)).toEqual(['en_lavado', 'secado', 'listo', 'entregado']);
      expect(historial.map((h) => h.estado_anterior)).toEqual(['recibido', 'en_lavado', 'secado', 'listo']);
      expect(historial.every((h) => h.usuario_id === usuarioA && h.revertido === false && h.created_at)).toBe(true);

      const { data: eventos } = await admin
        .from('eventos')
        .select('tipo, payload')
        .eq('orden_id', orden.id)
        .order('created_at');
      expect(eventos).toHaveLength(4);
      expect(eventos.every((e) => e.tipo === 'orden.estado_cambiado')).toBe(true);

      const listo = eventos.find((e) => e.payload.estadoNuevo === 'listo');
      expect(listo.payload).toMatchObject({
        ordenId: orden.id,
        placa: PLACA.completo,
        codigoSeguimiento: CODIGO.completo,
        total: 25000,
        estadoAnterior: 'secado',
        estadoNuevo: 'listo',
        usuarioId: usuarioA,
      });
    });
  });

  describe('RF-F3-05: transición inválida', () => {
    it('responde 409 y no modifica la orden ni deja rastro', async () => {
      const orden = await crearOrden(vehiculoInvalido.id, CODIGO.invalido);
      const res = await cambiar(orden.id, { estado: 'entregado' });

      expect(res.status).toBe(409);
      expect(res.body.codigo).toBe('CONFLICTO');
      const { data } = await admin.from('ordenes').select('estado, version, entregada_at').eq('id', orden.id).single();
      expect(data).toEqual({ estado: 'recibido', version: 1, entregada_at: null });

      const { count: historial } = await admin.from('historial_estados').select('*', { count: 'exact', head: true }).eq('orden_id', orden.id);
      const { count: eventos } = await admin.from('eventos').select('*', { count: 'exact', head: true }).eq('orden_id', orden.id);
      expect({ historial, eventos }).toEqual({ historial: 0, eventos: 0 });
    });
  });

  describe('RF-F3-07: revertir el último cambio', () => {
    it('vuelve al estado anterior y marca el historial como revertido', async () => {
      const orden = await crearOrden(vehiculoRevertir.id, CODIGO.revertir);
      expect((await cambiar(orden.id, { estado: 'en_lavado' })).status).toBe(200);

      const res = await cambiar(orden.id, { revertir: true });
      expect(res.status).toBe(200);
      expect(res.body.estado).toBe('recibido');

      const { data: historial } = await admin
        .from('historial_estados')
        .select('estado, revertido')
        .eq('orden_id', orden.id)
        .single();
      expect(historial).toEqual({ estado: 'en_lavado', revertido: true });

      const { data: evento } = await admin
        .from('eventos')
        .select('tipo, payload')
        .eq('orden_id', orden.id)
        .eq('tipo', 'orden.estado_revertido')
        .single();
      expect(evento.payload).toMatchObject({ estadoAnterior: 'en_lavado', estadoNuevo: 'recibido' });
    });

    it('rechaza revertir una orden ya entregada', async () => {
      const orden = await crearOrden(vehiculoEntregado.id, CODIGO.entregado);
      for (const estado of ['en_lavado', 'listo', 'entregado']) {
        expect((await cambiar(orden.id, { estado })).status).toBe(200);
      }

      const res = await cambiar(orden.id, { revertir: true });
      expect(res.status).toBe(409);
      expect(res.body.codigo).toBe('CONFLICTO');
    });
  });

  describe('Aislamiento multi-tenant', () => {
    it('no permite cambiar una orden de otro establecimiento', async () => {
      const orden = await crearOrden(vehiculoB.id, CODIGO.ajeno);
      const res = await cambiar(orden.id, { estado: 'en_lavado' });

      expect(res.status).toBe(404);
      const { data } = await admin.from('ordenes').select('estado').eq('id', orden.id).single();
      expect(data.estado).toBe('recibido');
    });
  });
});
