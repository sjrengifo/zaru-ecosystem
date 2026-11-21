// HU-31 — Configuración de los estados que generan notificación contra la API y Supabase.
// Requiere backend/.env y backend/.env.spike.local, y la migración de HU-31 aplicada.
// ESC-F6-07: apagar un estado deja de enviar ese aviso de inmediato.
// ESC-F6-08: cada establecimiento conserva su propia configuración.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hayEntornoIntegracion, faltantes } from '../helpers/entorno.js';

const EST_A = '00000000-0000-0000-0000-00000000a058';
const EST_B = '00000000-0000-0000-0000-00000000b058';
const TEL = '3009461101';
const PLACA = 'HUN311';
const CODIGO = 'HU31CF1111';
const CORREO = 'config-hu31@zaru.test';

describe.skipIf(!hayEntornoIntegracion)(`HU-31 · configuración de notificaciones${hayEntornoIntegracion ? '' : ` (omitida: faltan ${faltantes.join(', ')})`}`, () => {
  let request, app, admin, tenant, notificarOrden, cifrar, tokenA, tokenB, vehiculo, orden;

  const con = (token) => (r) => r.set('Authorization', `Bearer ${token}`);
  const ruta = '/api/v1/configuracion/notificaciones';
  const consultar = (token) => request(app).get(ruta).use(con(token));
  const guardar = (token, config) => request(app).put(ruta).use(con(token)).send(config);

  const porEstado = (config) => Object.fromEntries(config.map((item) => [item.estado, item.activo]));
  const todos = (config, activo = true) => config.map(({ estado }) => ({ estado, activo }));
  const apagar = (config, estado) => config.map((item) => ({ estado: item.estado, activo: item.estado === estado ? false : item.activo }));

  async function sesion(email) {
    const { createClient } = await import('@supabase/supabase-js');
    const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await anon.auth.signInWithPassword({ email, password: process.env.SPIKE_PASSWORD });
    if (error) throw error;
    return data.session.access_token;
  }

  async function restablecer(establecimientoId) {
    await admin.from('config_notificaciones').update({ activo: true }).eq('establecimiento_id', establecimientoId).throwOnError();
  }

  async function limpiar() {
    if (!admin) return;
    await admin.from('ordenes').delete().like('codigo_seguimiento', 'HU31CF%');
    await admin.from('clientes').delete().eq('telefono', TEL);
  }

  beforeAll(async () => {
    request = (await import('supertest')).default;
    app = (await import('../../src/app.js')).default;
    admin = (await import('../../src/config/supabase.js')).supabase;
    ({ notificarOrden } = await import('../../src/shared/notificaciones.js'));
    ({ cifrar } = await import('../../src/shared/cifrado.js'));
    const { crearAccesoTenant } = await import('../../src/shared/tenant.js');
    tenant = crearAccesoTenant(admin, { establecimientoId: EST_A });

    tokenA = await sesion(process.env.SPIKE_A_EMAIL);
    tokenB = await sesion(process.env.SPIKE_B_EMAIL);

    await limpiar();
    await restablecer(EST_A);
    await restablecer(EST_B);

    const cliente = (await admin.from('clientes').insert({
      establecimiento_id: EST_A,
      nombre: '[Prueba HU-31] Cliente',
      telefono: TEL,
      correo: cifrar(CORREO),
      autorizacion_datos: true,
    }).select().single().throwOnError()).data;
    vehiculo = (await admin.from('vehiculos').insert({
      establecimiento_id: EST_A,
      cliente_id: cliente.id,
      placa: PLACA,
      tipo: 'carro',
    }).select().single().throwOnError()).data;
    orden = (await admin.from('ordenes').insert({
      establecimiento_id: EST_A,
      vehiculo_id: vehiculo.id,
      estado: 'recibido',
      subtotal: 20000,
      descuento: 0,
      total: 20000,
      codigo_seguimiento: CODIGO,
    }).select().single().throwOnError()).data;
  });

  afterAll(async () => {
    await limpiar();
    if (admin) {
      await restablecer(EST_A);
      await restablecer(EST_B);
    }
  });

  it('CA1: GET devuelve los cinco estados con su interruptor, listo obligatorio y activo', async () => {
    const res = await consultar(tokenA);
    expect(res.status).toBe(200);
    expect(res.body.map((item) => item.estado)).toEqual(['recibido', 'en_lavado', 'secado', 'listo', 'entregado']);
    expect(res.body.filter((item) => item.obligatorio).map((item) => item.estado)).toEqual(['listo']);
    expect(res.body.every((item) => item.activo)).toBe(true);
  });

  it('CA2: apagar "listo" responde 400 y no cambia la configuración', async () => {
    const actual = (await consultar(tokenA)).body;
    const res = await guardar(tokenA, apagar(actual, 'listo'));

    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('VALIDACION');
    expect((await consultar(tokenA)).body.find((item) => item.estado === 'listo').activo).toBe(true);
  });

  it('ESC-F6-07: el cambio aplica de inmediato al siguiente aviso', async () => {
    const actual = (await consultar(tokenA)).body;

    const apagado = await guardar(tokenA, apagar(actual, 'secado'));
    expect(apagado.status).toBe(200);
    expect(porEstado(apagado.body).secado).toBe(false);

    const enviados = [];
    const omitido = await notificarOrden(tenant, orden.id, 'secado', { enviar: async (m) => { enviados.push(m); return { enviado: true }; } });
    expect(omitido).toEqual({ estado: 'cancelada', motivo: 'desactivado' });
    expect(enviados).toHaveLength(0);
    const { count } = await admin.from('notificaciones').select('*', { count: 'exact', head: true }).eq('orden_id', orden.id);
    expect(count).toBe(0);

    const encendido = await guardar(tokenA, todos(apagado.body));
    expect(porEstado(encendido.body).secado).toBe(true);

    const enviado = await notificarOrden(tenant, orden.id, 'secado', { enviar: async (m) => { enviados.push(m); return { enviado: true }; } });
    expect(enviado.estado).toBe('enviada');
    expect(enviados).toHaveLength(1);
  });

  it('ESC-F6-08: la configuración de una sede no cambia la de otra', async () => {
    const configA = (await consultar(tokenA)).body;
    const configB = (await consultar(tokenB)).body;
    expect(configB.every((item) => item.activo)).toBe(true);

    const cambioB = await guardar(tokenB, apagar(configB, 'secado'));
    expect(cambioB.status).toBe(200);

    expect((await consultar(tokenB)).body.find((item) => item.estado === 'secado').activo).toBe(false);
    expect((await consultar(tokenA)).body.find((item) => item.estado === 'secado').activo).toBe(true);
    expect(porEstado(configA).secado).toBe(true);

    await guardar(tokenB, todos(configB));
  });
});
