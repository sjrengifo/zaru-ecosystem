// HU-33 con HU-29 y HU-40 — el canal alterno ahora incluye push y considera el aviso completo, que
// puede salir en paralelo por varios canales elegidos por el cliente.
// Proveedores simulados y un req.tenant falso: nunca toca Supabase ni un proveedor real.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { crearTenantFalso } from '../helpers/tenantFalso.js';

process.env.ZARU_CLAVE_CIFRADO ||= Buffer.alloc(32, 7).toString('base64');
process.env.SMS_PROVEEDOR = 'consola';

const { crearAlterno, enviarUnIntento } = await import('../../src/shared/notificaciones.js');
const { cifrar, descifrar } = await import('../../src/shared/cifrado.js');

const ORDEN_ID = '11111111-0000-4000-8000-000000000001';
const CLIENTE_ID = '22222222-0000-4000-8000-000000000002';
const FILA_ID = '33333333-0000-4000-8000-000000000003';
const SUSCRIPCION = { id: 's-1', cliente_id: CLIENTE_ID, endpoint: 'https://push.example/abc', p256dh: 'clave-p256dh', auth: 'clave-auth', dispositivo: 'Chrome en Android' };
const VAPID = { PUSH_PROVEEDOR: 'webpush', VAPID_PUBLIC_KEY: 'publica', VAPID_PRIVATE_KEY: 'privada', VAPID_SUBJECT: 'mailto:soporte@zaru.test' };

const orden = () => ({
  id: ORDEN_ID,
  estado: 'listo',
  subtotal: 30000,
  descuento: 0,
  total: 30000,
  created_at: '2026-11-22T15:00:00Z',
  codigo_seguimiento: 'ABC12345',
  vehiculos: { placa: 'XYZ987', clientes: { id: CLIENTE_ID, nombre: 'Luis Pérez', correo: cifrar('luis@correo.com'), telefono: '3001234567' } },
  orden_servicios: [{ precio: 30000, servicios: { nombre: 'Lavado premium' } }],
});

const fila = (extra = {}) => ({
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
  created_at: '2026-11-22T15:00:00Z',
  ...extra,
});

/** `aviso`: las filas del mismo evento de la misma orden (los canales en paralelo y sus alternos). */
function tenantCon({ aviso = [], preferencias = null, suscripcion = null } = {}) {
  const avisoRespuesta = { data: aviso, error: null };
  const tenant = crearTenantFalso({
    ordenes: [{ data: orden(), error: null }, { data: orden(), error: null }],
    establecimientos: [{ data: { nombre: 'Lavadero Norte' }, error: null }, { data: { nombre: 'Lavadero Norte' }, error: null }],
    autorizaciones_vigentes: [{ data: [{ tipo: 'notificaciones_servicio', otorgado: true, canal: 'panel', created_at: '2026-11-01T10:00:00Z' }], error: null }],
    notificaciones: [avisoRespuesta, avisoRespuesta],
    preferencias_notificacion: [{ data: preferencias, error: null }],
    suscripciones_push: [{ data: suscripcion ? [suscripcion] : [], error: null }, { data: suscripcion ? [suscripcion] : [], error: null }],
  });
  tenant.crear.mockImplementation(async (tabla) => ({ id: tabla === 'notificaciones' ? 'alterno-1' : 'intento-1' }));
  return tenant;
}

const creadas = (tenant) => tenant.crear.mock.calls.filter(([tabla]) => tabla === 'notificaciones').map(([, valores]) => valores);
const fallo = () => ({ nombre: 'prueba', enviar: vi.fn().mockRejectedValue(new Error('503 Service Unavailable')) });
let entornoAnterior;

beforeEach(() => {
  entornoAnterior = { ...process.env };
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  process.env = entornoAnterior;
});

