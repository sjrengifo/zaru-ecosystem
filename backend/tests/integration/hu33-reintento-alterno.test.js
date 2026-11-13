// HU-33 (ZARU-22): reintento y canal alterno ante fallas de envío, contra la API y Supabase.
// Requiere backend/.env, backend/.env.spike.local y las migraciones hu34_hu23_hu24_historiales y
// hu33_reintento_canal_alterno. No envía mensajes reales: los proveedores se simulan.
//
// Las notificaciones de prueba quedan programadas para 2030: el worker de producción solo toma las
// vencidas, así que nunca las procesa mientras corre esta prueba.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHmac, randomBytes } from 'node:crypto';
import { hayEntornoIntegracion, faltantes } from '../helpers/entorno.js';

const EST_A = '00000000-0000-0000-0000-00000000a058';
const ADMIN_A = '00000000-0000-0000-0000-0000000a0058';
const TEL = '3003330001';
const CORREO = 'hu33.cliente@zaru.test';
const ORDENES = { todo: 'HU33AV0001', tarde: 'HU33AV0002', manual: 'HU33AV0003' };
const PLACAS = { todo: 'HUR331', tarde: 'HUR332', manual: 'HUR333' };
const FUTURO = new Date('2030-01-01T12:00:00Z');
const MIN = 60_000;

