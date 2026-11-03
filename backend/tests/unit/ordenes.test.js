// HU-08: validación del ingreso y creación de la orden. No requiere Supabase: usa un req.tenant falso.
import { describe, it, expect, vi } from 'vitest';

process.env.ZARU_CLAVE_CIFRADO ||= Buffer.alloc(32).toString('base64');

import { cambioEstadoOrden, ordenNueva } from '../../src/schemas/ordenes.schemas.js';
import { cambiarEstado, crear } from '../../src/controllers/ordenes.controller.js';
import { AppError, noEncontrado } from '../../src/shared/errores.js';
import { descifrar } from '../../src/shared/cifrado.js';

const VEHICULO = '11111111-1111-4111-8111-111111111111';
const SERVICIO_1 = '22222222-2222-4222-8222-222222222222';
const SERVICIO_2 = '33333333-3333-4333-8333-333333333333';
const CLIENTE_EXISTENTE = '44444444-4444-4444-8444-444444444444';

const base = { vehiculoId: VEHICULO, servicioIds: [SERVICIO_1] };

const errores = (datos) => ordenNueva.safeParse({ ...base, ...datos }).error?.issues.map((i) => [i.path.join('.'), i.message]);

const cliente = {
  nombre: 'Ana Gómez',
  telefono: '3001234567',
  correo: 'ana@example.com',
  autorizacionDatos: true,
  politicaVersion: '1.1',
};
const vehiculo = { placa: 'xyz-987', tipo: 'carro', marca: 'Mazda', color: 'Rojo' };

const ORDEN = {
  id: '55555555-5555-4555-8555-555555555555',
  estado: 'recibido',
  subtotal: 55000,
  descuento: 0,
  total: 55000,
  codigo_seguimiento: 'ABCDEFGHJK',
  entrega_estimada_at: '2026-11-02T15:10:00.000Z',
  observaciones: null,
  created_at: '2026-11-02T14:00:00.000Z',
  entregada_at: null,
  vehiculo: { id: VEHICULO, placa: 'XYZ987', tipo: 'carro', marca: 'Mazda', color: 'Rojo', cliente: { id: 'c1', nombre: 'Ana Gómez' } },
  servicios: [
    { precio: 25000, duracion_min: 30, descuento: 0, servicio: { id: SERVICIO_1, nombre: 'Lavado básico' } },
    { precio: 30000, duracion_min: 40, descuento: 0, servicio: { id: SERVICIO_2, nombre: 'Lavado de motor' } },
  ],
  promocion: null,
};

/** Consulta encadenable mínima para el patrón `.eq(...).maybeSingle()` del controlador. */
function consulta(respuesta) {
  const q = { eq: () => q, maybeSingle: async () => respuesta };
  return q;
}

function tenantCon({ rpc = async () => ORDEN.id, consultas = [], detalle = ORDEN } = {}) {
  const respuestas = [...consultas];
  const tenant = {
    obtener: vi.fn(async (tabla) => (tabla === 'ordenes' ? detalle : { id: tabla === 'vehiculos' ? VEHICULO : 'c1' })),
    listar: vi.fn(() => consulta(respuestas.shift())),
    rpc: vi.fn(async (funcion, argumentos) => rpc(funcion, argumentos)),
  };
  return tenant;
}

async function ejecutar(req) {
  const res = { status: vi.fn(() => res), json: vi.fn() };
  const next = vi.fn();
  await crear(req, res, next);
  return { res, datos: res.json.mock.calls[0]?.[0], error: next.mock.calls[0]?.[0] };
}

// En la API el middleware `validar({ body: ordenNueva })` limpia y normaliza el cuerpo antes del controlador.
const peticion = (cuerpo, tenant) => ({
  tenant,
  ctx: { usuarioId: 'p1' },
  ip: '127.0.0.1',
  body: ordenNueva.parse(cuerpo),
});

