// HU-12: validación de promociones y controlador, sin Supabase: usa un req.tenant falso.
// El estado por fecha y la mejor promoción se prueban en database/pruebas/09_promociones.sql.
import { describe, it, expect, vi } from 'vitest';
import { promocionNueva, promocionCambios, filtroPromociones, hoyBogota } from '../../src/schemas/promociones.schemas.js';
import { listar, crear, actualizar } from '../../src/controllers/promociones.controller.js';
import { AppError } from '../../src/shared/errores.js';

const SERVICIO = 'aaaaaaaa-0000-4000-8000-000000000001';
const OTRO_SERVICIO = 'aaaaaaaa-0000-4000-8000-000000000002';
const PROMO = 'bbbbbbbb-0000-4000-8000-000000000012';
const base = { nombre: 'Martes de motor', descuentoPct: 20, fechaInicio: '2026-11-01', fechaFin: '2099-11-30', servicioIds: [SERVICIO] };

const errores = (esquema, datos) => esquema.safeParse(datos).error?.issues.map((i) => [i.path.join('.'), i.message]);

describe('RF-F4-01: datos de una promoción nueva', () => {
  it('acepta una promoción completa y cuenta una sola vez cada servicio', () => {
    expect(promocionNueva.parse({ ...base, servicioIds: [SERVICIO, SERVICIO], descripcion: '  ' })).toMatchObject({ servicioIds: [SERVICIO], descripcion: null });
  });

  it('exige nombre, descuento, fechas y al menos un servicio', () => {
    expect(errores(promocionNueva, {})).toEqual([
      ['nombre', 'El nombre es obligatorio'],
      ['descuentoPct', 'El descuento es obligatorio'],
      ['fechaInicio', 'La fecha de inicio es obligatoria'],
      ['fechaFin', 'La fecha de fin es obligatoria'],
      ['servicioIds', 'Elige al menos un servicio'],
    ]);
    expect(errores(promocionNueva, { ...base, servicioIds: [] })).toEqual([['servicioIds', 'Elige al menos un servicio']]);
  });

  it.each([0, 101, 12.5, '20'])('rechaza el descuento %s', (descuentoPct) => {
    expect(errores(promocionNueva, { ...base, descuentoPct })?.[0][0]).toBe('descuentoPct');
  });

  it('rechaza fechas inválidas o invertidas', () => {
    expect(errores(promocionNueva, { ...base, fechaInicio: '2026-02-30' })).toEqual([['fechaInicio', 'La fecha de inicio no es una fecha válida']]);
    expect(errores(promocionNueva, { ...base, fechaInicio: '01/11/2026' })).toEqual([['fechaInicio', 'La fecha de inicio debe tener el formato AAAA-MM-DD']]);
    expect(errores(promocionNueva, { ...base, fechaInicio: '2099-12-01' })).toEqual([['fechaFin', 'La fecha de fin no puede ser anterior a la de inicio']]);
  });

  it('una promoción nueva no puede terminar antes de hoy (Bogotá); terminar hoy sí', () => {
    expect(errores(promocionNueva, { ...base, fechaInicio: '2020-01-01', fechaFin: '2020-01-31' })).toEqual([['fechaFin', 'La fecha de fin no puede ser anterior a hoy']]);
    expect(promocionNueva.safeParse({ ...base, fechaInicio: hoyBogota(), fechaFin: hoyBogota() }).success).toBe(true);
  });

  it('hoy se calcula en Bogotá: a las 11 p. m. del 30 en Bogotá ya es 1 en UTC, pero sigue siendo 30', () => {
    expect(hoyBogota(new Date('2026-12-01T04:00:00Z'))).toBe('2026-11-30');
    expect(hoyBogota(new Date('2026-12-01T05:00:00Z'))).toBe('2026-12-01');
  });
});

describe('RF-F4-03 y RF-F4-06: cambios y filtro', () => {
  it('los cambios son parciales y permiten solo desactivar', () => {
    expect(promocionCambios.parse({ activa: false })).toEqual({ activa: false });
    expect(errores(promocionCambios, {})).toEqual([['', 'No hay datos para actualizar']]);
  });

  it('el filtro por defecto es todas y solo admite los cuatro estados', () => {
    expect(filtroPromociones.parse({})).toEqual({ estado: 'todas' });
    expect(errores(filtroPromociones, { estado: 'activas' })).toEqual([['estado', 'El estado debe ser vigentes, programadas, vencidas o todas']]);
  });
});

