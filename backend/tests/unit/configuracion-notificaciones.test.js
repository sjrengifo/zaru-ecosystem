// HU-31 — Configuración de los estados que generan notificación.
// GET devuelve siempre los cinco estados del flujo; PUT guarda los interruptores de la sede de la
// sesión y "listo" no se puede desactivar (CA1, CA2 y CA3).
import { describe, it, expect, vi } from 'vitest';
import { crearTenantFalso, ejecutar } from '../helpers/tenantFalso.js';

const { obtener, actualizar } = await import('../../src/controllers/configuracion-notificaciones.controller.js');
const { configuracionNotificaciones } = await import('../../src/schemas/configuracion-notificaciones.schemas.js');
const { ESTADOS_NOTIFICACION, ESTADO_OBLIGATORIO, armarConfiguracion } = await import('../../src/shared/configNotificaciones.js');
const { ETAPAS } = await import('../../src/shared/etapasSeguimiento.js');

function tenantCon(filas = []) {
  const tenant = crearTenantFalso({ config_notificaciones: [{ data: filas, error: null }] });
  tenant.rpc = vi.fn(async (_funcion, { p_config }) => p_config);
  return tenant;
}

const valido = (estado, activo) => ({ estado, activo });

describe('HU-31 CA1 · estados configurables', () => {
  it('la lista sale de las cinco etapas del seguimiento, en orden', () => {
    expect(ESTADOS_NOTIFICACION).toEqual(['recibido', 'en_lavado', 'secado', 'listo', 'entregado']);
  });

  it('GET devuelve los cinco estados con su interruptor y marca el obligatorio', async () => {
    const { res, error } = await ejecutar(obtener, { tenant: tenantCon([]) });

    expect(error).toBeUndefined();
    expect(res.body).toEqual(
      ETAPAS.map(({ estado, titulo }) => ({
        estado,
        titulo,
        activo: true,
        obligatorio: estado === ESTADO_OBLIGATORIO,
      })),
    );
    expect(res.body.filter((item) => item.obligatorio).map((item) => item.estado)).toEqual(['listo']);
  });

  it('GET combina lo guardado con los estados del flujo', async () => {
    const tenant = tenantCon([{ estado: 'secado', activo: false }]);
    const { res } = await ejecutar(obtener, { tenant });

    const porEstado = Object.fromEntries(res.body.map((item) => [item.estado, item.activo]));
    expect(porEstado).toEqual({ recibido: true, en_lavado: true, secado: false, listo: true, entregado: true });
    expect(tenant.consultas[0]).toMatchObject({ tabla: 'config_notificaciones', columnas: 'estado, activo' });
  });

  it('un estado sin fila guardada se considera activo', () => {
    const config = armarConfiguracion([{ estado: 'listo', activo: true }]);
    expect(config.filter((item) => !item.activo)).toEqual([]);
  });

  it('GET informa el error de la base al manejador de errores', async () => {
    const tenant = crearTenantFalso({ config_notificaciones: [{ data: null, error: new Error('sin conexión') }] });
    const { error } = await ejecutar(obtener, { tenant });
    expect(error.message).toBe('sin conexión');
  });
});

describe('HU-31 CA2 y CA3 · guardar los interruptores', () => {
  it('PUT guarda toda la configuración de la sede de la sesión en una sola llamada', async () => {
    const config = [valido('recibido', false), valido('en_lavado', true), valido('secado', false), valido('listo', true), valido('entregado', true)];
    const tenant = tenantCon(config);
    const { res, error } = await ejecutar(actualizar, { tenant, body: config });

    expect(error).toBeUndefined();
    expect(tenant.rpc).toHaveBeenCalledWith('guardar_config_notificaciones', { p_config: config });
    // HU-41: el establecimiento lo inyecta el acceso del tenant; el cuerpo no puede elegir otro.
    expect(tenant.rpc.mock.calls[0][1]).not.toHaveProperty('p_establecimiento_id');
    expect(res.body.find((item) => item.estado === 'secado')).toMatchObject({ activo: false, obligatorio: false });
    expect(res.body.find((item) => item.estado === 'listo')).toMatchObject({ activo: true, obligatorio: true });
  });

  it('CA2: el esquema rechaza apagar "listo"', () => {
    const resultado = configuracionNotificaciones.safeParse([valido('listo', false)]);
    expect(resultado.success).toBe(false);
    expect(resultado.error.issues[0]).toMatchObject({
      path: [0, 'activo'],
      message: 'El estado "listo" es obligatorio y no se puede desactivar',
    });
  });

  it('CA2: "listo" activo es válido', () => {
    expect(configuracionNotificaciones.safeParse([valido('listo', true)]).success).toBe(true);
  });

  it('rechaza estados repetidos', () => {
    const resultado = configuracionNotificaciones.safeParse([valido('secado', true), valido('secado', false)]);
    expect(resultado.success).toBe(false);
    expect(resultado.error.issues[0].message).toBe('El estado secado está repetido');
  });

  it('rechaza estados fuera del flujo y valores que no son booleanos', () => {
    const estado = configuracionNotificaciones.safeParse([valido('perdido', true)]);
    const activo = configuracionNotificaciones.safeParse([{ estado: 'secado', activo: 'sí' }]);

    expect(estado.success).toBe(false);
    expect(estado.error.issues[0].message).toBe('El estado no es válido');
    expect(activo.success).toBe(false);
    expect(activo.error.issues[0].message).toBe('El valor de activo debe ser verdadero o falso');
  });

  it('rechaza listas vacías, demasiado largas o que no son listas', () => {
    expect(configuracionNotificaciones.safeParse([]).error.issues[0].message).toBe('Envía al menos un estado');
    expect(configuracionNotificaciones.safeParse([...ESTADOS_NOTIFICACION, ESTADOS_NOTIFICACION[0]].map((e) => valido(e, true))).success).toBe(false);
    expect(configuracionNotificaciones.safeParse({}).error.issues[0].message).toBe('La configuración debe ser una lista');
  });

  it('exige estado y activo en cada interruptor', () => {
    const sinEstado = configuracionNotificaciones.safeParse([{ activo: true }]);
    const sinActivo = configuracionNotificaciones.safeParse([{ estado: 'secado' }]);

    expect(sinEstado.error.issues[0].message).toBe('Cada interruptor debe indicar un estado');
    expect(sinActivo.error.issues[0].message).toBe('Cada interruptor debe indicar si está activo');
  });
});
