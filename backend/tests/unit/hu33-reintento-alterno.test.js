// HU-33 — Reintento y canal alterno ante fallas de envío.
// Proveedores simulados y un req.tenant falso: nunca toca Supabase ni un proveedor real.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { crearTenantFalso, ejecutar } from '../helpers/tenantFalso.js';

process.env.ZARU_CLAVE_CIFRADO ||= Buffer.alloc(32, 7).toString('base64');
process.env.SMS_PROVEEDOR = 'consola';
delete process.env.NOTIFICACIONES_ESPERAS_MS;

vi.mock('../../src/config/supabase.js', () => ({ supabase: {} }));

const { enviarUnIntento, crearAlterno, MAX_INTENTOS, MAX_REINTENTOS, ORDEN_CANALES } = await import('../../src/shared/notificaciones.js');
const { cifrar, descifrar } = await import('../../src/shared/cifrado.js');
const { crearProveedorCorreo } = await import('../../src/shared/correo.js');
const { proveedorPush } = await import('../../src/shared/proveedorPush.js');
const { urlConfirmacionTwilio } = await import('../../src/shared/proveedorSms.js');
const { firmaResendValida, firmaTwilioValida, notificacionDeEventoResend } = await import('../../src/shared/confirmacionEntrega.js');
const ctrl = await import('../../src/controllers/notificaciones.controller.js');
const webhooks = await import('../../src/controllers/webhooks.controller.js');

const ORDEN_ID = '11111111-0000-4000-8000-000000000001';
const CLIENTE_ID = '22222222-0000-4000-8000-000000000002';
const FILA_ID = '33333333-0000-4000-8000-000000000003';
const MIN = 60_000;

function orden({ correo = 'luis@correo.com', telefono = '3001234567' } = {}) {
  return {
    id: ORDEN_ID,
    estado: 'listo',
    subtotal: 30000,
    descuento: 0,
    total: 30000,
    created_at: '2026-11-12T15:00:00Z',
    codigo_seguimiento: 'ABC12345',
    vehiculos: {
      placa: 'XYZ987',
      clientes: { id: CLIENTE_ID, nombre: 'Luis Pérez', correo: correo ? cifrar(correo) : null, telefono },
    },
    orden_servicios: [{ precio: 30000, servicios: { nombre: 'Lavado premium' } }],
  };
}

function fila(extra = {}) {
  return {
    id: FILA_ID,
    establecimiento_id: 'eeeeeeee-0000-4000-8000-000000000001',
    orden_id: ORDEN_ID,
    evento: 'orden.lista',
    canal: 'correo',
    estado: 'pendiente',
    intentos: 0,
    destino: cifrar('luis@correo.com'),
    contenido: { asunto: 'Tu vehículo está listo' },
    notificacion_origen_id: null,
    ...extra,
  };
}

const AUTORIZADO = { data: [{ tipo: 'notificaciones_servicio', otorgado: true, canal: 'panel', created_at: '2026-11-01T10:00:00Z' }], error: null };

/** Tenant con las respuestas en el orden en que el envío las pide. */
function tenantCon({ ordenes = [], notificaciones = [], autorizado = true, cliente } = {}) {
  const tenant = crearTenantFalso({
    ordenes: ordenes.length ? ordenes : [{ data: orden(cliente), error: null }, { data: orden(cliente), error: null }],
    establecimientos: [{ data: { nombre: 'Lavadero Norte' }, error: null }, { data: { nombre: 'Lavadero Norte' }, error: null }],
    autorizaciones_vigentes: [autorizado ? AUTORIZADO : { data: [{ tipo: 'notificaciones_servicio', otorgado: false, canal: 'enlace_baja', created_at: '2026-11-05T10:00:00Z' }], error: null }],
    notificaciones: notificaciones.length ? notificaciones : [{ data: [], error: null }],
  });
  tenant.crear.mockImplementation(async (tabla) => ({ id: tabla === 'notificaciones' ? 'alterno-1' : 'intento-1' }));
  return tenant;
}

