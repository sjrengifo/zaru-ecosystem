// HU-16 — Pruebas de los cálculos de reportes, el filtro de fechas y el controlador.
// No requieren Supabase: las órdenes se construyen a mano y el tenant es un doble.
import { describe, it, expect, vi } from 'vitest';
import {
  FRANJAS,
  finDiaBogotaExclusivo,
  inicioDiaBogota,
  posicionBogota,
  resumirAfluencia,
  resumirServicios,
} from '../../src/shared/reportes.js';
import { rangoReporte } from '../../src/schemas/reportes.schemas.js';
import { afluencia, servicios } from '../../src/controllers/reportes.controller.js';

const ORDEN_1 = {
  id: '11111111-1111-4111-8111-111111111111',
  created_at: '2026-11-03T15:00:00.000Z',
  orden_servicios: [
    { precio: '30000.00', descuento: '5000.00', servicio: { id: 's1', nombre: 'Lavado básico', precio: 999999 } },
    { precio: '20000.00', descuento: '0.00', servicio: { id: 's2', nombre: 'Lavado de motor', precio: 999999 } },
  ],
};

const ORDEN_2 = {
  id: '22222222-2222-4222-8222-222222222222',
  created_at: '2026-11-04T14:00:00.000Z',
  orden_servicios: [{ precio: '30000.00', descuento: '0.00', servicio: { id: 's1', nombre: 'Lavado básico' } }],
};

const errores = (datos) => rangoReporte.safeParse(datos).error?.issues.map((i) => [i.path.join('.'), i.message]);

describe('filtro de fechas de los reportes', () => {
  it('acepta un rango de días reales', () => {
    expect(rangoReporte.parse({ desde: '2026-11-01', hasta: '2026-11-30' })).toEqual({
      desde: '2026-11-01',
      hasta: '2026-11-30',
    });
  });

  it('la fecha de inicio no puede ser posterior a la de fin', () => {
    expect(errores({ desde: '2026-11-03', hasta: '2026-11-01' })).toEqual([
      ['desde', 'La fecha de inicio no puede ser posterior a la fecha de fin'],
    ]);
  });

  it.each(['2026-02-30', '2026-13-01', '03-11-2026', ''])('rechaza la fecha inválida %s', (desde) => {
    expect(errores({ desde, hasta: '2026-11-30' })?.[0][0]).toBe('desde');
  });

  it('exige ambas fechas', () => {
    expect(errores({})).toEqual([
      ['desde', 'Indica la fecha de inicio'],
      ['hasta', 'Indica la fecha de fin'],
    ]);
  });

  it('el rango cubre el día final completo en hora de Bogotá', () => {
    expect(inicioDiaBogota('2026-11-01')).toBe('2026-11-01T05:00:00.000Z');
    expect(finDiaBogotaExclusivo('2026-11-03')).toBe('2026-11-04T05:00:00.000Z');
  });

  it('ubica cada instante en el día y la franja de Bogotá, no en UTC', () => {
    expect(posicionBogota('2026-11-03T05:30:00.000Z')).toEqual({ dia: 1, hora: 0, franja: 0 });
    expect(posicionBogota('2026-11-03T04:30:00.000Z')).toEqual({ dia: 0, hora: 23, franja: 11 });
    expect(FRANJAS).toHaveLength(12);
    expect(FRANJAS[11].etiqueta).toBe('22:00–24:00');
  });
});

describe('CA1: ranking de servicios', () => {
  it('cuenta cada orden una sola vez por servicio y suma precio menos descuento', () => {
    const resultado = resumirServicios([ORDEN_1, ORDEN_2]);

    expect(resultado.totalOrdenes).toBe(2);
    expect(resultado.servicios).toEqual([
      { servicioId: 's1', nombre: 'Lavado básico', ordenes: 2, ingresos: 55000 },
      { servicioId: 's2', nombre: 'Lavado de motor', ordenes: 1, ingresos: 20000 },
    ]);
  });

  it('usa el precio histórico de la orden, no el precio actual del catálogo', () => {
    const servicios = resumirServicios([ORDEN_1]).servicios;
    expect(servicios.map((servicio) => servicio.ingresos)).toEqual([25000, 20000]);
    expect(servicios.every((servicio) => servicio.ingresos !== 999999)).toBe(true);
  });

  it('no duplica el conteo ni los ingresos si el join repitiera la misma línea', () => {
    const conLineaRepetida = {
      ...ORDEN_1,
      orden_servicios: [ORDEN_1.orden_servicios[0], ORDEN_1.orden_servicios[0]],
    };
    expect(resumirServicios([conLineaRepetida]).servicios).toEqual([
      { servicioId: 's1', nombre: 'Lavado básico', ordenes: 1, ingresos: 25000 },
    ]);
  });

  it('sin órdenes devuelve un ranking vacío y total cero (CA3)', () => {
    expect(resumirServicios([])).toEqual({ totalOrdenes: 0, servicios: [] });
  });
});

