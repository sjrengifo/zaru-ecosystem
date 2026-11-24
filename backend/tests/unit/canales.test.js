// HU-31/HU-39 — Preferencias de canales para la prueba de envío.
// No bloquean avisos operativos: esto se comprueba también aquí (push puede quedar inactivo sin
// afectar a la configuración de estados ni al fallback).
import { describe, it, expect, vi } from 'vitest';
import { crearTenantFalso, ejecutar } from '../helpers/tenantFalso.js';

const { armarPreferenciasCanales } = await import('../../src/shared/preferenciasCanales.js');
const { preferenciasCanales } = await import('../../src/schemas/canales.schemas.js');
const { obtener, actualizar } = await import('../../src/controllers/canales.controller.js');

const proveedores = {
  correo: { nombre: 'consola', configurado: true },
  sms: { nombre: 'twilio', configurado: true },
  push: { nombre: 'no_configurado', configurado: false },
};

describe('HU-31/HU-39 · preferencias de canales', () => {
  it('sin filas guardadas los tres canales quedan activos', () => {
    const filas = armarPreferenciasCanales([], { proveedores });
    expect(filas.map((f) => [f.canal, f.activo])).toEqual([
      ['sms', true],
      ['correo', true],
      ['push', true],
    ]);
    expect(filas.find((f) => f.canal === 'push')).toMatchObject({ disponible: false, motivo: 'El canal push no está configurado en este ambiente (PUSH_PROVEEDOR y llaves VAPID)' });
    expect(filas.every((f) => f.etiqueta)).toBe(true);
  });

  it('combina las preferencias guardadas sin quitar canales', () => {
    const filas = armarPreferenciasCanales([{ canal: 'sms', activo: false }], { proveedores });
    expect(Object.fromEntries(filas.map((f) => [f.canal, f.activo]))).toEqual({
      sms: false,
      correo: true,
      push: true,
    });
  });

  it('GET consulta solo las preferencias de la sede de la sesión', async () => {
    const tenant = crearTenantFalso({
      config_canales: [{ data: [{ canal: 'correo', activo: false }], error: null }],
    });
    const { res, error } = await ejecutar(obtener, { tenant });
    expect(error).toBeUndefined();
    expect(tenant.consultas[0]).toMatchObject({ tabla: 'config_canales', columnas: 'canal, activo' });
    expect(res.body.find((f) => f.canal === 'correo').activo).toBe(false);
  });

  it('PUT guarda en una sola RPC y no deja elegir establecimiento desde el cuerpo', async () => {
    const canales = [
      { canal: 'sms', activo: true },
      { canal: 'correo', activo: false },
      { canal: 'push', activo: true },
    ];
    expect(preferenciasCanales.safeParse({ canales, establecimiento_id: 'otra-sede' }).success).toBe(false);
    const valido = preferenciasCanales.parse({ canales });

    const tenant = crearTenantFalso();
    tenant.rpc = vi.fn(async () => canales);
    const { res, error } = await ejecutar(actualizar, { tenant, body: valido });
    expect(error).toBeUndefined();
    expect(tenant.rpc).toHaveBeenCalledWith('guardar_preferencias_canales', { p_canales: canales });
    expect(tenant.rpc.mock.calls[0][1]).not.toHaveProperty('p_establecimiento_id');
    expect(res.body.find((f) => f.canal === 'correo').activo).toBe(false);
  });

  it('el esquema rechaza canales inválidos, repetidos y valores que no son booleanos', () => {
    expect(preferenciasCanales.safeParse({ canales: [{ canal: 'fax', activo: true }] }).success).toBe(false);
    expect(preferenciasCanales.safeParse({ canales: [{ canal: 'sms', activo: 'sí' }] }).success).toBe(false);
    const repetidos = preferenciasCanales.safeParse({
      canales: [{ canal: 'sms', activo: true }, { canal: 'sms', activo: false }],
    });
    expect(repetidos.success).toBe(false);
    expect(repetidos.error.issues[0].message).toBe('El canal sms está repetido');
  });
});
