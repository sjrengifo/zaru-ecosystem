// HU-05: validación de placas y registro de vehículos. No requiere Supabase: usa un req.tenant falso.
import { describe, it, expect, vi } from 'vitest';
import { vehiculoNuevo } from '../../src/schemas/vehiculos.schemas.js';
import { crear, listar } from '../../src/controllers/vehiculos.controller.js';
import { AppError, noEncontrado } from '../../src/shared/errores.js';

const CLIENTE = 'cccccccc-0000-4000-8000-000000000003';
const OTRO = 'dddddddd-0000-4000-8000-000000000004';
const base = { clienteId: CLIENTE, placa: 'ABC123', tipo: 'carro' };

const errores = (datos) => vehiculoNuevo.safeParse({ ...base, ...datos }).error?.issues.map((i) => [i.path.join('.'), i.message]);

describe('placa y datos del vehículo', () => {
  it.each([
    ['abc123', 'carro', 'ABC123'],
    [' abc-123 ', 'carro', 'ABC123'],
    ['abc 12d', 'moto', 'ABC12D'],
    ['ABC12', 'moto', 'ABC12'],
  ])('%s (%s) se normaliza a %s', (placa, tipo, esperada) => {
    expect(vehiculoNuevo.parse({ ...base, placa, tipo }).placa).toBe(esperada);
  });

  it.each([
    ['ABC12D', 'carro'],
    ['ABC12', 'carro'],
    ['AB1234', 'carro'],
    ['ABCD12', 'carro'],
    ['ABC123', 'moto'],
    ['12ABC', 'moto'],
  ])('%s no es válida para %s', (placa, tipo) => {
    expect(errores({ placa, tipo })?.[0][0]).toBe('placa');
  });

  it('la placa y el tipo son obligatorios, y una placa vacía da un solo error', () => {
    expect(errores({ placa: undefined })).toEqual([['placa', 'La placa es obligatoria']]);
    expect(errores({ placa: ' - ' })).toEqual([['placa', 'La placa es obligatoria']]);
    expect(errores({ tipo: 'bus' })).toEqual([['tipo', 'Indica si el vehículo es carro o moto']]);
  });

  it('marca y color son opcionales, y si llegan vacíos quedan nulos', () => {
    expect(vehiculoNuevo.parse({ ...base, marca: '  ', color: ' Rojo ' })).toMatchObject({ marca: null, color: 'Rojo' });
    expect(errores({ marca: 'x'.repeat(41) })?.[0][0]).toBe('marca');
  });
});

/** Consulta encadenable que registra sus filtros y resuelve con la respuesta indicada. */
function consulta(respuesta, filtros = {}) {
  const q = {
    eq: () => q,
    ilike: (c, v) => ((filtros.ilike = [c, v]), q),
    order: () => q,
    maybeSingle: () => q,
    then: (resolver, rechazar) => Promise.resolve(respuesta).then(resolver, rechazar),
  };
  return q;
}

async function ejecutar(controlador, req) {
  const res = { status: vi.fn(() => res), json: vi.fn() };
  const next = vi.fn();
  await controlador(req, res, next);
  return { res, datos: res.json.mock.calls[0]?.[0], error: next.mock.calls[0]?.[0] };
}

describe('POST /vehiculos', () => {
  const dueno = { data: { clientes: { id: OTRO, nombre: 'Ana' } }, error: null };
  const libre = { data: null, error: null };
  const registrar = (tenant) => ejecutar(crear, { tenant, body: { ...base, marca: 'Mazda', color: null } });

  function tenantCon({ consultas, crearVehiculo = async () => ({ id: 'v1' }) }) {
    const respuestas = [...consultas];
    return { obtener: vi.fn(async () => ({ id: CLIENTE })), listar: () => consulta(respuestas.shift()), crear: vi.fn(crearVehiculo) };
  }

  it('CA1: asocia el vehículo al cliente indicado', async () => {
    const tenant = tenantCon({ consultas: [libre] });
    const { res } = await registrar(tenant);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(tenant.crear).toHaveBeenCalledWith('vehiculos', { cliente_id: CLIENTE, placa: 'ABC123', tipo: 'carro', marca: 'Mazda', color: null });
  });

  it('un cliente de otro establecimiento responde 404 sin crear nada', async () => {
    const tenant = tenantCon({ consultas: [] });
    tenant.obtener = async () => {
      throw noEncontrado('Cliente');
    };
    const { error } = await registrar(tenant);
    expect(error).toMatchObject({ codigo: 'NO_ENCONTRADO', status: 404 });
    expect(tenant.crear).not.toHaveBeenCalled();
  });

  it('CA2: una placa existente responde CONFLICTO con su cliente y no intenta crear', async () => {
    const tenant = tenantCon({ consultas: [dueno] });
    const { error } = await registrar(tenant);
    expect(error).toMatchObject({ codigo: 'CONFLICTO', status: 409 });
    expect(error.detalles[0]).toEqual({ campo: 'placa', mensaje: 'La placa ya está registrada a nombre de Ana', clienteId: OTRO });
    expect(tenant.crear).not.toHaveBeenCalled();
  });

  it('CA2: en dos registros simultáneos, el rechazado por la base también recibe el cliente', async () => {
    const tenant = tenantCon({
      consultas: [libre, dueno],
      crearVehiculo: async () => {
        throw new AppError('CONFLICTO', 'El registro ya existe');
      },
    });
    const { error } = await registrar(tenant);
    expect(error.detalles[0]).toMatchObject({ campo: 'placa', clienteId: OTRO });
  });

  it('si falla la consulta de duplicados no intenta crear y propaga el error', async () => {
    const fallo = new Error('conexión rechazada');
    const tenant = tenantCon({ consultas: [{ data: null, error: fallo }] });
    const { error } = await registrar(tenant);
    expect(error).toBe(fallo);
    expect(tenant.crear).not.toHaveBeenCalled();
  });
});

describe('GET /vehiculos', () => {
  it('la búsqueda ignora guiones, espacios y comodines', async () => {
    const filtros = {};
    const tenant = { listar: () => consulta({ data: [], error: null }, filtros) };
    await ejecutar(listar, { tenant, query: { placa: 'ab-c%1' } });
    expect(filtros.ilike).toEqual(['placa', '%abc1%']);
  });

  it('un texto solo con caracteres especiales no devuelve todos los vehículos', async () => {
    const q = consulta({ data: [{ id: 'v1' }], error: null });
    const { datos } = await ejecutar(listar, { tenant: { listar: () => q }, query: { placa: '(*)' } });
    expect(datos).toEqual([]);
  });
});
