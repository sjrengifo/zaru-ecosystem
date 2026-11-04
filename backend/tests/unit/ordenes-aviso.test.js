// HU-46: el controlador de órdenes avisa al cliente al registrar el ingreso y al pasar a "Listo",
// después de responder (CA3: el aviso no bloquea ni cambia la respuesta).
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.ZARU_CLAVE_CIFRADO ||= Buffer.alloc(32).toString('base64');

const programarNotificacion = vi.fn(async () => ({ estado: 'enviada' }));
vi.mock('../../src/shared/notificaciones.js', () => ({ programarNotificacion: (...a) => programarNotificacion(...a) }));

const { crear, cambiarEstado } = await import('../../src/controllers/ordenes.controller.js');

const ORDEN_ID = '55555555-5555-4555-8555-555555555555';
const VEHICULO = '11111111-1111-4111-8111-111111111111';

function tenantCon(estado) {
  return {
    obtener: vi.fn(async (tabla) => (tabla === 'ordenes' ? { id: ORDEN_ID, estado, servicios: [] } : { id: VEHICULO })),
    rpc: vi.fn(async () => ORDEN_ID),
  };
}

async function ejecutar(accion, req) {
  const res = { status: vi.fn(() => res), json: vi.fn() };
  const next = vi.fn();
  await accion(req, res, next);
  return { res, next };
}

beforeEach(() => programarNotificacion.mockClear());

describe('avisos de HU-46 desde las órdenes', () => {
  it('CA1: al crear la orden responde 201 y programa el aviso de ingreso', async () => {
    const tenant = tenantCon('recibido');
    const { res } = await ejecutar(crear, { tenant, ctx: { usuarioId: 'u1' }, body: { vehiculoId: VEHICULO, servicioIds: ['s1'] } });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(programarNotificacion).toHaveBeenCalledWith(tenant, ORDEN_ID, 'ingreso');
  });

  it('CA2: al pasar a "Listo" programa el aviso de listo', async () => {
    const tenant = tenantCon('listo');
    await ejecutar(cambiarEstado, { tenant, ctx: { usuarioId: 'u1' }, params: { id: ORDEN_ID }, body: { estado: 'listo' } });
    expect(programarNotificacion).toHaveBeenCalledWith(tenant, ORDEN_ID, 'listo');
  });

  it('no avisa en otros estados ni al revertir', async () => {
    await ejecutar(cambiarEstado, { tenant: tenantCon('en_lavado'), ctx: { usuarioId: 'u1' }, params: { id: ORDEN_ID }, body: { estado: 'en_lavado' } });
    await ejecutar(cambiarEstado, { tenant: tenantCon('listo'), ctx: { usuarioId: 'u1' }, params: { id: ORDEN_ID }, body: { revertir: true } });
    expect(programarNotificacion).not.toHaveBeenCalled();
  });

  it('CA3: si el aviso falla, la respuesta ya se envió y no hay error', async () => {
    programarNotificacion.mockRejectedValueOnce(new Error('SMTP caído'));
    const { res, next } = await ejecutar(cambiarEstado, { tenant: tenantCon('listo'), ctx: { usuarioId: 'u1' }, params: { id: ORDEN_ID }, body: { estado: 'listo' } });
    expect(res.json).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});