describe.skipIf(!hayEntornoIntegracion)(`HU-33 · reintento y canal alterno${hayEntornoIntegracion ? '' : ` (omitida: faltan ${faltantes.join(', ')})`}`, () => {
  let request, app, admin, tenant, enviarUnIntento, cifrar, cliente;
  const tokens = {};
  const ordenId = {};
  const secreto = `whsec_${randomBytes(24).toString('base64')}`;

  const con = (quien) => (r) => r.set('Authorization', `Bearer ${tokens[quien]}`);
  const falla = (canal) => ({ nombre: `prueba-${canal}`, enviar: async () => { throw new Error('503 Service Unavailable'); } });
  const leer = async (id) => (await admin.from('notificaciones').select('*').eq('id', id).single().throwOnError()).data;
  const cadena = async (orden) => (await admin.from('notificaciones').select('*').eq('orden_id', orden).order('created_at').throwOnError()).data;

  async function limpiar() {
    if (!admin) return;
    await admin.from('ordenes').delete().like('codigo_seguimiento', 'HU33AV%'); // notificaciones en cascada
    await admin.from('vehiculos').delete().eq('establecimiento_id', EST_A).in('placa', Object.values(PLACAS));
    await admin.from('clientes').delete().eq('establecimiento_id', EST_A).eq('telefono', TEL);
  }

  /** Aviso "listo" por correo, pendiente, como lo deja prepararCorreo. */
  async function avisoListo(clave) {
    const { data } = await admin.from('notificaciones').insert({
      establecimiento_id: EST_A,
      cliente_id: cliente.id,
      orden_id: ordenId[clave],
      tipo: 'operativa',
      evento: 'orden.lista',
      canal: 'correo',
      destino: cifrar(CORREO),
      contenido: { asunto: 'Tu vehículo está listo' },
      estado: 'pendiente',
      programada_para: FUTURO.toISOString(),
      clave_dedupe: `${ordenId[clave]}:orden.lista:correo`,
    }).select().single().throwOnError();
    return data;
  }

  /** Repite intentos fallidos hasta agotar la fila (4 intentos) y devuelve los tiempos programados. */
  async function agotar(id, opciones) {
    const esperas = [];
    let ahora = FUTURO;
    for (let i = 0; i < 4; i += 1) {
      const fila = await leer(id);
      await enviarUnIntento(tenant, fila, { ...opciones, ahora });
      const despues = await leer(id);
      if (despues.proximo_intento_at) esperas.push(new Date(despues.proximo_intento_at) - ahora);
      ahora = new Date(ahora.getTime() + 10 * MIN);
    }
    return { esperas, fila: await leer(id) };
  }

  function firmar(cuerpo) {
    const id = `msg_${randomBytes(8).toString('hex')}`;
    const timestamp = String(Math.floor(Date.now() / 1000));
    const clave = Buffer.from(secreto.replace(/^whsec_/, ''), 'base64');
    const firma = createHmac('sha256', clave).update(`${id}.${timestamp}.${cuerpo}`).digest('base64');
    return { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': `v1,${firma}`, 'Content-Type': 'application/json' };
  }

  const webhookResend = (notificacionId) => {
    const cuerpo = JSON.stringify({ type: 'email.delivered', data: { email_id: `re_${notificacionId.slice(0, 8)}`, tags: { notificacion: notificacionId } } });
    return request(app).post('/api/v1/webhooks/resend').set(firmar(cuerpo)).send(cuerpo);
  };

  beforeAll(async () => {
    process.env.RESEND_WEBHOOK_SECRET = secreto;
    process.env.SMS_PROVEEDOR = 'consola';
    request = (await import('supertest')).default;
    app = (await import('../../src/app.js')).default;
    admin = (await import('../../src/config/supabase.js')).supabase;
    ({ enviarUnIntento } = await import('../../src/shared/notificaciones.js'));
    ({ cifrar } = await import('../../src/shared/cifrado.js'));
    const { crearAccesoTenant } = await import('../../src/shared/tenant.js');
    tenant = crearAccesoTenant(admin, { establecimientoId: EST_A });

    const { createClient } = await import('@supabase/supabase-js');
    for (const [quien, email] of [['A', process.env.SPIKE_A_EMAIL], ['B', process.env.SPIKE_B_EMAIL]]) {
      const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
      const { data, error } = await anon.auth.signInWithPassword({ email, password: process.env.SPIKE_PASSWORD });
      if (error) throw error;
      tokens[quien] = data.session.access_token;
    }

    await limpiar();
    cliente = (await admin.from('clientes').insert({
      establecimiento_id: EST_A, nombre: '[Prueba HU-33] Laura Gómez', telefono: TEL, correo: cifrar(CORREO), autorizacion_datos: true,
    }).select().single().throwOnError()).data;
    // HU-30: el cliente autorizó los avisos del servicio.
    await admin.from('consentimientos').insert({
      establecimiento_id: EST_A, cliente_id: cliente.id, tipo: 'notificaciones_servicio', otorgado: true, canal: 'panel', politica_version: '1.1',
    }).throwOnError();
    for (const clave of Object.keys(ORDENES)) {
      const vehiculo = (await admin.from('vehiculos').insert({
        establecimiento_id: EST_A, cliente_id: cliente.id, placa: PLACAS[clave], tipo: 'carro',
      }).select().single().throwOnError()).data;
      ordenId[clave] = (await admin.from('ordenes').insert({
        establecimiento_id: EST_A, vehiculo_id: vehiculo.id, estado: 'listo', subtotal: 35000, descuento: 0, total: 35000, codigo_seguimiento: ORDENES[clave],
      }).select().single().throwOnError()).data.id;
    }
  });

  afterAll(async () => {
    await limpiar();
    delete process.env.RESEND_WEBHOOK_SECRET;
  });

  describe('CA1, CA2 y CA3: correo, luego SMS y luego alerta', () => {
    let original;

    it('CA1: el correo se reintenta 3 veces a 1, 2 y 4 minutos y queda en la bitácora de intentos', async () => {
      original = await avisoListo('todo');
      const { esperas, fila } = await agotar(original.id, { proveedor: falla('correo') });
      expect(fila).toMatchObject({ estado: 'fallida', intentos: 4 });
      // Esperas exactas con hasta 10 % de variación para que varios reintentos no salgan juntos.
      [1, 2, 4].forEach((minutos, i) => {
        expect(esperas[i]).toBeGreaterThanOrEqual(minutos * MIN);
        expect(esperas[i]).toBeLessThanOrEqual(minutos * MIN * 1.1);
      });
      const { data: intentos } = await admin.from('notificacion_intentos').select('intento, resultado, recuperable').eq('notificacion_id', original.id).order('intento');
      expect(intentos.map((i) => i.intento)).toEqual([1, 2, 3, 4]);
      expect(intentos.every((i) => i.resultado === 'fallido' && i.recuperable)).toBe(true);
    });

    it('CA2: al agotar el correo se crea el aviso por SMS al celular del cliente, enlazado al original', async () => {
      const [, sms] = await cadena(ordenId.todo);
      expect(sms).toMatchObject({
        canal: 'sms',
        estado: 'pendiente',
        evento: 'orden.lista',
        notificacion_origen_id: original.id,
        clave_dedupe: `${ordenId.todo}:orden.lista:sms`,
      });
      expect(sms.contenido.texto).toContain(PLACAS.todo);
      expect(sms.destino).not.toContain(TEL); // cifrado (HU-50)
    });

    it('CA3: si el SMS también falla, queda el fallo definitivo y la alerta con placa y celular', async () => {
      const [, sms] = await cadena(ordenId.todo);
      const { fila } = await agotar(sms.id, { proveedorSms: falla('sms') });
      expect(fila.estado).toBe('fallida');
      expect(fila.fallo_definitivo_at).toBeTruthy();
      expect(await cadena(ordenId.todo)).toHaveLength(2); // no hay un tercer canal

      const res = await request(app).get('/api/v1/notificaciones/fallidas').use(con('A'));
      expect(res.status).toBe(200);
      expect(res.body.alertas).toContainEqual(expect.objectContaining({
        id: sms.id,
        placa: PLACAS.todo,
        celular: TEL,
        cliente: '[Prueba HU-33] Laura Gómez',
        canales: ['correo', 'sms'],
        motivo: '503 Service Unavailable',
      }));
    });

    it('CA3: otra sede no ve ni atiende la alerta (HU-41)', async () => {
      const [, sms] = await cadena(ordenId.todo);
      const res = await request(app).get('/api/v1/notificaciones/fallidas').use(con('B'));
      expect(res.status).toBe(200);
      expect(res.body.alertas.map((a) => a.id)).not.toContain(sms.id);
      expect((await request(app).patch(`/api/v1/notificaciones/fallidas/${sms.id}/atendida`).use(con('B'))).status).toBe(404);
    });

    it('CA4: si el proveedor confirma después que el correo sí llegó, la alerta se cierra sola', async () => {
      const res = await webhookResend(original.id);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ recibido: true, resultado: 'confirmada' });
      expect((await leer(original.id))).toMatchObject({ estado: 'entregada', contenido: expect.objectContaining({ entregaConfirmada: true }) });

      const [, sms] = await cadena(ordenId.todo);
      expect(sms.alerta_atendida_at).toBeTruthy();
      const alertas = (await request(app).get('/api/v1/notificaciones/fallidas').use(con('A'))).body.alertas;
      expect(alertas.map((a) => a.id)).not.toContain(sms.id);

      // Repetir el aviso del proveedor no cambia nada.
      expect((await webhookResend(original.id)).body.resultado).toBe('ya_confirmada');
    });
  });

  describe('CA4: entrega tardía con el SMS alterno todavía pendiente', () => {
    it('la confirmación cancela el SMS pendiente y el worker ya no lo envía', async () => {
      const original = await avisoListo('tarde');
      await agotar(original.id, { proveedor: falla('correo') });
      const [, sms] = await cadena(ordenId.tarde);
      expect(sms.estado).toBe('pendiente');

      const res = await webhookResend(original.id);
      expect(res.body).toMatchObject({ resultado: 'confirmada', cancelados: 1 });
      const despues = await leer(sms.id);
      expect(despues).toMatchObject({ estado: 'cancelada', error: 'El aviso original se entregó' });

      let enviados = 0;
      const resultado = await enviarUnIntento(tenant, despues, { proveedorSms: { nombre: 'x', enviar: async () => { enviados += 1; return {}; } }, ahora: FUTURO });
      expect(resultado.omitida).toBe(true);
      expect(enviados).toBe(0);
    });

    it('rechaza un aviso sin la firma del proveedor', async () => {
      const cuerpo = JSON.stringify({ type: 'email.delivered', data: { tags: { notificacion: '00000000-0000-4000-8000-000000000000' } } });
      const res = await request(app).post('/api/v1/webhooks/resend').set({ ...firmar(cuerpo), 'svix-signature': 'v1,falsa' }).send(cuerpo);
      expect(res.status).toBe(401);
    });

    it('un evento firmado de una notificación que no existe se recibe sin cambiar nada', async () => {
      const res = await webhookResend('00000000-0000-4000-8000-000000000000');
      expect(res.status).toBe(200);
      expect(res.body.resultado).toBe('desconocida');
    });
  });

  describe('CA3: el administrador marca que ya contactó al cliente', () => {
    it('la alerta desaparece y queda quién la atendió', async () => {
      const aviso = await avisoListo('manual');
      await admin.from('notificaciones').update({ estado: 'fallida', intentos: 4, fallo_definitivo_at: new Date().toISOString() }).eq('id', aviso.id).throwOnError();

      const res = await request(app).patch(`/api/v1/notificaciones/fallidas/${aviso.id}/atendida`).use(con('A'));
      expect(res.status).toBe(200);
      expect(res.body.atendidaAt).toBeTruthy();
      expect(await leer(aviso.id)).toMatchObject({ alerta_atendida_por: ADMIN_A });
      const alertas = (await request(app).get('/api/v1/notificaciones/fallidas').use(con('A'))).body.alertas;
      expect(alertas.map((a) => a.id)).not.toContain(aviso.id);
    });
  });
});