describe('esquema de la orden', () => {
  it('acepta un vehículo registrado y elimina servicios repetidos', () => {
    const datos = ordenNueva.parse({ ...base, servicioIds: [SERVICIO_1, SERVICIO_1, SERVICIO_2], observaciones: '  ' });
    expect(datos.servicioIds).toEqual([SERVICIO_1, SERVICIO_2]);
    expect(datos.observaciones).toBeNull();
  });

  it('acepta el alta de cliente y vehículo y normaliza la placa', () => {
    const datos = ordenNueva.parse({ servicioIds: [SERVICIO_1], nuevoVehiculo: { cliente, vehiculo } });
    expect(datos.nuevoVehiculo.vehiculo.placa).toBe('XYZ987');
  });

  it('exige exactamente una forma de indicar el vehículo', () => {
    expect(errores({ vehiculoId: undefined })[0][0]).toBe('vehiculoId');
    expect(errores({ nuevoVehiculo: { cliente, vehiculo } })[0][1]).toContain('no ambos');
  });

  it('exige al menos un servicio y un UUID válido', () => {
    expect(errores({ servicioIds: [] })[0][0]).toBe('servicioIds');
    expect(errores({ servicioIds: ['no-es-id'] })[0][0]).toBe('servicioIds.0');
  });

  it('exige la autorización y una placa válida en el vehículo nuevo', () => {
    expect(errores({ vehiculoId: undefined, nuevoVehiculo: { cliente: { ...cliente, autorizacionDatos: false }, vehiculo } })[0][0]).toBe(
      'nuevoVehiculo.cliente.autorizacionDatos',
    );
    expect(errores({ vehiculoId: undefined, nuevoVehiculo: { cliente, vehiculo: { ...vehiculo, placa: 'ABC12D' } } })[0][0]).toBe(
      'nuevoVehiculo.vehiculo.placa',
    );
  });
});

describe('POST /ordenes', () => {
  it('CA1: crea la orden de un vehículo registrado y devuelve total, código y entrega estimada', async () => {
    const tenant = tenantCon();
    const { res, datos, error } = await ejecutar(peticion({ ...base, observaciones: 'Rayón en la puerta' }, tenant));

    expect(error).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(datos).toMatchObject({ estado: 'recibido', total: 55000, codigoSeguimiento: 'ABCDEFGHJK' });
    expect(datos.servicios[0]).toEqual({ id: SERVICIO_1, nombre: 'Lavado básico', precio: 25000, duracionMin: 30, descuento: 0 });
    expect(tenant.obtener).toHaveBeenNthCalledWith(1, 'vehiculos', VEHICULO, 'id', 'Vehículo');
    expect(tenant.rpc).toHaveBeenCalledWith('crear_orden', {
      p_vehiculo_id: VEHICULO,
      p_servicio_ids: [SERVICIO_1],
      p_observaciones: 'Rayón en la puerta',
      p_creada_por: 'p1',
      p_cliente: null,
      p_vehiculo: null,
    });
  });

  it('CA2: con placa nueva cifra el correo y envía cliente y vehículo a la misma función', async () => {
    const tenant = tenantCon();
    const { res, error } = await ejecutar(peticion({ servicioIds: [SERVICIO_1], nuevoVehiculo: { cliente, vehiculo } }, tenant));

    expect(error).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(tenant.obtener).toHaveBeenCalledTimes(1); // Solo se consulta la orden creada; no hay vehículo previo.
    const [, argumentos] = tenant.rpc.mock.calls[0];
    expect(argumentos.p_vehiculo_id).toBeNull();
    expect(argumentos.p_vehiculo).toEqual({ placa: 'XYZ987', tipo: 'carro', marca: 'Mazda', color: 'Rojo' });
    expect(argumentos.p_cliente.correo).not.toBe(cliente.correo);
    expect(descifrar(argumentos.p_cliente.correo)).toBe(cliente.correo);
    expect(argumentos.p_cliente).toMatchObject({ canal: 'panel', ip: '127.0.0.1' });
  });

  it('un vehículo de otro establecimiento responde 404 y no llama a la función', async () => {
    const tenant = tenantCon();
    tenant.obtener = vi.fn(async () => {
      throw noEncontrado('Vehículo');
    });

    const { error } = await ejecutar(peticion(base, tenant));
    expect(error).toMatchObject({ codigo: 'NO_ENCONTRADO', status: 404 });
    expect(tenant.rpc).not.toHaveBeenCalled();
  });

  it('un teléfono repetido se informa con el cliente existente', async () => {
    const tenant = tenantCon({
      consultas: [{ data: { id: CLIENTE_EXISTENTE, nombre: 'Ana Gómez' }, error: null }],
      rpc: async () => {
        throw new AppError('VALIDACION', 'Ya existe un cliente con ese teléfono', [{ campo: 'telefono', mensaje: 'Ya existe' }]);
      },
    });

    const { error } = await ejecutar(peticion({ servicioIds: [SERVICIO_1], nuevoVehiculo: { cliente, vehiculo } }, tenant));
    expect(error).toMatchObject({ codigo: 'CONFLICTO', status: 409 });
    expect(error.detalles[0]).toMatchObject({ campo: 'telefono', clienteId: CLIENTE_EXISTENTE });
  });

  it('una placa repetida se informa con el cliente dueño', async () => {
    const tenant = tenantCon({
      consultas: [{ data: { clientes: { id: CLIENTE_EXISTENTE, nombre: 'Luis' } }, error: null }],
      rpc: async () => {
        throw new AppError('VALIDACION', 'Ya existe un vehículo con esa placa', [{ campo: 'placa', mensaje: 'Ya existe' }]);
      },
    });

    const { error } = await ejecutar(peticion({ servicioIds: [SERVICIO_1], nuevoVehiculo: { cliente, vehiculo } }, tenant));
    expect(error).toMatchObject({ codigo: 'CONFLICTO', status: 409 });
    expect(error.detalles[0]).toMatchObject({ campo: 'placa', clienteId: CLIENTE_EXISTENTE });
  });

  it('RF-F3-03: un vehículo con servicio en curso responde 409', async () => {
    const tenant = tenantCon({
      rpc: async () => {
        throw new AppError('VALIDACION', 'Este vehículo ya tiene un servicio en curso', [
          { campo: 'vehiculoId', mensaje: 'Este vehículo ya tiene un servicio en curso' },
        ]);
      },
    });

    const { error } = await ejecutar(peticion(base, tenant));
    expect(error).toMatchObject({ codigo: 'CONFLICTO', status: 409 });
  });
});

