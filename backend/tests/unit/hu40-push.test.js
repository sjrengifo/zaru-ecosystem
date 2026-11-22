// HU-40 (ZARU-70) — Registrar el dispositivo para recibir notificaciones push.
// Proveedor Web Push simulado: no hay servicios de push, Supabase ni navegador reales.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { crearTenantFalso } from '../helpers/tenantFalso.js';

process.env.ZARU_CLAVE_CIFRADO = Buffer.alloc(32, 7).toString('base64');

const PUSH_ENV = {
  PUSH_PROVEEDOR: 'webpush',
  VAPID_PUBLIC_KEY: 'BPublicaDePrueba',
  VAPID_PRIVATE_KEY: 'privada-de-prueba',
  VAPID_SUBJECT: 'https://zaru-panel.vercel.app',
};

const { proveedorPush, pushConfigurado, clavePublicaPush } = await import('../../src/shared/proveedorPush.js');
const { registrarDispositivo, eliminarDispositivo, nombreDispositivo, suscripcionComoDestino } = await import('../../src/shared/suscripcionesPush.js');
const { prepararPush, programarNotificacion, prepararSms } = await import('../../src/shared/notificaciones.js');
const { canalesActivos } = await import('../../src/shared/preferenciasCanal.js');
const { suscripcionPush } = await import('../../src/schemas/cliente.schemas.js');
const { descifrar } = await import('../../src/shared/cifrado.js');

const CLIENTE_ID = '22222222-0000-4000-8000-000000000002';
const ORDEN_ID = '11111111-0000-4000-8000-000000000001';
const SUSCRIPCION = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) },
};
const FILA_SUSCRIPCION = {
  id: '33333333-0000-4000-8000-000000000003',
  cliente_id: CLIENTE_ID,
  endpoint: SUSCRIPCION.endpoint,
  p256dh: SUSCRIPCION.keys.p256dh,
  auth: SUSCRIPCION.keys.auth,
  dispositivo: 'Chrome en Android',
};
const respuesta = (data) => [{ data, error: null }];

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  for (const [k, v] of Object.entries(PUSH_ENV)) vi.stubEnv(k, v);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('HU-40 · proveedor Web Push', () => {
  it('sin llaves VAPID el canal queda sin configurar y no ofrece llave pública', async () => {
    vi.unstubAllEnvs();
    expect(pushConfigurado({})).toBe(false);
    expect(clavePublicaPush({})).toBeNull();
    await expect(proveedorPush({}).enviar({ para: '{}' })).rejects.toMatchObject({ recuperable: false });
  });

  it('envía la notificación firmada con VAPID, con título, texto y enlace', async () => {
    const lib = { sendNotification: vi.fn(async () => ({ statusCode: 201, headers: { location: 'msg-1' } })) };
    const resultado = await proveedorPush(PUSH_ENV, { lib }).enviar({
      para: JSON.stringify(SUSCRIPCION), asunto: 'Tu vehículo está listo', texto: 'ABC123 está listo', url: 'https://x/seguimiento/K7', referencia: 'n-1',
    });

    expect(resultado).toEqual({ idProveedor: 'msg-1' });
    const [suscripcion, carga, opciones] = lib.sendNotification.mock.calls[0];
    expect(suscripcion).toEqual(SUSCRIPCION);
    expect(JSON.parse(carga)).toEqual({ titulo: 'Tu vehículo está listo', cuerpo: 'ABC123 está listo', url: 'https://x/seguimiento/K7', etiqueta: 'n-1' });
    expect(opciones.vapidDetails).toEqual({ subject: PUSH_ENV.VAPID_SUBJECT, publicKey: PUSH_ENV.VAPID_PUBLIC_KEY, privateKey: PUSH_ENV.VAPID_PRIVATE_KEY });
  });

  it('un dispositivo que ya no existe (410) no se reintenta y se marca como vencido', async () => {
    const lib = { sendNotification: vi.fn(async () => { throw Object.assign(new Error('Gone'), { statusCode: 410 }); }) };
    await expect(proveedorPush(PUSH_ENV, { lib }).enviar({ para: JSON.stringify(SUSCRIPCION) }))
      .rejects.toMatchObject({ recuperable: false, suscripcionVencida: true });
  });

  it('un fallo temporal del servicio (503 o 429) sí se reintenta', async () => {
    for (const statusCode of [503, 429]) {
      const lib = { sendNotification: vi.fn(async () => { throw Object.assign(new Error('x'), { statusCode }); }) };
      await expect(proveedorPush(PUSH_ENV, { lib }).enviar({ para: JSON.stringify(SUSCRIPCION) }))
        .rejects.toMatchObject({ recuperable: true, suscripcionVencida: false });
    }
  });
});