describe('CA2: afluencia por día y franja', () => {
  it('agrupa en lunes a domingo y en franjas de dos horas de Bogotá', () => {
    const resultado = resumirAfluencia([
      { id: '1', created_at: '2026-11-03T05:30:00.000Z' }, // martes 00:30
      { id: '2', created_at: '2026-11-03T04:30:00.000Z' }, // lunes 23:30
      { id: '3', created_at: '2026-11-03T15:00:00.000Z' }, // martes 10:00
      { id: '4', created_at: '2026-11-08T15:00:00.000Z' }, // domingo 10:00
    ]);

    expect(resultado.totalVehiculos).toBe(4);
    expect(resultado.matriz[1][0]).toBe(1);
    expect(resultado.matriz[0][11]).toBe(1);
    expect(resultado.matriz[1][5]).toBe(1);
    expect(resultado.matriz[6][5]).toBe(1);
    expect(resultado.porDia[1]).toEqual({ dia: 'Martes', vehiculos: 2 });
    expect(resultado.porFranja[5]).toEqual({ franja: '10:00–12:00', vehiculos: 2 });
  });

  it('sin órdenes deja la matriz en ceros y total cero (CA3)', () => {
    const resultado = resumirAfluencia([]);
    expect(resultado.totalVehiculos).toBe(0);
    expect(resultado.matriz).toHaveLength(7);
    expect(resultado.matriz.every((fila) => fila.length === 12 && fila.every((valor) => valor === 0))).toBe(true);
  });
});

/** Consulta encadenable que registra gte/lt/order y resuelve con la respuesta indicada. */
function consulta(respuesta, llamadas) {
  const q = {
    gte: (campo, valor) => (llamadas.push(['gte', campo, valor]), q),
    lt: (campo, valor) => (llamadas.push(['lt', campo, valor]), q),
    order: (campo, opciones) => (llamadas.push(['order', campo, opciones]), q),
    then: (resolver, rechazar) => Promise.resolve(respuesta).then(resolver, rechazar),
  };
  return q;
}

async function ejecutar(controlador, req) {
  const res = { json: vi.fn() };
  const next = vi.fn();
  await controlador(req, res, next);
  return { res, error: next.mock.calls[0]?.[0] };
}

describe('controlador de reportes', () => {
  it('consulta las órdenes del establecimiento dentro del rango y devuelve ambos reportes', async () => {
    const llamadas = [];
    const filas = [ORDEN_1, ORDEN_2];
    const tenant = { listar: vi.fn(() => consulta({ data: filas, error: null }, llamadas)) };

    const esperado = resumirAfluencia(filas);
    const { res, error } = await ejecutar(afluencia, { tenant, query: { desde: '2026-11-01', hasta: '2026-11-30' } });

    expect(error).toBeUndefined();
    expect(tenant.listar).toHaveBeenCalledWith('ordenes', expect.stringContaining('orden_servicios(precio, descuento'));
    expect(llamadas).toEqual([
      ['gte', 'created_at', '2026-11-01T05:00:00.000Z'],
      ['lt', 'created_at', '2026-12-01T05:00:00.000Z'],
      ['order', 'created_at', { ascending: true }],
    ]);
    expect(res.json).toHaveBeenCalledWith({ desde: '2026-11-01', hasta: '2026-11-30', ...esperado });
  });

  it('el reporte de servicios incluye las fechas consultadas', async () => {
    const tenant = { listar: vi.fn(() => consulta({ data: [ORDEN_1], error: null }, [])) };
    const { res } = await ejecutar(servicios, { tenant, query: { desde: '2026-11-01', hasta: '2026-11-30' } });
    expect(res.json).toHaveBeenCalledWith({
      desde: '2026-11-01',
      hasta: '2026-11-30',
      totalOrdenes: 1,
      servicios: [
        { servicioId: 's1', nombre: 'Lavado básico', ordenes: 1, ingresos: 25000 },
        { servicioId: 's2', nombre: 'Lavado de motor', ordenes: 1, ingresos: 20000 },
      ],
    });
  });

  it('propaga el error de la base al manejador de errores', async () => {
    const fallo = new Error('sin conexión');
    const tenant = { listar: vi.fn(() => consulta({ data: null, error: fallo }, [])) };
    const { error } = await ejecutar(servicios, { tenant, query: { desde: '2026-11-01', hasta: '2026-11-30' } });
    expect(error).toBe(fallo);
  });
});