describe('esquema del cambio de estado', () => {
  it('acepta un estado del flujo y la opción de revertir', () => {
    expect(cambioEstadoOrden.parse({ estado: 'secado' })).toEqual({ estado: 'secado' });
    expect(cambioEstadoOrden.parse({ revertir: true })).toEqual({ revertir: true });
  });

  it('exige un estado o revertir, pero no ambos', () => {
    const errores = (datos) => cambioEstadoOrden.safeParse(datos).error?.issues.map((i) => [i.path.join('.'), i.message]);

    expect(errores({})[0][0]).toBe('estado');
    expect(errores({ estado: 'en_lavado', revertir: true })[0][1]).toContain('pero no ambos');
    expect(errores({ estado: 'perdido' })[0][0]).toBe('estado');
  });
});

describe('PATCH /ordenes/:id/estado', () => {
  const peticionCambio = (cuerpo, tenant) => ({
    tenant,
    ctx: { usuarioId: 'p1' },
    params: { id: ORDEN.id },
    body: cambioEstadoOrden.parse(cuerpo),
  });

  async function ejecutarCambio(req) {
    const res = { status: vi.fn(() => res), json: vi.fn() };
    const next = vi.fn();
    await cambiarEstado(req, res, next);
    return { res, datos: res.json.mock.calls[0]?.[0], error: next.mock.calls[0]?.[0] };
  }

  it('CA1: avanza el estado y devuelve la orden actualizada', async () => {
    const tenant = tenantCon();
    const { res, datos, error } = await ejecutarCambio(peticionCambio({ estado: 'en_lavado' }, tenant));

    expect(error).toBeUndefined();
    expect(res.status).not.toHaveBeenCalled();
    expect(datos).toMatchObject({ id: ORDEN.id, estado: 'recibido', codigoSeguimiento: ORDEN.codigo_seguimiento });
    expect(tenant.obtener).toHaveBeenNthCalledWith(1, 'ordenes', ORDEN.id, 'id', 'Orden');
    expect(tenant.rpc).toHaveBeenCalledWith('cambiar_estado_orden', {
      p_orden_id: ORDEN.id,
      p_nuevo_estado: 'en_lavado',
      p_usuario_id: 'p1',
      p_revertir: false,
    });
  });

  it('CA1: permite revertir el último cambio', async () => {
    const tenant = tenantCon();
    const { error } = await ejecutarCambio(peticionCambio({ revertir: true }, tenant));

    expect(error).toBeUndefined();
    expect(tenant.rpc).toHaveBeenCalledWith('cambiar_estado_orden', {
      p_orden_id: ORDEN.id,
      p_nuevo_estado: null,
      p_usuario_id: 'p1',
      p_revertir: true,
    });
  });

  it('RF-F3-05: una transición inválida responde 409', async () => {
    const tenant = tenantCon({
      rpc: async () => {
        throw Object.assign(new Error('No se puede pasar una orden de recibido a entregado'), {
          code: 'P0001',
          hint: 'CONFLICTO',
        });
      },
    });

    const { error } = await ejecutarCambio(peticionCambio({ estado: 'entregado' }, tenant));
    expect(error).toMatchObject({ codigo: 'CONFLICTO', status: 409 });
  });

  it('una orden de otro establecimiento responde 404 y no llama a la función', async () => {
    const tenant = tenantCon();
    tenant.obtener = vi.fn(async () => {
      throw noEncontrado('Orden');
    });

    const { error } = await ejecutarCambio(peticionCambio({ estado: 'en_lavado' }, tenant));
    expect(error).toMatchObject({ codigo: 'NO_ENCONTRADO', status: 404 });
    expect(tenant.rpc).not.toHaveBeenCalled();
  });
});