const fallaRecuperable = () => ({ nombre: 'prueba', enviar: vi.fn().mockRejectedValue(new Error('503 Service Unavailable')) });
const creadas = (tenant) => tenant.crear.mock.calls.filter(([tabla]) => tabla === 'notificaciones').map(([, valores]) => valores);
const ultimaActualizacion = (tenant) => tenant.actualizar.mock.calls.at(-1)?.[2] ?? {};

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(Math, 'random').mockReturnValue(0); // sin jitter: esperas exactas
});

describe('CA1: hasta 3 reintentos con intervalos de 1, 2 y 4 minutos', () => {
  it('son el intento inicial más 3 reintentos', () => {
    expect(MAX_REINTENTOS).toBe(3);
    expect(MAX_INTENTOS).toBe(4);
  });

  it.each([
    [0, 1 * MIN],
    [1, 2 * MIN],
    [2, 4 * MIN],
  ])('tras el intento %i + 1 fallido, el siguiente queda a %i ms', async (previos, espera) => {
    const ahora = new Date('2026-11-12T20:00:00Z');
    const tenant = tenantCon();
    const resultado = await enviarUnIntento(tenant, fila({ canal: 'push', destino: cifrar('{"endpoint":"https://push.example/1"}'), intentos: previos }), {
      proveedorPush: fallaRecuperable(),
      ahora,
    });
    expect(resultado).toMatchObject({ estado: 'pendiente', intentos: previos + 1 });
    expect(ultimaActualizacion(tenant)).toMatchObject({
      estado: 'pendiente',
      proximo_intento_at: new Date(ahora.getTime() + espera).toISOString(),
    });
  });

  it('el cuarto intento fallido ya no se reintenta', async () => {
    const tenant = tenantCon();
    const resultado = await enviarUnIntento(tenant, fila({ evento: 'orden.recibida', intentos: 3 }), { proveedor: fallaRecuperable() });
    expect(resultado).toMatchObject({ estado: 'fallida', intentos: 4 });
  });

  it('el proveedor recibe una referencia estable entre reintentos', async () => {
    const proveedor = { nombre: 'prueba', enviar: vi.fn().mockResolvedValue({ idProveedor: 'p-1' }) };
    await enviarUnIntento(tenantCon(), fila({ intentos: 2 }), { proveedor });
    expect(proveedor.enviar).toHaveBeenCalledWith(expect.objectContaining({ referencia: FILA_ID, para: 'luis@correo.com' }));
  });

  it('un canal push sin proveedor (HU-40 pendiente) no se reintenta y pasa al alterno', async () => {
    const tenant = tenantCon();
    const resultado = await enviarUnIntento(tenant, fila({ canal: 'push', destino: cifrar('{"endpoint":"x"}') }), {
      proveedorPush: proveedorPush({}),
    });
    expect(resultado).toMatchObject({ estado: 'fallida', intentos: 1 });
    expect(creadas(tenant)).toHaveLength(1);
    expect(creadas(tenant)[0]).toMatchObject({ canal: 'sms' });
  });
});