describe('HU-40 CA1 · registrar el dispositivo del cliente', () => {
  it('guarda la suscripción asociada al cliente del pase, con un nombre legible del dispositivo', async () => {
    const tenant = crearTenantFalso({ suscripciones_push: respuesta(null) });
    tenant.crear.mockImplementation(async (tabla, valores) => ({ id: 'nueva', ...valores }));
    const resultado = await registrarDispositivo(tenant, CLIENTE_ID, SUSCRIPCION, {
      userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36',
    });

    expect(resultado).toEqual({ registrado: true, dispositivo: 'Chrome en Android' });
    expect(tenant.crear.mock.calls[0][1]).toMatchObject({
      cliente_id: CLIENTE_ID, endpoint: SUSCRIPCION.endpoint, p256dh: SUSCRIPCION.keys.p256dh, auth: SUSCRIPCION.keys.auth,
    });
  });

  it('si el navegador ya estaba registrado, actualiza la misma fila (no duplica)', async () => {
    const tenant = crearTenantFalso({ suscripciones_push: respuesta({ id: FILA_SUSCRIPCION.id }) });
    tenant.actualizar.mockImplementation(async (tabla, id, cambios) => ({ id, ...cambios }));
    await registrarDispositivo(tenant, CLIENTE_ID, SUSCRIPCION, { userAgent: 'Safari/605 iPhone' });

    expect(tenant.crear).not.toHaveBeenCalled();
    expect(tenant.actualizar.mock.calls[0].slice(0, 2)).toEqual(['suscripciones_push', FILA_SUSCRIPCION.id]);
  });

  it('el mismo navegador registrado en otra sede responde un conflicto claro', async () => {
    const tenant = crearTenantFalso({ suscripciones_push: respuesta(null) });
    tenant.crear.mockRejectedValue(Object.assign(new Error('duplicado'), { codigo: 'CONFLICTO' }));
    await expect(registrarDispositivo(tenant, CLIENTE_ID, SUSCRIPCION)).rejects.toMatchObject({
      codigo: 'CONFLICTO', message: expect.stringContaining('otro car wash'),
    });
  });

  it('sin Web Push configurado no registra nada (503)', async () => {
    vi.unstubAllEnvs();
    await expect(registrarDispositivo(crearTenantFalso(), CLIENTE_ID, SUSCRIPCION)).rejects.toMatchObject({ codigo: 'SERVICIO_NO_DISPONIBLE' });
  });

  it('quitar el dispositivo borra solo la suscripción de ese cliente', async () => {
    const tenant = crearTenantFalso({ suscripciones_push: respuesta({ id: FILA_SUSCRIPCION.id }) });
    expect(await eliminarDispositivo(tenant, CLIENTE_ID, SUSCRIPCION.endpoint)).toEqual({ registrado: false });
    expect(tenant.eliminar).toHaveBeenCalledWith('suscripciones_push', FILA_SUSCRIPCION.id, 'Suscripción');
    expect(tenant.consultas[0].filtros).toContainEqual(['eq', 'cliente_id', CLIENTE_ID]);
  });

  it.each([
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605 Version/17.0 Mobile Safari/604.1', 'Safari en iPhone'],
    ['Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/131.0 Safari/537.36 Edg/131.0', 'Edge en Windows'],
    ['Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0', 'Firefox en Android'],
  ])('reconoce el dispositivo: %s', (ua, nombre) => {
    expect(nombreDispositivo(ua)).toBe(nombre);
  });

  it('valida la suscripción: endpoint https y llaves presentes', () => {
    expect(suscripcionPush.safeParse(SUSCRIPCION).success).toBe(true);
    expect(suscripcionPush.safeParse({ ...SUSCRIPCION, endpoint: 'http://inseguro.com/x' }).success).toBe(false);
    expect(suscripcionPush.safeParse({ endpoint: SUSCRIPCION.endpoint }).success).toBe(false);
  });
});

