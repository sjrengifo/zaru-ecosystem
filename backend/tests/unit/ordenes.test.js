// HU-08, HU-10 y HU-46 — Controlador de órdenes: el correo se dispara en el momento correcto y
// nunca bloquea ni revierte la operación del operario.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { crearTenantFalso, ejecutar } from '../helpers/tenantFalso.js';

const { prepararCorreo, enSegundoPlano } = vi.hoisted(() => ({
  prepararCorreo: vi.fn(),
  enSegundoPlano: vi.fn(),
}));
vi.mock('../../src/shared/notificaciones.js', () => ({
  prepararCorreo,
  enSegundoPlano,
  EVENTOS: { RECIBIDA: 'orden.recibida', LISTA: 'orden.lista' },
}));

const { crear, cambiarEstado, listarActivas, SIGUIENTE_ESTADO } = await import('../../src/controllers/ordenes.controller.js');
const { ordenNueva, cambioEstado } = await import('../../src/schemas/ordenes.schemas.js');

const VEHICULO_ID = 'aaaaaaaa-0000-4000-8000-00000000000a';
const S1 = 'bbbbbbbb-0000-4000-8000-00000000000b';
const S2 = 'cccccccc-0000-4000-8000-00000000000c';
const ORDEN_ID = 'dddddddd-0000-4000-8000-00000000000d';
const ctx = { usuarioId: 'ffffffff-0000-4000-8000-00000000000f', rol: 'operario' };

