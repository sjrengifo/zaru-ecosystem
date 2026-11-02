// HU-03 CA3: teléfono repetido al registrar un cliente. No requiere Supabase: usa un req.tenant falso.
import { describe, it, expect, vi } from 'vitest';
import { crear } from '../../src/controllers/clientes.controller.js';
import { AppError } from '../../src/shared/errores.js';

const EXISTENTE = { id: 'cccccccc-0000-4000-8000-000000000003', nombre: 'Ana Gómez' };
const CREADO = { id: 'dddddddd-0000-4000-8000-000000000004', nombre: 'Luis', correo: null };

/** Ejecuta el controlador con las respuestas indicadas para cada consulta por teléfono y para la función SQL. */
async function registrar({ consultas, rpc }) {
  const respuestas = [...consultas];
  const tenant = {
    listar: () => ({ eq: () => ({ maybeSingle: async () => respuestas.shift() }) }),
    rpc: vi.fn(rpc),
  };
  const req = {
    tenant,
    ctx: { usuarioId: 'u1' },
    ip: '127.0.0.1',
    body: { nombre: 'Luis', telefono: '3001234567', autorizacionDatos: true, politicaVersion: '1.0' },
  };
  const res = { status: vi.fn(() => res), json: vi.fn() };
  const next = vi.fn();
  await crear(req, res, next);
  return { tenant, res, error: next.mock.calls[0]?.[0] };
}

const libre = { data: null, error: null };

describe('POST /clientes: teléfono repetido', () => {
  it('sin duplicado crea el cliente', async () => {
    const { res, error } = await registrar({ consultas: [libre], rpc: async () => [CREADO] });
    expect(error).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('un teléfono existente responde CONFLICTO con el cliente y no intenta crear', async () => {
    const { tenant, error } = await registrar({ consultas: [{ data: EXISTENTE, error: null }], rpc: async () => [CREADO] });
    expect(error).toMatchObject({ codigo: 'CONFLICTO', status: 409 });
    expect(error.detalles[0]).toMatchObject({ campo: 'telefono', clienteId: EXISTENTE.id });
    expect(tenant.rpc).not.toHaveBeenCalled();
  });

  it('si falla la consulta de duplicados no intenta crear y propaga el error', async () => {
    const fallo = new Error('conexión rechazada');
    const { tenant, error } = await registrar({ consultas: [{ data: null, error: fallo }], rpc: async () => [CREADO] });
    expect(error).toBe(fallo);
    expect(tenant.rpc).not.toHaveBeenCalled();
  });

  it('en dos registros simultáneos, el rechazado por la base también recibe el cliente existente', async () => {
    const { error } = await registrar({
      consultas: [libre, { data: EXISTENTE, error: null }],
      rpc: async () => {
        throw new AppError('CONFLICTO', 'El registro ya existe');
      },
    });
    expect(error.detalles[0]).toMatchObject({ campo: 'telefono', clienteId: EXISTENTE.id });
  });

  it('una política que ya no es la vigente conserva su propio error', async () => {
    const politica = new AppError('CONFLICTO', 'La versión no es la vigente', [{ campo: 'politicaVersion', mensaje: 'La versión no es la vigente' }]);
    const { error } = await registrar({
      consultas: [libre, libre],
      rpc: async () => {
        throw politica;
      },
    });
    expect(error).toBe(politica);
  });
});