describe('CA2: canal alterno al agotar los reintentos de "listo"', () => {
  it('ESC-F6-09: push agota sus reintentos y el aviso sale por SMS, enlazado al original', async () => {
    const ahora = new Date('2026-11-12T20:07:00Z');
    const tenant = tenantCon({ notificaciones: [{ data: [{ id: FILA_ID, canal: 'push', estado: 'fallida' }], error: null }] });
    await enviarUnIntento(tenant, fila({ canal: 'push', destino: cifrar('{"endpoint":"x"}'), intentos: 3 }), {
      proveedorPush: fallaRecuperable(),
      ahora,
    });
    const [alterno] = creadas(tenant);
    expect(alterno).toMatchObject({
      canal: 'sms',
      evento: 'orden.lista',
      estado: 'pendiente',
      clave_dedupe: `${ORDEN_ID}:orden.lista:sms`,
      notificacion_origen_id: FILA_ID,
      programada_para: ahora.toISOString(),
      contenido: { alterno: true },
    });
    expect(descifrar(alterno.destino)).toBe('3001234567');
    expect(alterno.contenido.texto).toContain('XYZ987');
  });

  it('el orden de los canales alternos es push, SMS y correo', () => {
    expect(ORDEN_CANALES).toEqual(['push', 'sms', 'correo']);
  });

  it('si el SMS alterno también falla, prueba el correo cuando el original no fue por correo', async () => {
    const tenant = tenantCon({
      notificaciones: [{ data: [{ id: 'orig', canal: 'push', estado: 'fallida' }, { id: FILA_ID, canal: 'sms', estado: 'fallida' }], error: null }],
    });
    const resultado = await crearAlterno(tenant, fila({ canal: 'sms', notificacion_origen_id: 'orig' }));
    expect(resultado).toEqual({ id: 'alterno-1', canal: 'correo' });
    expect(creadas(tenant)[0]).toMatchObject({ canal: 'correo', notificacion_origen_id: 'orig', clave_dedupe: `${ORDEN_ID}:orden.lista:correo` });
    expect(descifrar(creadas(tenant)[0].destino)).toBe('luis@correo.com');
  });

  it('solo usa canales autorizados: si el cliente revocó los avisos (HU-30) no hay alterno', async () => {
    const tenant = tenantCon({ autorizado: false });
    expect(await crearAlterno(tenant, fila())).toEqual({ sinAlterno: 'revocado' });
    expect(creadas(tenant)).toHaveLength(0);
  });

  it('un aviso que no es "listo" no usa canal alterno ni genera alerta', async () => {
    const tenant = tenantCon();
    await enviarUnIntento(tenant, fila({ evento: 'orden.recibida', intentos: 3 }), { proveedor: fallaRecuperable() });
    expect(creadas(tenant)).toHaveLength(0);
    expect(tenant.actualizar.mock.calls.some(([, , c]) => c.fallo_definitivo_at)).toBe(false);
  });
});

describe('CA3: fallo definitivo en todos los canales', () => {
  it('cuando ya no queda canal, la fila queda como fallo definitivo para la alerta', async () => {
    const ahora = new Date('2026-11-12T20:20:00Z');
    const cadena = { data: [{ id: 'orig', canal: 'correo', estado: 'fallida' }, { id: FILA_ID, canal: 'sms', estado: 'enviando' }], error: null };
    // La cadena se consulta antes de enviar el alterno (CA4) y otra vez al buscar el siguiente canal.
    const tenant = tenantCon({ notificaciones: [cadena, cadena] });
    const resultado = await enviarUnIntento(tenant, fila({ canal: 'sms', destino: cifrar('3001234567'), notificacion_origen_id: 'orig', intentos: 3 }), {
      proveedorSms: fallaRecuperable(),
      ahora,
    });
    expect(resultado.estado).toBe('fallida');
    expect(creadas(tenant)).toHaveLength(0);
    expect(tenant.actualizar).toHaveBeenCalledWith('notificaciones', FILA_ID, { fallo_definitivo_at: ahora.toISOString() }, 'id', 'Notificación');
  });

  it('un cliente solo con celular: si el SMS falla no hay más canales', async () => {
    const tenant = tenantCon({
      cliente: { correo: null },
      notificaciones: [{ data: [{ id: FILA_ID, canal: 'sms', estado: 'fallida' }], error: null }],
    });
    expect(await crearAlterno(tenant, fila({ canal: 'sms' }))).toEqual({ sinAlterno: 'sin_canales' });
  });

  it('GET /notificaciones/fallidas devuelve placa, celular completo y canales intentados', async () => {
    const tenant = crearTenantFalso({
      notificaciones: [
        {
          data: [{
            id: FILA_ID,
            orden_id: ORDEN_ID,
            canal: 'sms',
            error: '503 Service Unavailable',
            fallo_definitivo_at: '2026-11-12T20:20:00Z',
            cliente: { nombre: 'Luis Pérez', telefono: '3001234567' },
            orden: { id: ORDEN_ID, codigo_seguimiento: 'ABC12345', total: 30000, vehiculo: { placa: 'XYZ987' } },
          }],
          error: null,
        },
        { data: [{ orden_id: ORDEN_ID, canal: 'correo' }, { orden_id: ORDEN_ID, canal: 'sms' }], error: null },
      ],
    });
    const { res, error } = await ejecutar(ctrl.fallidas, { tenant });
    expect(error).toBeUndefined();
    expect(res.body.alertas).toEqual([{
      id: FILA_ID,
      ordenId: ORDEN_ID,
      codigoSeguimiento: 'ABC12345',
      placa: 'XYZ987',
      cliente: 'Luis Pérez',
      celular: '3001234567',
      total: 30000,
      canales: ['correo', 'sms'],
      motivo: '503 Service Unavailable',
      falloAt: '2026-11-12T20:20:00Z',
    }]);
    // Solo las abiertas de la sede de la sesión.
    const filtros = tenant.consultas[0].filtros.map(([m, ...a]) => `${m}:${a.join(',')}`);
    expect(filtros).toEqual(expect.arrayContaining(['not:fallo_definitivo_at,is,', 'is:alerta_atendida_at,']));
  });

  it('PATCH atendida registra quién y cuándo; no es posible sobre algo que no es alerta', async () => {
    const tenant = crearTenantFalso();
    tenant.obtener.mockResolvedValueOnce({ id: FILA_ID, fallo_definitivo_at: '2026-11-12T20:20:00Z', alerta_atendida_at: null });
    const { res } = await ejecutar(ctrl.atenderFallida, { tenant, params: { id: FILA_ID }, ctx: { usuarioId: 'u-1' } });
    expect(res.body).toMatchObject({ id: FILA_ID, atendidaAt: expect.any(String) });
    expect(tenant.actualizar.mock.calls[0][2]).toMatchObject({ alerta_atendida_por: 'u-1', alerta_atendida_at: expect.any(String) });

    tenant.obtener.mockResolvedValueOnce({ id: FILA_ID, fallo_definitivo_at: null, alerta_atendida_at: null });
    const { error } = await ejecutar(ctrl.atenderFallida, { tenant, params: { id: FILA_ID }, ctx: {} });
    expect(error).toMatchObject({ status: 404 });
  });
});