describe('CA2 con HU-40: push como canal alterno', () => {
  it('si el correo se agota y el cliente tiene un dispositivo registrado, el alterno sale por push y abre el seguimiento', async () => {
    Object.assign(process.env, VAPID);
    const tenant = tenantCon({ aviso: [{ id: FILA_ID, canal: 'correo', estado: 'fallida', notificacion_origen_id: null }], suscripcion: SUSCRIPCION });
    const resultado = await crearAlterno(tenant, fila());
    expect(resultado).toEqual({ id: 'alterno-1', canal: 'push' });
    const [alterno] = creadas(tenant);
    expect(alterno).toMatchObject({
      canal: 'push',
      notificacion_origen_id: FILA_ID,
      clave_dedupe: `${ORDEN_ID}:orden.lista:push`,
      contenido: { alterno: true, url: expect.stringContaining('ABC12345') },
    });
    expect(JSON.parse(descifrar(alterno.destino))).toEqual({ endpoint: SUSCRIPCION.endpoint, keys: { p256dh: 'clave-p256dh', auth: 'clave-auth' } });
  });

  it('sin Web Push configurado en el ambiente, el alterno sigue siendo el SMS', async () => {
    delete process.env.PUSH_PROVEEDOR;
    const tenant = tenantCon({ aviso: [{ id: FILA_ID, canal: 'correo', estado: 'fallida', notificacion_origen_id: null }], suscripcion: SUSCRIPCION });
    expect(await crearAlterno(tenant, fila())).toEqual({ id: 'alterno-1', canal: 'sms' });
  });

  it('HU-29: si el cliente desactivó push, no se usa como alterno aunque tenga dispositivo', async () => {
    Object.assign(process.env, VAPID);
    const preferencias = { cliente_id: CLIENTE_ID, canal_push: false, canal_sms: false, canal_correo: true, telefono_sms: null, telefono_sms_verificado_at: null };
    const tenant = tenantCon({ aviso: [{ id: FILA_ID, canal: 'correo', estado: 'fallida', notificacion_origen_id: null }], preferencias, suscripcion: SUSCRIPCION });
    expect(await crearAlterno(tenant, fila())).toEqual({ sinAlterno: 'sin_canales' });
    expect(creadas(tenant)).toHaveLength(0);
  });
});

describe('CA2, CA3 y CA4 con HU-29: el aviso sale en paralelo por los canales que el cliente eligió', () => {
  it('si el SMS que eligió el cliente ya llegó, el correo fallido no crea alterno ni alerta', async () => {
    const tenant = tenantCon({ aviso: [
      { id: FILA_ID, canal: 'correo', estado: 'fallida', notificacion_origen_id: null },
      { id: 'sms-elegido', canal: 'sms', estado: 'enviada', notificacion_origen_id: null },
    ] });
    expect(await crearAlterno(tenant, fila())).toEqual({ sinAlterno: 'entregada' });
  });

  it('mientras el SMS elegido sigue en curso, el fallo del correo todavía no es definitivo', async () => {
    const tenant = tenantCon({ aviso: [
      { id: FILA_ID, canal: 'correo', estado: 'fallida', notificacion_origen_id: null },
      { id: 'sms-elegido', canal: 'sms', estado: 'pendiente', notificacion_origen_id: null },
    ] });
    expect(await crearAlterno(tenant, fila())).toEqual({ sinAlterno: 'en_curso' });
  });

  it('CA3: cuando el último canal elegido también falla, queda el fallo definitivo para la alerta', async () => {
    const ahora = new Date('2026-11-22T15:20:00Z');
    const tenant = tenantCon({ aviso: [
      { id: 'correo-elegido', canal: 'correo', estado: 'fallida', notificacion_origen_id: null },
      { id: FILA_ID, canal: 'sms', estado: 'enviando', notificacion_origen_id: null },
    ] });
    const resultado = await enviarUnIntento(tenant, fila({ canal: 'sms', destino: cifrar('3001234567'), intentos: 3 }), { proveedorSms: fallo(), ahora });
    expect(resultado.estado).toBe('fallida');
    expect(creadas(tenant)).toHaveLength(0); // no intenta crear otra vez el correo que el cliente ya tenía
    expect(tenant.actualizar).toHaveBeenCalledWith('notificaciones', FILA_ID, { fallo_definitivo_at: ahora.toISOString() }, 'id', 'Notificación');
  });

  it('un alterno pendiente no sale si cualquier canal del aviso ya llegó (CA4)', async () => {
    const tenant = tenantCon({ aviso: [
      { id: 'correo-original', canal: 'correo', estado: 'fallida', notificacion_origen_id: null },
      { id: 'push-elegido', canal: 'push', estado: 'entregada', notificacion_origen_id: null },
      { id: FILA_ID, canal: 'sms', estado: 'enviando', notificacion_origen_id: 'correo-original' },
    ] });
    const sms = { nombre: 'prueba', enviar: vi.fn() };
    const resultado = await enviarUnIntento(tenant, fila({ canal: 'sms', destino: cifrar('3001234567'), notificacion_origen_id: 'correo-original' }), { proveedorSms: sms });
    expect(resultado).toMatchObject({ estado: 'cancelada', omitida: true });
    expect(sms.enviar).not.toHaveBeenCalled();
  });

  it('el aviso completo se busca por la orden y el evento', async () => {
    const tenant = tenantCon({ aviso: [{ id: FILA_ID, canal: 'correo', estado: 'fallida', notificacion_origen_id: null }] });
    await crearAlterno(tenant, fila());
    const consulta = tenant.consultas.find((c) => c.tabla === 'notificaciones');
    expect(consulta.filtros).toEqual(expect.arrayContaining([['eq', 'orden_id', ORDEN_ID], ['eq', 'evento', 'orden.lista']]));
  });
});
