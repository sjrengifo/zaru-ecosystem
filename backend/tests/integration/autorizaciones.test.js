// HU-30 (ZARU-19): autorización y revocación del tratamiento de datos para notificaciones,
// contra la API y Supabase. Requiere backend/.env, backend/.env.spike.local y la migración
// hu30_autorizacion_notificaciones. No envía correos reales.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hayEntornoIntegracion, faltantes } from '../helpers/entorno.js';

const EST_A = '00000000-0000-0000-0000-00000000a058';
const ADMIN_A = '00000000-0000-0000-0000-0000000a0058';
const TEL = { ana: '3003030001', luis: '3003030002', ingreso: '3003030003', sofia: '3003030004' };
const PLACA = { ingreso: 'HUT301', aviso: 'HUT302' };
const CODIGO = { aviso: 'HU30AV0001' };

describe.skipIf(!hayEntornoIntegracion)(`HU-30 · autorizaciones de comunicaciones${hayEntornoIntegracion ? '' : ` (omitida: faltan ${faltantes.join(', ')})`}`, () => {
  let request, app, admin, tenant, politica, limiteEnlaces, crearTokenBaja, destinatariosComerciales, notificarOrden;
  const tokens = {};
  const ids = {};

  const con = (quien) => (r) => r.set('Authorization', `Bearer ${tokens[quien]}`);
  const evidencia = async (clienteId, tipo) =>
    (await admin.from('consentimientos').select('*').eq('cliente_id', clienteId).eq('tipo', tipo).order('created_at').order('id').throwOnError()).data;

  async function limpiar() {
    if (!admin) return;
    await admin.from('ordenes').delete().like('codigo_seguimiento', 'HU30%');
    // La orden del ingreso por la API tiene un código aleatorio: se borra por el vehículo.
    const { data: vehiculos } = await admin.from('vehiculos').select('id').eq('establecimiento_id', EST_A).in('placa', Object.values(PLACA));
    if (vehiculos?.length) await admin.from('ordenes').delete().in('vehiculo_id', vehiculos.map((v) => v.id));
    await admin.from('vehiculos').delete().eq('establecimiento_id', EST_A).in('placa', Object.values(PLACA));
    await admin.from('clientes').delete().in('telefono', Object.values(TEL)); // la evidencia cae en cascada
    await admin.from('servicios').delete().like('nombre', '[Prueba HU-30]%');
  }

  beforeAll(async () => {
    request = (await import('supertest')).default;
    app = (await import('../../src/app.js')).default;
    admin = (await import('../../src/config/supabase.js')).supabase;
    ({ limiteEnlaces } = await import('../../src/controllers/baja.controller.js'));
    ({ crearTokenBaja, destinatariosComerciales } = await import('../../src/shared/autorizaciones.js'));
    ({ notificarOrden } = await import('../../src/shared/notificaciones.js'));
    const { crearAccesoTenant } = await import('../../src/shared/tenant.js');
    tenant = crearAccesoTenant(admin, { establecimientoId: EST_A });

    const { createClient } = await import('@supabase/supabase-js');
    for (const [quien, email] of [['A', process.env.SPIKE_A_EMAIL], ['B', process.env.SPIKE_B_EMAIL]]) {
      const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
      const { data, error } = await anon.auth.signInWithPassword({ email, password: process.env.SPIKE_PASSWORD });
      if (error) throw error;
      tokens[quien] = data.session.access_token;
    }
    politica = (await request(app).get('/api/v1/politicas-datos/vigente')).body.version;
    await limpiar();
    limiteEnlaces.reiniciar();
  });

  afterAll(async () => {
    await limpiar();
    limiteEnlaces?.reiniciar();
  });

  const registrar = (telefono, extra) =>
    request(app).post('/api/v1/clientes').use(con('A')).send({
      nombre: '[Prueba HU-30] Titular', telefono, correo: `hu30.${telefono}@zaru.test`, autorizacionDatos: true, politicaVersion: politica, ...extra,
    });

  describe('CA1: dos autorizaciones separadas, desmarcadas por defecto', () => {
    it('sin marcar las casillas, ninguna queda autorizada', async () => {
      const res = await registrar(TEL.ana);
      expect(res.status).toBe(201);
      ids.ana = res.body.id;
      const [servicio] = await evidencia(ids.ana, 'notificaciones_servicio');
      const [comerciales] = await evidencia(ids.ana, 'comerciales');
      expect(servicio).toMatchObject({ establecimiento_id: EST_A, otorgado: false, canal: 'panel', politica_version: politica, registrado_por: ADMIN_A });
      expect(comerciales).toMatchObject({ otorgado: false, canal: 'panel', politica_version: politica });
    });

    it('cada casilla se guarda por separado', async () => {
      const res = await registrar(TEL.luis, { autorizaNotificaciones: true, autorizaComerciales: false });
      expect(res.status).toBe(201);
      ids.luis = res.body.id;
      expect((await evidencia(ids.luis, 'notificaciones_servicio'))[0].otorgado).toBe(true);
      expect((await evidencia(ids.luis, 'comerciales'))[0].otorgado).toBe(false);

      const perfil = await request(app).get(`/api/v1/clientes/${ids.luis}`).use(con('A'));
      expect(perfil.status).toBe(200);
      expect(perfil.body.autorizaciones).toMatchObject({
        tratamientoDatos: { otorgado: true, canal: 'panel', politicaVersion: politica },
        notificacionesServicio: { otorgado: true, canal: 'panel', politicaVersion: politica },
        comerciales: { otorgado: false, canal: 'panel', politicaVersion: politica },
      });
    });

    it('el registro de un ingreso con cliente nuevo también las guarda', async () => {
      const { data: servicio } = await admin.from('servicios').insert({ establecimiento_id: EST_A, nombre: '[Prueba HU-30] Lavado', precio: 20000, duracion_min: 30 }).select().single().throwOnError();
      const res = await request(app).post('/api/v1/ordenes').use(con('A')).send({
        servicioIds: [servicio.id],
        nuevoVehiculo: {
          cliente: {
            nombre: '[Prueba HU-30] Ingreso', telefono: TEL.ingreso, correo: 'hu30.ingreso@zaru.test',
            autorizacionDatos: true, politicaVersion: politica, autorizaNotificaciones: true, autorizaComerciales: true,
          },
          vehiculo: { placa: PLACA.ingreso, tipo: 'carro' },
        },
      });
      expect(res.status).toBe(201);
      const { data: cliente } = await admin.from('clientes').select('id').eq('telefono', TEL.ingreso).eq('establecimiento_id', EST_A).single().throwOnError();
      ids.ingreso = cliente.id;
      expect((await evidencia(ids.ingreso, 'notificaciones_servicio'))[0]).toMatchObject({ otorgado: true, politica_version: politica });
      expect((await evidencia(ids.ingreso, 'comerciales'))[0]).toMatchObject({ otorgado: true, politica_version: politica });
    });
  });

  describe('CA2: las campañas de promociones excluyen a quien no autorizó', () => {
    it('solo queda el cliente con autorización comercial vigente', async () => {
      expect(await destinatariosComerciales(tenant, [ids.ana, ids.luis, ids.ingreso])).toEqual([ids.ingreso]);
    });
  });

  describe('cambio desde el panel', () => {
    it('otorgar o retirar agrega una fila nueva y no modifica la anterior', async () => {
      const res = await request(app).put(`/api/v1/clientes/${ids.ana}/autorizaciones`).use(con('A')).send({ tipo: 'comerciales', otorgado: true });
      expect(res.status).toBe(200);
      expect(res.body.cambio).toBe(true);
      expect(res.body.autorizaciones.comerciales).toMatchObject({ otorgado: true, canal: 'panel', politicaVersion: politica });

      const filas = await evidencia(ids.ana, 'comerciales');
      expect(filas.map((f) => f.otorgado)).toEqual([false, true]);
      expect(filas[1].registrado_por).toBe(ADMIN_A);
      expect(await destinatariosComerciales(tenant, [ids.ana])).toEqual([ids.ana]);
    });

    it('repetir el mismo valor no duplica la evidencia', async () => {
      const res = await request(app).put(`/api/v1/clientes/${ids.ana}/autorizaciones`).use(con('A')).send({ tipo: 'comerciales', otorgado: true });
      expect(res.body.cambio).toBe(false);
      expect(await evidencia(ids.ana, 'comerciales')).toHaveLength(2);
    });

    it('no se puede revocar el tratamiento de datos por esta vía', async () => {
      const res = await request(app).put(`/api/v1/clientes/${ids.ana}/autorizaciones`).use(con('A')).send({ tipo: 'tratamiento_datos', otorgado: false });
      expect(res.status).toBe(400);
    });

    it('otro establecimiento no ve ni cambia las autorizaciones del cliente (HU-41)', async () => {
      const res = await request(app).put(`/api/v1/clientes/${ids.ana}/autorizaciones`).use(con('B')).send({ tipo: 'comerciales', otorgado: false });
      expect(res.status).toBe(404);
      expect((await request(app).get(`/api/v1/clientes/${ids.ana}/consentimientos`).use(con('B'))).status).toBe(404);
    });
  });

  describe('CA3: enlace "dejar de recibir"', () => {
    let token;
    beforeAll(() => {
      token = crearTokenBaja({ establecimientoId: EST_A, clienteId: ids.ana, tipo: 'comerciales' });
    });

    it('abrir el enlace muestra qué se revoca, sin datos personales, y no revoca nada', async () => {
      const res = await request(app).get(`/api/v1/publico/baja/${token}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ tipo: 'comerciales', nombreTipo: 'Promociones y ofertas', autorizado: true, sede: { nombre: expect.any(String) } });
      expect(JSON.stringify(res.body)).not.toMatch(/Titular|3003030001|zaru\.test/);
      expect(await evidencia(ids.ana, 'comerciales')).toHaveLength(2);
    });

    it('confirmar revoca de inmediato y responde con la hora registrada', async () => {
      const antes = Date.now();
      const res = await request(app).post(`/api/v1/publico/baja/${token}`).set('X-Forwarded-For', '203.0.113.30');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ autorizado: false, revocadaAt: expect.any(String) });
      expect(new Date(res.body.revocadaAt).getTime()).toBeGreaterThanOrEqual(antes - 5000);

      const ultima = (await evidencia(ids.ana, 'comerciales')).at(-1);
      expect(ultima).toMatchObject({ otorgado: false, canal: 'enlace_baja', politica_version: politica, registrado_por: null });
      expect(ultima.ip).toBeTruthy();
      expect(await destinatariosComerciales(tenant, [ids.ana])).toEqual([]);
    });

    it('volver a abrir el enlace indica que ya no está autorizado', async () => {
      const res = await request(app).get(`/api/v1/publico/baja/${token}`);
      expect(res.body.autorizado).toBe(false);
    });

    it('un enlace alterado no sirve', async () => {
      const [carga, firma] = token.split('.');
      const res = await request(app).get(`/api/v1/publico/baja/${carga}.${firma.slice(0, -2)}xx`).set('X-Forwarded-For', '203.0.113.31');
      expect(res.status).toBe(404);
      expect(res.body.error.mensaje).toBe('Este enlace no es válido o ya no está disponible');
    });
  });

  describe('CA4 y HU-46: evidencia consultable y avisos que respetan la decisión', () => {
    it('el administrador consulta fecha, hora, canal y versión de cada cambio', async () => {
      const res = await request(app).get(`/api/v1/clientes/${ids.ana}/consentimientos`).use(con('A'));
      expect(res.status).toBe(200);
      const comerciales = res.body.filter((f) => f.tipo === 'comerciales');
      expect(comerciales).toHaveLength(3);
      expect(comerciales[0]).toMatchObject({ otorgado: false, canal: 'enlace_baja', politicaVersion: politica, fecha: expect.any(String) });
      expect(comerciales.map((f) => f.canal)).toEqual(['enlace_baja', 'panel', 'panel']);
    });

    it('la evidencia es de solo inserción', async () => {
      const { error: errUpdate } = await admin.from('consentimientos').update({ otorgado: true }).eq('cliente_id', ids.ana).eq('tipo', 'comerciales');
      expect(errUpdate).toBeTruthy();
    });

    it('sin autorización de avisos no se envía el correo, y con ella sí y con el enlace de baja', async () => {
      const { data: v } = await admin.from('vehiculos').insert({ establecimiento_id: EST_A, cliente_id: ids.ana, placa: PLACA.aviso, tipo: 'carro' }).select().single().throwOnError();
      const { data: orden } = await admin.from('ordenes').insert({
        establecimiento_id: EST_A, vehiculo_id: v.id, estado: 'recibido', subtotal: 1000, descuento: 0, total: 1000, codigo_seguimiento: CODIGO.aviso,
      }).select().single().throwOnError();
      const enviados = [];
      const enviar = async (m) => { enviados.push(m); return { enviado: true }; };

      const omitido = await notificarOrden(tenant, orden.id, 'ingreso', { enviar });
      expect(omitido).toMatchObject({ estado: 'cancelada', motivo: 'revocado' });
      expect(enviados).toHaveLength(0);

      await request(app).put(`/api/v1/clientes/${ids.ana}/autorizaciones`).use(con('A')).send({ tipo: 'notificaciones_servicio', otorgado: true }).expect(200);
      await admin.from('notificaciones').delete().eq('orden_id', orden.id);
      const enviado = await notificarOrden(tenant, orden.id, 'ingreso', { enviar });
      expect(enviado.estado).toBe('enviada');
      expect(enviados[0].texto).toMatch(/\/baja\/[\w-]+\.[\w-]+/);
    });
  });
});
