// HU-04: búsqueda y edición de clientes. No requiere Supabase: usa un req.tenant falso.
import { describe, it, expect, vi } from 'vitest';
import { listar, actualizar } from '../../src/controllers/clientes.controller.js';
import { AppError } from '../../src/shared/errores.js';

const ID = 'cccccccc-0000-4000-8000-000000000003';
const OTRO = 'dddddddd-0000-4000-8000-000000000004';
const ANA = { id: ID, nombre: 'Ana', telefono: '3001234567', correo: null, vehiculos: [] };

/** Consulta encadenable que registra sus filtros y resuelve con la respuesta indicada. */
function consulta(respuesta, filtros = {}) {
  const q = {
    eq: () => q,
    or: (f) => ((filtros.or = f), q),
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
  return { datos: res.json.mock.calls[0]?.[0], error: next.mock.calls[0]?.[0] };
}

describe('GET /clientes', () => {
  it('sin texto lista todo sin usar la función de búsqueda', async () => {
    const tenant = { listar: vi.fn(() => consulta({ data: [ANA], error: null })), consultarFuncion: vi.fn() };
    const { datos } = await ejecutar(listar, { tenant, query: {} });
    expect(datos).toEqual([ANA]);
    expect(tenant.consultarFuncion).not.toHaveBeenCalled();
  });

  it('con texto usa la función de búsqueda', async () => {
    const tenant = { listar: vi.fn(), consultarFuncion: vi.fn(() => consulta({ data: [ANA], error: null })) };
    const { datos } = await ejecutar(listar, { tenant, query: { buscar: 'jose' } });
    expect(datos).toEqual([ANA]);
    expect(tenant.consultarFuncion.mock.calls[0][1]).toEqual({ p_texto: 'jose' });
    expect(tenant.listar).not.toHaveBeenCalled();
  });

  it('un error de la función se propaga', async () => {
    const fallo = { code: 'XX000', message: 'fallo' };
    const tenant = { consultarFuncion: () => consulta({ data: null, error: fallo }) };
    const { error } = await ejecutar(listar, { tenant, query: { buscar: 'jose' } });
    expect(error).toBe(fallo);
  });

  describe('sin la migración aplicada', () => {
    const sinFuncion = () => consulta({ data: null, error: { code: 'PGRST202' } });

    it('busca también por la placa normalizada y suma esos clientes', async () => {
      const filtrosVehiculos = {};
      const filtrosClientes = {};
      const tenant = {
        consultarFuncion: sinFuncion,
        listar: (tabla) =>
          tabla === 'vehiculos' ? consulta({ data: [{ cliente_id: ID }], error: null }, filtrosVehiculos) : consulta({ data: [ANA], error: null }, filtrosClientes),
      };
      const { datos } = await ejecutar(listar, { tenant, query: { buscar: 'abc-123' } });
      expect(datos).toEqual([ANA]);
      expect(filtrosVehiculos.ilike).toEqual(['placa', '%abc123%']);
      expect(filtrosClientes.or).toBe(`nombre.ilike.%abc-123%,telefono.ilike.%abc123%,id.in.(${ID})`);
    });

    it('un texto solo con caracteres especiales no devuelve todos los clientes', async () => {
      const tenant = { consultarFuncion: sinFuncion, listar: vi.fn() };
      const { datos } = await ejecutar(listar, { tenant, query: { buscar: '(*)' } });
      expect(datos).toEqual([]);
      expect(tenant.listar).not.toHaveBeenCalled();
    });
  });
});

describe('PUT /clientes/:id', () => {
  const editar = (tenant, body) => ejecutar(actualizar, { tenant, params: { id: ID }, body });
  const conflicto = async () => {
    throw new AppError('CONFLICTO', 'El registro ya existe');
  };

  it('guarda los cambios y responde el cliente', async () => {
    const tenant = { actualizar: vi.fn(async () => ANA) };
    const { datos } = await editar(tenant, { nombre: 'Ana' });
    expect(datos).toEqual(ANA);
    expect(tenant.actualizar.mock.calls[0][2]).toMatchObject({ nombre: 'Ana' });
  });

  it('un teléfono de otro cliente responde CONFLICTO con ese cliente', async () => {
    const tenant = { actualizar: conflicto, listar: () => consulta({ data: { id: OTRO, nombre: 'Luis' }, error: null }) };
    const { error } = await editar(tenant, { telefono: '3009998888' });
    expect(error).toMatchObject({ codigo: 'CONFLICTO', status: 409 });
    expect(error.detalles[0]).toMatchObject({ campo: 'telefono', clienteId: OTRO });
  });

  it('un conflicto que no es por el teléfono conserva su error', async () => {
    const tenant = { actualizar: conflicto, listar: vi.fn() };
    const { error } = await editar(tenant, { nombre: 'Ana' });
    expect(error.message).toBe('El registro ya existe');
    expect(error.detalles).toBeUndefined();
    expect(tenant.listar).not.toHaveBeenCalled();
  });

  it('si falla la consulta del dueño del teléfono se propaga ese error', async () => {
    const fallo = new Error('conexión rechazada');
    const tenant = { actualizar: conflicto, listar: () => consulta({ data: null, error: fallo }) };
    const { error } = await editar(tenant, { telefono: '3009998888' });
    expect(error).toBe(fallo);
  });
});
