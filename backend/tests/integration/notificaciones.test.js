// HU-46: avisos por correo al cliente contra la API y Supabase (tabla notificaciones de HU-42).
// Requiere backend/.env y backend/.env.spike.local. No envía correos reales: la prueba directa usa
// un envío falso y la prueba por la API funciona con o sin SMTP configurado (CA3).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hayEntornoIntegracion, faltantes } from '../helpers/entorno.js';

const EST_A = '00000000-0000-0000-0000-00000000a058';
const TEL = { conCorreo: '3009461001', sinCorreo: '3009461002' };
const PLACA = { conCorreo: 'HUN461', sinCorreo: 'HUN462', api: 'HUN463' };
const CODIGO = { directo: 'HU46NT2222', api: 'HU46NT3333', sinCorreo: 'HU46NT4444' };
const CORREO = 'cliente-hu46@zaru.test';

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!hayEntornoIntegracion)(`HU-46 · avisos por correo${hayEntornoIntegracion ? '' : ` (omitida: faltan ${faltantes.join(', ')})`}`, () => {
  let request, app, admin, tenant, notificarOrden, descifrar, tokenA, vehiculo, vehiculoApi, vehiculoSinCorreo;

  const con = (token) => (r) => r.set('Authorization', `Bearer ${token}`);

  async function limpiar() {
    if (!admin) return;
    await admin.from('ordenes').delete().like('codigo_seguimiento', 'HU46NT%'); // notificaciones caen en cascada
    await admin.from('clientes').delete().in('telefono', Object.values(TEL));
  }

  async function crearOrden(vehiculoId, codigo) {
    return (await admin.from('ordenes').insert({
      establecimiento_id: EST_A, vehiculo_id: vehiculoId, estado: 'recibido',
      subtotal: 30000, descuento: 0, total: 30000, codigo_seguimiento: codigo,
    }).select().single().throwOnError()).data;
  }

  async function avisos(ordenId) {
    return (await admin.from('notificaciones').select('*').eq('orden_id', ordenId).order('created_at').throwOnError()).data;
  }

  beforeAll(async () => {
    request = (await import('supertest')).default;
    app = (await import('../../src/app.js')).default;
    admin = (await import('../../src/config/supabase.js')).supabase;
    ({ notificarOrden } = await import('../../src/shared/notificaciones.js'));
    ({ descifrar } = await import('../../src/shared/cifrado.js'));
    const { cifrar } = await import('../../src/shared/cifrado.js');
    const { crearAccesoTenant } = await import('../../src/shared/tenant.js');
    tenant = crearAccesoTenant(admin, { establecimientoId: EST_A });

    const { createClient } = await import('@supabase/supabase-js');
    const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await anon.auth.signInWithPassword({ email: process.env.SPIKE_A_EMAIL, password: process.env.SPIKE_PASSWORD });
    if (error) throw error;
    tokenA = data.session.access_token;

    await limpiar();
    const cliente = async (telefono, correo) => (await admin.from('clientes').insert({
      establecimiento_id: EST_A, nombre: '[Prueba HU-46] Ana Gómez', telefono, correo, autorizacion_datos: true,
    }).select().single().throwOnError()).data;
    const conCorreo = await cliente(TEL.conCorreo, cifrar(CORREO));
    const sinCorreo = await cliente(TEL.sinCorreo, null);
    const nuevoVehiculo = async (cliente_id, placa) =>
      (await admin.from('vehiculos').insert({ establecimiento_id: EST_A, cliente_id, placa, tipo: 'carro' }).select().single().throwOnError()).data;
    vehiculo = await nuevoVehiculo(conCorreo.id, PLACA.conCorreo);
    // La base permite una sola orden activa por vehículo: cada prueba usa el suyo.
    vehiculoApi = await nuevoVehiculo(conCorreo.id, PLACA.api);
    vehiculoSinCorreo = await nuevoVehiculo(sinCorreo.id, PLACA.sinCorreo);
  });

  afterAll(limpiar);

  it('CA1: envía el aviso de ingreso al correo del cliente y lo registra con el destino cifrado', async () => {
    const orden = await crearOrden(vehiculo.id, CODIGO.directo);
    const enviados = [];
    const r = await notificarOrden(tenant, orden.id, 'ingreso', { enviar: async (m) => { enviados.push(m); return { enviado: true }; } });

    expect(r.estado).toBe('enviada');
    expect(enviados).toHaveLength(1);
    expect(enviados[0].para).toBe(CORREO);
    expect(enviados[0].texto).toContain(PLACA.conCorreo);
    expect(enviados[0].texto).toContain(CODIGO.directo);

    const [aviso] = await avisos(orden.id);
    expect(aviso).toMatchObject({ establecimiento_id: EST_A, canal: 'correo', evento: 'orden.ingreso', estado: 'enviada', intentos: 1 });
    expect(aviso.destino).not.toBe(CORREO);
    expect(descifrar(aviso.destino)).toBe(CORREO);

    // El mismo aviso no se envía dos veces.
    const repetido = await notificarOrden(tenant, orden.id, 'ingreso', { enviar: async () => ({ enviado: true }) });
    expect(repetido.estado).toBe('omitida');
    expect(await avisos(orden.id)).toHaveLength(1);
  });

  it('CA2 y CA3: al pasar a "Listo" por la API responde 200 y deja el aviso registrado', async () => {
    const orden = await crearOrden(vehiculoApi.id, CODIGO.api);
    const patch = (estado) => request(app).patch(`/api/v1/ordenes/${orden.id}/estado`).use(con(tokenA)).send({ estado });

    expect((await patch('en_lavado')).status).toBe(200);
    const res = await patch('listo');
    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('listo');

    let aviso;
    for (let i = 0; i < 40 && !['enviada', 'fallida'].includes(aviso?.estado); i += 1) {
      await esperar(250);
      [aviso] = await avisos(orden.id);
    }
    expect(aviso).toMatchObject({ evento: 'orden.listo', canal: 'correo' });
    // Con SMTP configurado queda "enviada"; sin él, "fallida" con el motivo, y la orden siguió igual.
    expect(['enviada', 'fallida']).toContain(aviso.estado);
    if (aviso.estado === 'fallida') expect(aviso.error).toBeTruthy();
  });

  it('CA3: sin correo registrado no intenta enviar y lo deja como cancelado', async () => {
    const orden = await crearOrden(vehiculoSinCorreo.id, CODIGO.sinCorreo);
    const r = await notificarOrden(tenant, orden.id, 'listo', { enviar: async () => { throw new Error('no debería enviarse'); } });
    expect(r.estado).toBe('cancelada');
    const [aviso] = await avisos(orden.id);
    expect(aviso).toMatchObject({ estado: 'cancelada', error: 'El cliente no tiene correo registrado' });
  });

  it('HU-09: /ordenes/activas devuelve las órdenes no entregadas del establecimiento', async () => {
    const res = await request(app).get('/api/v1/ordenes/activas').use(con(tokenA));
    expect(res.status).toBe(200);
    const codigos = res.body.map((o) => o.codigoSeguimiento);
    expect(codigos).toEqual(expect.arrayContaining([CODIGO.directo, CODIGO.api, CODIGO.sinCorreo]));
    expect(res.body.every((o) => o.estado !== 'entregado')).toBe(true);
  });
});