describe('CA4: sin duplicados', () => {
  it('si el original ya llegó, no se crea el alterno ni se marca fallo definitivo', async () => {
    const tenant = tenantCon({ notificaciones: [{ data: [{ id: 'orig', canal: 'correo', estado: 'entregada' }], error: null }] });
    expect(await crearAlterno(tenant, fila({ canal: 'push', notificacion_origen_id: 'orig' }))).toEqual({ sinAlterno: 'entregada' });
    expect(creadas(tenant)).toHaveLength(0);
  });

  it('un alterno pendiente se cancela sin enviarse si el original se entregó tarde', async () => {
    const tenant = tenantCon({
      notificaciones: [{ data: [{ id: 'orig', canal: 'correo', estado: 'entregada' }, { id: FILA_ID, canal: 'sms', estado: 'enviando' }], error: null }],
    });
    const sms = { nombre: 'prueba', enviar: vi.fn() };
    const resultado = await enviarUnIntento(tenant, fila({ canal: 'sms', destino: cifrar('3001234567'), notificacion_origen_id: 'orig' }), { proveedorSms: sms });
    expect(resultado).toMatchObject({ estado: 'cancelada', omitida: true });
    expect(sms.enviar).not.toHaveBeenCalled();
    expect(ultimaActualizacion(tenant)).toMatchObject({ estado: 'cancelada' });
  });

  it('Resend recibe una clave de idempotencia y la etiqueta de la notificación', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 're_1' }) });
    const proveedor = crearProveedorCorreo({ CORREO_PROVEEDOR: 'resend', RESEND_API_KEY: 'k', CORREO_REMITENTE: 'Zaru <a@b.co>' }, { fetch });
    await proveedor.enviar({ para: 'luis@correo.com', asunto: 'A', html: '<p>x</p>', texto: 'x', referencia: FILA_ID });
    const [, opciones] = fetch.mock.calls[0];
    expect(opciones.headers['Idempotency-Key']).toBe(`zaru-${FILA_ID}`);
    expect(JSON.parse(opciones.body).tags).toEqual([{ name: 'notificacion', value: FILA_ID }]);
  });

  it('Twilio pide confirmación de entrega solo si hay URL pública', () => {
    expect(urlConfirmacionTwilio({ API_URL_PUBLICA: 'https://api.zaru.co/' }, FILA_ID)).toBe(`https://api.zaru.co/api/v1/webhooks/twilio?n=${FILA_ID}`);
    expect(urlConfirmacionTwilio({}, FILA_ID)).toBeNull();
  });
});

