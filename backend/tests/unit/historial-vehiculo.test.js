// HU-06: historial de servicios de un vehículo. No requiere Supabase: usa un req.tenant falso.
import { describe, it, expect, vi } from 'vitest';
import { historial } from '../../src/controllers/vehiculos.controller.js';
import { noEncontrado } from '../../src/shared/errores.js';

const ID = 'cccccccc-0000-4000-8000-000000000003';

function tenantCon(respuesta, filtros = []) {
  const q = {
    eq: (columna, valor) => (filtros.push([columna, valor]), q),
    then: (resolver, rechazar) => Promise.resolve(respuesta).then(resolver, rechazar),
  };
  return { obtener: vi.fn(async () => ({ id: ID })), listar: vi.fn(() => q) };
}

async function consultar(tenant) {
  const res = { json: vi.fn() };
  const next = vi.fn();
  await historial({ tenant, params: { id: ID } }, res, next);
  return { datos: res.json.mock.calls[0]?.[0], error: next.mock.calls[0]?.[0] };
}

const orden = (id, entregada_at, created_at, nombre, precio) => ({
  id,
  entregada_at,
  created_at,
  subtotal: precio,
  descuento: 0,
  total: precio,
  orden_servicios: [{ precio, servicios: { nombre } }],
});

describe('GET /vehiculos/:id/historial', () => {
  it('CA1: devuelve fecha, servicio y valor, de la más reciente a la más antigua', async () => {
    const tenant = tenantCon({
      data: [orden('a', '2026-09-01T10:00:00Z', '2026-09-01T09:00:00Z', 'Básico', 25000), orden('b', '2026-10-01T10:00:00Z', '2026-10-01T09:00:00Z', 'Premium', 45000)],
      error: null,
    });
    const { datos } = await consultar(tenant);
    expect(datos.map((o) => o.ordenId)).toEqual(['b', 'a']);
    expect(datos[0]).toEqual({ ordenId: 'b', fecha: '2026-10-01T10:00:00Z', servicios: [{ nombre: 'Premium', precio: 45000 }], subtotal: 45000, descuento: 0, total: 45000 });
  });

  it('solo consulta órdenes entregadas de ese vehículo', async () => {
    const filtros = [];
    await consultar(tenantCon({ data: [], error: null }, filtros));
    expect(filtros).toEqual([['vehiculo_id', ID], ['estado', 'entregado']]);
  });

  it('una orden entregada sin fecha de entrega usa su fecha de creación', async () => {
    const { datos } = await consultar(tenantCon({ data: [orden('a', null, '2026-09-01T09:00:00Z', 'Básico', 25000)], error: null }));
    expect(datos[0].fecha).toBe('2026-09-01T09:00:00Z');
  });

  it('CA2: sin servicios previos responde una lista vacía', async () => {
    const { datos, error } = await consultar(tenantCon({ data: [], error: null }));
    expect(datos).toEqual([]);
    expect(error).toBeUndefined();
  });

  it('un vehículo de otro establecimiento responde 404 sin consultar órdenes', async () => {
    const tenant = tenantCon({ data: [], error: null });
    tenant.obtener = async () => {
      throw noEncontrado('Vehículo');
    };
    const { error } = await consultar(tenant);
    expect(error).toMatchObject({ codigo: 'NO_ENCONTRADO', status: 404 });
    expect(tenant.listar).not.toHaveBeenCalled();
  });

  it('un error de la consulta se propaga', async () => {
    const fallo = new Error('conexión rechazada');
    const { error } = await consultar(tenantCon({ data: null, error: fallo }));
    expect(error).toBe(fallo);
  });
});