describe('HU-40 · el motor de avisos usa el canal push', () => {
  const CLIENTE = { id: CLIENTE_ID, correo: null, telefono: '3001234567', nombre: 'Laura' };
  const orden = {
    id: ORDEN_ID, estado: 'en_lavado', total: 30000, created_at: '2026-11-11T14:00:00Z', codigo_seguimiento: 'K7Q2M9XH4P',
    vehiculos: { placa: 'XYZ987', clientes: CLIENTE }, orden_servicios: [],
  };
  const autorizado = { data: [{ tipo: 'notificaciones_servicio', otorgado: true, canal: 'panel', created_at: '2026-11-01T10:00:00Z' }], error: null };
  const filaPreferencias = { id: 'p1', canal_push: true, canal_sms: false, canal_correo: false, telefono_sms: null, telefono_sms_verificado_at: null };

  function tenantDeEnvio({ suscripciones = [respuesta(FILA_SUSCRIPCION), respuesta(FILA_SUSCRIPCION)[0]], config = null } = {}) {
    const tenant = crearTenantFalso({
      ordenes: respuesta(orden),
      preferencias_notificacion: respuesta(filaPreferencias),
      suscripciones_push: suscripciones.flat(),
      config_notificaciones: [{ data: config, error: null }, { data: config, error: null }],
      autorizaciones_vigentes: [autorizado, autorizado],
      establecimientos: [{ data: { nombre: 'Lavadero Norte' }, error: null }],
    });
    tenant.crear.mockImplementation(async (tabla, valores) => ({ id: `n-${valores.canal}`, ...valores }));
    return tenant;
  }

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NOTIFICACIONES_WORKER', 'on');
  });

  it('con push activo y dispositivo registrado, el aviso va al dispositivo y abre el seguimiento', async () => {
    const tenant = tenantDeEnvio({ suscripciones: [[{ data: [FILA_SUSCRIPCION], error: null }], [{ data: [FILA_SUSCRIPCION], error: null }]] });
    const resumen = await programarNotificacion(tenant, ORDEN_ID, 'en_lavado');

    const push = tenant.crear.mock.calls.find(([tabla, f]) => tabla === 'notificaciones' && f.canal === 'push')?.[1];
    expect(push).toBeDefined();
    expect(JSON.parse(descifrar(push.destino))).toEqual(SUSCRIPCION);
    expect(push.contenido.texto).toContain('XYZ987 inició el lavado');
    expect(push.contenido.url).toContain('/seguimiento/K7Q2M9XH4P');
    expect(push.clave_dedupe).toBe(`${ORDEN_ID}:orden.en_lavado:push`);
    expect(resumen).toMatchObject({ canal: 'push', estado: 'pendiente', destino: 'Chrome en Android' });
  });

  it('con la casilla de push activa pero sin dispositivo, push no cuenta como canal activo', async () => {
    const tenant = crearTenantFalso({
      preferencias_notificacion: respuesta(filaPreferencias),
      suscripciones_push: [{ data: [], error: null }],
    });
    expect((await canalesActivos(tenant, CLIENTE_ID)).push).toBe(false);
  });

  it('HU-31: si la sede apagó el aviso de ese estado, no sale por push ni por SMS', async () => {
    const apagado = { activo: false };
    const tenantPush = tenantDeEnvio({ config: apagado });
    const enPush = await prepararPush(tenantPush, { evento: 'orden.en_lavado', ordenId: ORDEN_ID }, { orden });
    expect(enPush.resumen).toMatchObject({ canal: 'push', estado: 'omitida', motivo: 'desactivado' });

    const tenantSms = tenantDeEnvio({ config: apagado });
    const enSms = await prepararSms(tenantSms, { evento: 'orden.en_lavado', ordenId: ORDEN_ID }, {
      orden, preferencias: { sms: true, telefonoSms: '3001234567' },
    });
    expect(enSms.resumen).toMatchObject({ canal: 'sms', estado: 'omitida', motivo: 'desactivado' });
    expect(tenantSms.crear).not.toHaveBeenCalled();
  });

  it('el destino guardado es la suscripción en JSON, cifrada', () => {
    expect(JSON.parse(suscripcionComoDestino(FILA_SUSCRIPCION))).toEqual(SUSCRIPCION);
  });
});
