// HU-52: eliminar un cliente. No requiere Supabase: usa un req.tenant falso.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/shared/auditoria.js', () => ({ registrarAuditoria: vi.fn(async () => {}) }));

const { eliminar } = await import('../../src/controllers/clientes.controller.js');
const { registrarAuditoria } = await import('../../src/shared/auditoria.js');
const { noEncontrado } = await import('../../src/shared/errores.js');

const ID = 'cccccccc-0000-4000-8000-000000000003';

async function ejecutar(tenant) {
  const res = { status: vi.fn(() => res), end: vi.fn() };
  const next = vi.fn();
  await eliminar({ tenant, params: { id: ID } }, res, next);
  return { res, error: next.mock.calls[0]?.[0] };
}

const tenantCon = (rpc) => ({ obtener: vi.fn(async () => ({ id: ID })), rpc: vi.fn(rpc) });

describe('DELETE /clientes/:id', () => {
  it('responde 204 y audita solo cantidades, sin datos personales', async () => {
    registrarAuditoria.mockClear();
    const tenant = tenantCon(async () => ({ resultado: 'eliminado', vehiculos: 2, ordenes: 1 }));
    const { res, error } = await ejecutar(tenant);
    expect(error).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(204);
    expect(tenant.rpc).toHaveBeenCalledWith('eliminar_cliente', { p_cliente_id: ID });
    expect(registrarAuditoria.mock.calls[0][1]).toEqual({ accion: 'ELIMINAR_CLIENTE', resultado: 'permitido', detalle: { vehiculos: 2, ordenesConservadas: 1 } });
  });

  it('un cliente de otro establecimiento responde 404 sin intentar borrar', async () => {
    const tenant = tenantCon(async () => ({}));
    tenant.obtener = async () => {
      throw noEncontrado('Cliente');
    };
    const { error } = await ejecutar(tenant);
    expect(error).toMatchObject({ codigo: 'NO_ENCONTRADO', status: 404 });
    expect(tenant.rpc).not.toHaveBeenCalled();
  });

  it('si otro usuario lo borró primero responde 404 y no audita', async () => {
    registrarAuditoria.mockClear();
    const { error } = await ejecutar(tenantCon(async () => ({ resultado: 'no_encontrado' })));
    expect(error).toMatchObject({ codigo: 'NO_ENCONTRADO', status: 404 });
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });

  it('con un servicio en curso responde 409 y no audita una eliminación', async () => {
    registrarAuditoria.mockClear();
    const { error } = await ejecutar(tenantCon(async () => ({ resultado: 'servicios_en_curso' })));
    expect(error).toMatchObject({ codigo: 'CONFLICTO', status: 409 });
    expect(error.message).toMatch(/servicio en curso/);
    expect(registrarAuditoria).not.toHaveBeenCalled();
  });

  it('sin la migración aplicada responde 501 con un mensaje claro', async () => {
    const { error } = await ejecutar(
      tenantCon(async () => {
        throw { code: 'PGRST202' };
      }),
    );
    expect(error).toMatchObject({ codigo: 'NO_IMPLEMENTADO', status: 501 });
  });

  it('otro error de la base se propaga', async () => {
    const fallo = new Error('conexión rechazada');
    const { error } = await ejecutar(
      tenantCon(async () => {
        throw fallo;
      }),
    );
    expect(error).toBe(fallo);
  });
});