/** Consulta encadenable que registra sus filtros y resuelve con la respuesta indicada. */
function consulta(respuesta, filtros) {
  const q = {
    eq: (c, v) => (filtros.push([c, v]), q),
    order: () => q,
    then: (resolver, rechazar) => Promise.resolve(respuesta).then(resolver, rechazar),
  };
  return q;
}

async function ejecutar(controlador, req) {
  const res = { status: vi.fn(() => res), json: vi.fn() };
  const next = vi.fn();
  await controlador(req, res, next);
  return { res, error: next.mock.calls[0]?.[0] };
}

const guardada = {
  id: PROMO,
  nombre: 'Martes de motor',
  descripcion: null,
  condiciones: null,
  descuento_pct: 20,
  fecha_inicio: '2026-10-01',
  fecha_fin: '2026-10-31',
  activa: true,
  estado: 'vencida',
  servicios: [{ id: SERVICIO, nombre: 'Lavado de motor' }],
};

describe('controlador', () => {
  it('lista desde la vista con estado y traduce el filtro (vigentes → vigente)', async () => {
    const filtros = [];
    const tenant = { listar: vi.fn(() => consulta({ data: [guardada], error: null }, filtros)) };
    const { res } = await ejecutar(listar, { tenant, query: { estado: 'vigentes' } });
    expect(tenant.listar).toHaveBeenCalledWith('promociones_con_estado');
    expect(filtros).toEqual([['estado', 'vigente']]);
    expect(res.json).toHaveBeenCalledWith([guardada]);
  });

  it('con "todas" no filtra por estado', async () => {
    const filtros = [];
    const tenant = { listar: () => consulta({ data: [], error: null }, filtros) };
    await ejecutar(listar, { tenant, query: { estado: 'todas' } });
    expect(filtros).toEqual([]);
  });

  it('crea con guardar_promocion y responde 201 con la promoción y su estado', async () => {
    const tenant = { rpc: vi.fn(async () => PROMO), obtener: vi.fn(async () => guardada) };
    const { res } = await ejecutar(crear, { tenant, body: promocionNueva.parse(base) });
    expect(tenant.rpc).toHaveBeenCalledWith('guardar_promocion', expect.objectContaining({ p_promocion_id: null, p_descuento_pct: 20, p_servicio_ids: [SERVICIO] }));
    expect(tenant.obtener).toHaveBeenCalledWith('promociones_con_estado', PROMO, '*', 'Promoción');
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('desactivar una promoción vencida combina con lo guardado y no exige fechas futuras', async () => {
    const tenant = { rpc: vi.fn(async () => PROMO), obtener: vi.fn(async () => guardada) };
    const { error } = await ejecutar(actualizar, { tenant, params: { id: PROMO }, body: { activa: false } });
    expect(error).toBeUndefined();
    expect(tenant.rpc).toHaveBeenCalledWith('guardar_promocion', {
      p_promocion_id: PROMO,
      p_nombre: 'Martes de motor',
      p_descripcion: null,
      p_condiciones: null,
      p_descuento_pct: 20,
      p_fecha_inicio: '2026-10-01',
      p_fecha_fin: '2026-10-31',
      p_activa: false,
      p_servicio_ids: [SERVICIO],
    });
  });

  it('un cambio que deja el fin antes del inicio guardado responde 400 sin guardar', async () => {
    const tenant = { rpc: vi.fn(), obtener: vi.fn(async () => guardada) };
    const { error } = await ejecutar(actualizar, { tenant, params: { id: PROMO }, body: { fechaFin: '2026-09-30' } });
    expect(error).toBeInstanceOf(AppError);
    expect(error.detalles).toEqual([{ campo: 'fechaFin', mensaje: 'La fecha de fin no puede ser anterior a la de inicio' }]);
    expect(tenant.rpc).not.toHaveBeenCalled();
  });

  it('cambiar los servicios reemplaza la lista completa', async () => {
    const tenant = { rpc: vi.fn(async () => PROMO), obtener: vi.fn(async () => guardada) };
    await ejecutar(actualizar, { tenant, params: { id: PROMO }, body: { servicioIds: [OTRO_SERVICIO] } });
    expect(tenant.rpc.mock.calls[0][1].p_servicio_ids).toEqual([OTRO_SERVICIO]);
  });
});