const enviar = vi.fn();
beforeEach(() => {
  prepararCorreo.mockReset().mockResolvedValue({ resumen: { canal: 'correo', estado: 'pendiente', destino: 'l***@x.co' }, enviar });
  enSegundoPlano.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

function tenantParaCrear({ activa = [], servicios } = {}) {
  const tenant = crearTenantFalso({
    ordenes: [{ data: activa, error: null }],
    servicios: [{ data: servicios ?? [
      { id: S1, nombre: 'Lavado', precio: '30000.00', duracion_min: 30, activo: true },
      { id: S2, nombre: 'Encerado', precio: '15000.00', duracion_min: 20, activo: true },
    ], error: null }],
  });
  tenant.obtener.mockResolvedValue({ id: VEHICULO_ID, placa: 'ABC123', tipo: 'carro' });
  tenant.crear.mockImplementation(async (tabla, valores) => ({ id: ORDEN_ID, created_at: '2026-11-03T15:00:00Z', ...valores }));
  return tenant;
}

describe('HU-08 + HU-46 CA1 · registrar ingreso', () => {
  it('crea la orden en "recibido" con el total de los servicios y prepara el correo de ingreso', async () => {
    const tenant = tenantParaCrear();
    const { res, error } = await ejecutar(crear, { tenant, ctx, body: { vehiculoId: VEHICULO_ID, servicios: [S1, S2] } });

    expect(error).toBeUndefined();
    expect(res.statusCode).toBe(201);
    expect(tenant.crear).toHaveBeenCalledWith('ordenes', expect.objectContaining({
      vehiculo_id: VEHICULO_ID, estado: 'recibido', subtotal: 45000, descuento: 0, total: 45000, creada_por: ctx.usuarioId,
    }), expect.any(String));
    // HU-07 CA2: guarda precio y duración del momento.
    expect(tenant.crearDetalle).toHaveBeenCalledWith('orden_servicios', expect.objectContaining({ id: ORDEN_ID }), [
      { servicio_id: S1, precio: '30000.00', duracion_min: 30 },
      { servicio_id: S2, precio: '15000.00', duracion_min: 20 },
    ], 'servicio_id');
    // HU-10 CA1: primer registro del historial.
    expect(tenant.crearDetalle).toHaveBeenCalledWith('historial_estados', expect.anything(), { estado: 'recibido', usuario_id: ctx.usuarioId }, 'id');

    expect(prepararCorreo).toHaveBeenCalledWith(tenant, { evento: 'orden.recibida', ordenId: ORDEN_ID });
    expect(res.body.notificacion).toEqual({ canal: 'correo', estado: 'pendiente', destino: 'l***@x.co' });
    expect(res.body.servicios.map((s) => s.nombre)).toEqual(['Lavado', 'Encerado']);
  });

  it('CA3: el correo se envía en segundo plano DESPUÉS de responder al operario', async () => {
    const tenant = tenantParaCrear();
    const orden = [];
    const { res } = await ejecutar(crear, { tenant, ctx, body: { vehiculoId: VEHICULO_ID, servicios: [S1, S2] } });
    orden.push(res.json.mock.invocationCallOrder[0], enSegundoPlano.mock.invocationCallOrder[0]);

    expect(enSegundoPlano).toHaveBeenCalledWith(enviar);
    expect(orden[0]).toBeLessThan(orden[1]);
  });

  it('CA3: si el cliente no tiene correo la orden se crea igual y se informa el motivo', async () => {
    prepararCorreo.mockResolvedValue({ resumen: { canal: 'correo', estado: 'omitida', motivo: 'sin_correo' }, enviar });
    const tenant = tenantParaCrear();
    const { res, error } = await ejecutar(crear, { tenant, ctx, body: { vehiculoId: VEHICULO_ID, servicios: [S1, S2] } });

    expect(error).toBeUndefined();
    expect(res.statusCode).toBe(201);
    expect(res.body.notificacion).toMatchObject({ estado: 'omitida', motivo: 'sin_correo' });
  });

  it('rechaza servicios desactivados o de otro establecimiento', async () => {
    const tenant = tenantParaCrear({ servicios: [{ id: S1, nombre: 'Lavado', precio: 1, duracion_min: 1, activo: false }] });
    const { error } = await ejecutar(crear, { tenant, ctx, body: { vehiculoId: VEHICULO_ID, servicios: [S1, S2] } });
    expect(error.codigo).toBe('VALIDACION');
    expect(tenant.crear).not.toHaveBeenCalled();
    expect(prepararCorreo).not.toHaveBeenCalled();
  });

  it('no permite una segunda orden en curso para el mismo vehículo', async () => {
    const tenant = tenantParaCrear({ activa: [{ id: ORDEN_ID }] });
    const { error } = await ejecutar(crear, { tenant, ctx, body: { vehiculoId: VEHICULO_ID, servicios: [S1] } });
    expect(error.codigo).toBe('CONFLICTO');
    expect(error.message).toContain('ABC123');
  });

  it('si no se pueden guardar los servicios, borra la orden y no envía correo', async () => {
    const tenant = tenantParaCrear();
    tenant.crearDetalle.mockRejectedValueOnce(new Error('fallo'));
    const { error } = await ejecutar(crear, { tenant, ctx, body: { vehiculoId: VEHICULO_ID, servicios: [S1, S2] } });
    expect(error).toBeDefined();
    expect(tenant.eliminar).toHaveBeenCalledWith('ordenes', ORDEN_ID, 'Orden');
    expect(prepararCorreo).not.toHaveBeenCalled();
  });

  it('valida la petición: vehículo y al menos un servicio, sin repetidos', () => {
    expect(ordenNueva.safeParse({ vehiculoId: VEHICULO_ID, servicios: [] }).success).toBe(false);
    expect(ordenNueva.safeParse({ servicios: [S1] }).success).toBe(false);
    expect(ordenNueva.parse({ vehiculoId: VEHICULO_ID, servicios: [S1, S1] }).servicios).toEqual([S1]);
  });
});

describe('HU-10 + HU-46 CA2 · cambiar estado', () => {
  function tenantEn(estado) {
    const tenant = crearTenantFalso();
    tenant.obtener.mockResolvedValue({ id: ORDEN_ID, estado });
    tenant.actualizar.mockImplementation(async (tabla, id, cambios) => ({ id, total: 45000, ...cambios }));
    return tenant;
  }

  it('sigue la secuencia recibido → en_lavado → listo → entregado', () => {
    expect(SIGUIENTE_ESTADO).toEqual({ recibido: 'en_lavado', en_lavado: 'listo', listo: 'entregado' });
    expect(cambioEstado.safeParse({ estado: 'lavando' }).success).toBe(false);
  });

  it('CA2: al pasar a "listo" prepara el aviso para recoger y lo envía en segundo plano', async () => {
    const tenant = tenantEn('en_lavado');
    const { res, error } = await ejecutar(cambiarEstado, { tenant, ctx, params: { id: ORDEN_ID }, body: { estado: 'listo' } });

    expect(error).toBeUndefined();
    expect(res.body).toMatchObject({ id: ORDEN_ID, estado: 'listo', notificacion: { estado: 'pendiente' } });
    expect(prepararCorreo).toHaveBeenCalledWith(tenant, { evento: 'orden.lista', ordenId: ORDEN_ID });
    expect(enSegundoPlano).toHaveBeenCalledWith(enviar);
    // Bloqueo optimista: solo actualiza si sigue en el estado leído.
    expect(tenant.actualizar).toHaveBeenCalledWith('ordenes', ORDEN_ID, expect.objectContaining({ estado: 'listo' }), expect.any(String), 'Orden', { estado: 'en_lavado' });
    expect(tenant.crearDetalle).toHaveBeenCalledWith('historial_estados', expect.anything(), { estado: 'listo', usuario_id: ctx.usuarioId }, 'id');
  });

  it('los demás cambios de estado no envían correo', async () => {
    for (const [desde, hacia] of [['recibido', 'en_lavado'], ['listo', 'entregado']]) {
      prepararCorreo.mockClear();
      const { res } = await ejecutar(cambiarEstado, { tenant: tenantEn(desde), ctx, params: { id: ORDEN_ID }, body: { estado: hacia } });
      expect(res.body.notificacion).toBeNull();
      expect(prepararCorreo).not.toHaveBeenCalled();
    }
  });

  it('al entregar guarda la fecha de entrega (queda en el historial del vehículo)', async () => {
    const tenant = tenantEn('listo');
    await ejecutar(cambiarEstado, { tenant, ctx, params: { id: ORDEN_ID }, body: { estado: 'entregado' } });
    expect(tenant.actualizar.mock.calls[0][2]).toHaveProperty('entregada_at');
  });

  it('CA3: si falla el correo de "listo", el cambio de estado se guarda y responde 200', async () => {
    prepararCorreo.mockResolvedValue({ resumen: { canal: 'correo', estado: 'error', motivo: 'preparacion' }, enviar });
    const tenant = tenantEn('en_lavado');
    const { res, error } = await ejecutar(cambiarEstado, { tenant, ctx, params: { id: ORDEN_ID }, body: { estado: 'listo' } });
    expect(error).toBeUndefined();
    expect(res.statusCode).toBe(200);
    expect(res.body.estado).toBe('listo');
  });

  it('no permite saltar estados', async () => {
    const tenant = tenantEn('recibido');
    const { error } = await ejecutar(cambiarEstado, { tenant, ctx, params: { id: ORDEN_ID }, body: { estado: 'listo' } });
    expect(error.codigo).toBe('VALIDACION');
    expect(tenant.actualizar).not.toHaveBeenCalled();
  });

  it('una orden entregada ya no cambia', async () => {
    const { error } = await ejecutar(cambiarEstado, { tenant: tenantEn('entregado'), ctx, params: { id: ORDEN_ID }, body: { estado: 'listo' } });
    expect(error.codigo).toBe('CONFLICTO');
  });

  it('si otro operario la movió al mismo tiempo, responde conflicto en lugar de pisar el cambio', async () => {
    const tenant = tenantEn('en_lavado');
    const { noEncontrado } = await import('../../src/shared/errores.js');
    tenant.actualizar.mockRejectedValue(noEncontrado('Orden'));
    const { error } = await ejecutar(cambiarEstado, { tenant, ctx, params: { id: ORDEN_ID }, body: { estado: 'listo' } });
    expect(error.codigo).toBe('CONFLICTO');
    expect(prepararCorreo).not.toHaveBeenCalled();
  });
});

describe('HU-09 + HU-46 · órdenes activas', () => {
  it('informa si el cliente tiene correo y el estado de cada correo, sin exponer la dirección', async () => {
    const tenant = crearTenantFalso({
      ordenes: [{ data: [{
        id: ORDEN_ID, estado: 'listo', estado_desde: 'x', created_at: 'y', subtotal: 1, descuento: 0, total: 1,
        vehiculos: { id: VEHICULO_ID, placa: 'ABC123', tipo: 'carro', clientes: { id: 'c1', nombre: 'Ana', correo: 'v1:cifrado' } },
        orden_servicios: [{ precio: 1, duracion_min: 30, servicios: { nombre: 'Lavado' } }],
      }], error: null }],
      notificaciones: [{ data: [
        { orden_id: ORDEN_ID, evento: 'orden.recibida', estado: 'enviada' },
        { orden_id: ORDEN_ID, evento: 'orden.lista', estado: 'fallida' },
      ], error: null }],
    });

    const { res } = await ejecutar(listarActivas, { tenant, ctx });

    expect(res.body[0].cliente).toEqual({ id: 'c1', nombre: 'Ana', tieneCorreo: true });
    expect(res.body[0].correos).toEqual({ 'orden.recibida': 'enviada', 'orden.lista': 'fallida' });
    expect(JSON.stringify(res.body)).not.toContain('v1:cifrado');
    expect(tenant.consultas[0].filtros).toContainEqual(['neq', 'estado', 'entregado']);
  });
});
