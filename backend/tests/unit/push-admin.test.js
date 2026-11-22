// HU-39/HU-40 — Dispositivo push del administrador y su uso en la prueba real de envío.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crearTenantFalso } from '../helpers/tenantFalso.js';

const { registrarDispositivoAdmin, suscripcionAdminVigente, destinoAdminPush } = await import(
  '../../src/shared/suscripcionesPushAdmin.js'
);
const { enviarPruebaCanales } = await import('../../src/shared/pruebaCanales.js');

const USUARIO = 'aaaaaaaa-0000-4000-8000-000000000001';
const SUSCRIPCION = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/dispositivo-admin',
  keys: { p256dh: 'clave-publica-del-dispositivo-larga', auth: 'clave-auth-del-dispositivo' },
};

beforeEach(() => {
  vi.stubEnv('PUSH_PROVEEDOR', 'webpush');
  vi.stubEnv('VAPID_PUBLIC_KEY', 'publica-de-prueba');
  vi.stubEnv('VAPID_PRIVATE_KEY', 'privada-de-prueba');
  vi.stubEnv('VAPID_SUBJECT', 'https://zaru-panel.vercel.app');
});
afterEach(() => vi.unstubAllEnvs());

describe('registro push del administrador', () => {
  it('guarda el dispositivo con el usuario de la sesión y la sede del tenant', async () => {
    const tenant = crearTenantFalso({ notificaciones_push_admin: [{ data: null, error: null }] });
    tenant.crear = vi.fn(async (tabla, valores) => ({ id: 'fila-1', ...valores }));

    const resultado = await registrarDispositivoAdmin(tenant, USUARIO, SUSCRIPCION, {
      userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/120.0',
    });

    expect(tenant.crear).toHaveBeenCalledTimes(1);
    const [tabla, valores] = tenant.crear.mock.calls[0];
    expect(tabla).toBe('notificaciones_push_admin');
    expect(valores).toMatchObject({
      establecimiento_id: tenant.establecimientoId,
      usuario_id: USUARIO,
      endpoint: SUSCRIPCION.endpoint,
      p256dh: SUSCRIPCION.keys.p256dh,
      auth: SUSCRIPCION.keys.auth,
    });
    expect(valores.dispositivo).toContain('Chrome en Android');
    expect(resultado.registrado).toBe(true);
  });

  it('devuelve null si la migración todavía no está aplicada', async () => {
    const tenant = crearTenantFalso({
      notificaciones_push_admin: [{ data: null, error: { code: '42P01', message: 'no existe' } }],
    });
    expect(await suscripcionAdminVigente(tenant, USUARIO)).toBeNull();
  });

  it('expone el destino como JSON para el proveedor y un nombre seguro para el panel', async () => {
    const fila = { endpoint: SUSCRIPCION.endpoint, p256dh: SUSCRIPCION.keys.p256dh, auth: SUSCRIPCION.keys.auth, dispositivo: 'Chrome en Android' };
    const destino = destinoAdminPush(fila);
    expect(JSON.parse(destino.valor)).toEqual(SUSCRIPCION);
    expect(destino.visible).toBe('Chrome en Android');
  });
});

describe('prueba de envío por push', () => {
  it('usa el dispositivo del administrador y lo muestra sin exponer el endpoint', async () => {
    const fila = {
      id: 'suscripcion-1',
      endpoint: SUSCRIPCION.endpoint,
      p256dh: SUSCRIPCION.keys.p256dh,
      auth: SUSCRIPCION.keys.auth,
      dispositivo: 'Chrome en Android',
      actualizada_at: new Date().toISOString(),
    };
    const tenant = crearTenantFalso({
      config_canales: [{ data: [{ canal: 'push', activo: true }], error: null }],
      establecimientos: [{ data: { nombre: 'Central' }, error: null }],
      notificaciones_push_admin: [{ data: [fila], error: null }],
    });
    tenant.rpc = vi.fn(async (funcion) => {
      if (funcion === 'hu39_reservar_consumo') return { estado: 'ok' };
      if (funcion === 'hu39_confirmar_consumo') return { estado: 'ok', alerta_80: null };
      throw new Error(`RPC inesperada: ${funcion}`);
    });

    const push = { nombre: 'webpush', configurado: true, enviar: vi.fn(async () => ({ idProveedor: 'push-1' })) };
    const correo = { nombre: 'consola', configurado: true, enviar: vi.fn(async () => ({ idProveedor: 'correo-1' })) };
    const sms = { nombre: 'twilio', configurado: true, enviar: vi.fn(async () => ({ idProveedor: 'sms-1' })) };

    const resultado = await enviarPruebaCanales({
      tenant,
      db: null, // push no necesita Auth: el destino sale del dispositivo registrado.
      usuarioId: USUARIO,
      canal: 'push',
      proveedores: { push, sms, correo },
    });

    expect(resultado.estado).toBe('entregado');
    expect(resultado.canalEntregado).toBe('push');
    expect(push.enviar).toHaveBeenCalledTimes(1);
    expect(sms.enviar).not.toHaveBeenCalled();
    expect(correo.enviar).not.toHaveBeenCalled();
    const intento = resultado.resultados.find((item) => item.canal === 'push');
    expect(intento.destino).toBe('Chrome en Android');
    expect(intento.consumo).toEqual({ reservado: true, contado: true, liberado: false });
  });
});