describe('CA4: firmas de los webhooks', () => {
  // Ejemplo publicado en la documentación de Svix (firma de Resend).
  const SVIX = {
    secreto: 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw',
    id: 'msg_p5jXN8AQM9LWM0D4loKWxJek',
    timestamp: '1614265330',
    cuerpo: '{"test": 2432232314}',
    firmas: 'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=',
    ahora: 1614265330 * 1000,
  };

  it('acepta la firma de Resend del ejemplo oficial', () => {
    expect(firmaResendValida(SVIX)).toBe(true);
    expect(firmaResendValida({ ...SVIX, firmas: `v1,otra v1,${SVIX.firmas.split(',')[1]}` })).toBe(true);
  });

  it('rechaza un cuerpo alterado, otro secreto o un evento viejo (más de 5 minutos)', () => {
    expect(firmaResendValida({ ...SVIX, cuerpo: '{"test": 1}' })).toBe(false);
    expect(firmaResendValida({ ...SVIX, secreto: 'whsec_' + Buffer.from('otro').toString('base64') })).toBe(false);
    expect(firmaResendValida({ ...SVIX, ahora: SVIX.ahora + 6 * MIN })).toBe(false);
    expect(firmaResendValida({ ...SVIX, firmas: undefined })).toBe(false);
  });

  // Ejemplo publicado en la documentación de seguridad de Twilio.
  const TWILIO = {
    token: '12345',
    url: 'https://mycompany.com/myapp.php?foo=1&bar=2',
    parametros: { CallSid: 'CA1234567890ABCDE', Caller: '+12349013030', Digits: '1234', From: '+12349013030', To: '+18005551212' },
    firma: '0/KCTR6DLpKmkAf8muzZqo1nDgQ=',
  };

  it('acepta la firma de Twilio del ejemplo oficial y rechaza un parámetro alterado', () => {
    expect(firmaTwilioValida(TWILIO)).toBe(true);
    expect(firmaTwilioValida({ ...TWILIO, parametros: { ...TWILIO.parametros, Digits: '9999' } })).toBe(false);
    expect(firmaTwilioValida({ ...TWILIO, token: 'otro' })).toBe(false);
  });

  it('lee la notificación de las etiquetas de Resend (lista u objeto) y descarta valores raros', () => {
    expect(notificacionDeEventoResend({ data: { tags: { notificacion: FILA_ID } } })).toBe(FILA_ID);
    expect(notificacionDeEventoResend({ data: { tags: [{ name: 'notificacion', value: FILA_ID }] } })).toBe(FILA_ID);
    expect(notificacionDeEventoResend({ data: { tags: { notificacion: "1' or 1=1" } } })).toBeNull();
  });

  it('sin secreto configurado el webhook responde 503 y con firma inválida 401', async () => {
    const req = (cabeceras = {}) => ({ get: (n) => cabeceras[n.toLowerCase()], body: { type: 'email.delivered' }, cuerpoCrudo: Buffer.from('{}') });
    delete process.env.RESEND_WEBHOOK_SECRET;
    expect((await ejecutar(webhooks.resend, req())).error).toMatchObject({ status: 503 });

    process.env.RESEND_WEBHOOK_SECRET = SVIX.secreto;
    const conFirmaFalsa = req({ 'svix-id': 'x', 'svix-timestamp': String(Math.floor(Date.now() / 1000)), 'svix-signature': 'v1,falsa' });
    expect((await ejecutar(webhooks.resend, conFirmaFalsa)).error).toMatchObject({ status: 401 });
    delete process.env.RESEND_WEBHOOK_SECRET;
  });
});
