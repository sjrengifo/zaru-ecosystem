// HU-07: validación y controlador del catálogo de servicios, sin Supabase.
import { describe, it, expect, vi } from 'vitest';
import { servicioNuevo, servicioCambios, filtroServicios } from '../../src/schemas/servicios.schemas.js';
import { listar, crear, actualizar } from '../../src/controllers/servicios.controller.js';

const SERVICIO = 'aaaaaaaa-0000-4000-8000-000000000007';
const base = { nombre: 'Lavado básico', precio: 25000, duracionMin: 30 };

const errores = (esquema, datos) => esquema.safeParse(datos).error?.issues.map((i) => [i.path.join('.'), i.message]);

describe('RF-F2-16: datos de un servicio nuevo', () => {
  it('acepta nombre, precio y duración, y recorta el nombre', () => {
    expect(servicioNuevo.parse({ ...base, nombre: '  Lavado básico  ' })).toEqual(base);
  });

  it('exige los tres campos', () => {
    expect(errores(servicioNuevo, {})).toEqual([
      ['nombre', 'El nombre es obligatorio'],
      ['precio', 'El precio es obligatorio'],
      ['duracionMin', 'La duración es obligatoria'],
    ]);
  });

  it.each([-1, 12.345, '25000', Infinity])('rechaza el precio %s', (precio) => {
    expect(errores(servicioNuevo, { ...base, precio })?.[0][0]).toBe('precio');
  });

  it.each([0, -5, 12.5, '30'])('rechaza la duración %s', (duracionMin) => {
    expect(errores(servicioNuevo, { ...base, duracionMin })?.[0][0]).toBe('duracionMin');
  });

  it('rechaza un nombre vacío o demasiado largo', () => {
    expect(errores(servicioNuevo, { ...base, nombre: '   ' })).toEqual([['nombre', 'El nombre es obligatorio']]);
    expect(errores(servicioNuevo, { ...base, nombre: 'x'.repeat(81) })).toEqual([['nombre', 'El nombre admite máximo 80 caracteres']]);
  });
});

describe('RF-F2-17 y RF-F2-18: cambios parciales y filtro por activo', () => {
  it('permite editar un solo campo o solo activar/desactivar', () => {
    expect(servicioCambios.parse({ precio: 30000 })).toEqual({ precio: 30000 });
    expect(servicioCambios.parse({ activo: false })).toEqual({ activo: false });
  });

  it('una edición vacía responde un mensaje claro', () => {
    expect(errores(servicioCambios, {})).toEqual([['', 'No hay datos para actualizar']]);
  });

  it('el filtro activo es opcional y convierte true/false de la URL', () => {
    expect(filtroServicios.parse({})).toEqual({});
    expect(filtroServicios.parse({ activo: 'true' })).toEqual({ activo: true });
    expect(filtroServicios.parse({ activo: 'false' })).toEqual({ activo: false });
    expect(errores(filtroServicios, { activo: 'todos' })).toEqual([['activo', 'El filtro activo debe ser true o false']]);
  });
});

/** Consulta encadenable que registra sus filtros y resuelve con la respuesta indicada. */
function consulta(respuesta, filtros) {
  const q = {
    order: () => q,
    eq: (campo, valor) => (filtros.push([campo, valor]), q),
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

describe('controlador de servicios', () => {
  it('lista el catálogo ordenado por nombre y sin filtro por defecto', async () => {
    const filtros = [];
    const tenant = { listar: vi.fn(() => consulta({ data: [base], error: null }, filtros)) };
    const { res, error } = await ejecutar(listar, { tenant, query: {} });
    expect(error).toBeUndefined();
    expect(filtros).toEqual([]);
    expect(tenant.listar).toHaveBeenCalledWith('servicios');
    expect(res.json).toHaveBeenCalledWith([base]);
  });

  it('CA3: con activo=true filtra solo los servicios disponibles', async () => {
    const filtros = [];
    const tenant = { listar: vi.fn(() => consulta({ data: [], error: null }, filtros)) };
    await ejecutar(listar, { tenant, query: { activo: true } });
    expect(filtros).toEqual([['activo', true]]);
  });

  it('CA1: crea el servicio en el establecimiento de la sesión con columnas snake_case', async () => {
    const creado = { id: SERVICIO, nombre: base.nombre, precio: 25000, duracion_min: 30, activo: true };
    const tenant = { crear: vi.fn(async () => creado) };
    const { res, error } = await ejecutar(crear, { tenant, body: base });
    expect(error).toBeUndefined();
    expect(tenant.crear).toHaveBeenCalledWith('servicios', { nombre: base.nombre, precio: 25000, duracion_min: 30 });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(creado);
  });

  it('CA2: cambia el precio sin enviar campos que no se editaron', async () => {
    const actualizado = { id: SERVICIO, nombre: base.nombre, precio: 30000, duracion_min: 30, activo: true };
    const tenant = { actualizar: vi.fn(async () => actualizado) };
    const { res, error } = await ejecutar(actualizar, { tenant, params: { id: SERVICIO }, body: { precio: 30000 } });
    expect(error).toBeUndefined();
    expect(tenant.actualizar).toHaveBeenCalledWith('servicios', SERVICIO, { precio: 30000 }, '*', 'Servicio');
    expect(res.json).toHaveBeenCalledWith(actualizado);
  });

  it('CA3: desactivar solo envía el cambio de activo', async () => {
    const tenant = { actualizar: vi.fn(async () => ({ id: SERVICIO, activo: false })) };
    await ejecutar(actualizar, { tenant, params: { id: SERVICIO }, body: { activo: false } });
    expect(tenant.actualizar).toHaveBeenCalledWith('servicios', SERVICIO, { activo: false }, '*', 'Servicio');
  });

  it('propaga el error de la base al manejador de errores', async () => {
    const fallo = new Error('sin conexión');
    const tenant = { listar: vi.fn(() => consulta({ data: null, error: fallo }, [])) };
    const { error } = await ejecutar(listar, { tenant, query: {} });
    expect(error).toBe(fallo);
  });
});
