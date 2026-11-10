// HU-08 y HU-10 — Lógica de órdenes.
// HU-08: crear la orden con sus servicios y totales; el alta de cliente + vehículo ocurre en la
// misma transacción de la base (función public.crear_orden).
// HU-10: avanzar o revertir el estado con una función SQL transaccional que actualiza
//   "estado_desde", guarda historial_estados con usuario y hora, cierra con entregada_at y deja
//   el evento de dominio para que HU-46 notifique al cliente.
import { AppError, noEncontrado } from '../shared/errores.js';
import { cifrar } from '../shared/cifrado.js';
import { programarNotificacion } from '../shared/notificaciones.js';

/** HU-46: el aviso al cliente corre después de responder; un fallo nunca afecta la operación. */
async function avisarCliente(tenant, ordenId, tipo) {
  try {
    return await programarNotificacion(tenant, ordenId, tipo);
  } catch (err) {
    // CA3: un problema al preparar el aviso nunca revierte la orden.
    console.error('[HU-46] No se pudo preparar el aviso:', err?.message ?? err);
    return { estado: 'error', motivo: 'preparacion' };
  }
}

const COLUMNAS_DETALLE = [
  'id, estado, subtotal, descuento, total, codigo_seguimiento, entrega_estimada_at,',
  'observaciones, created_at, entregada_at, version,',
  'vehiculo:vehiculos(id, placa, tipo, marca, color, cliente:clientes(id, nombre, telefono)),',
  'servicios:orden_servicios(precio, duracion_min, descuento, servicio:servicios(id, nombre)),',
  'promocion:promociones(id, nombre, descuento_pct)',
].join(' ');

/** Respuesta pública de una orden: nombres camelCase para el código de seguimiento y la entrega. */
function detalle(orden) {
  const { codigo_seguimiento, entrega_estimada_at, servicios, ...resto } = orden;
  return {
    ...resto,
    codigoSeguimiento: codigo_seguimiento,
    entregaEstimadaAt: entrega_estimada_at,
    servicios: (servicios ?? []).map(({ servicio, precio, duracion_min, descuento }) => ({
      id: servicio?.id,
      nombre: servicio?.nombre,
      precio,
      duracionMin: duracion_min,
      descuento,
    })),
  };
}

async function buscarClientePorTelefono(tenant, telefono) {
  const { data, error } = await tenant.listar('clientes', 'id, nombre').eq('telefono', telefono).maybeSingle();
  if (error) throw error;
  return data;
}

async function buscarVehiculoPorPlaca(tenant, placa) {
  const { data, error } = await tenant.listar('vehiculos', 'clientes(id, nombre)').eq('placa', placa).maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * La función SQL devuelve errores de negocio con el campo a corregir en `hint`.
 * Aquí se convierten en la misma respuesta amable que usan clientes y vehículos.
 */
async function traducirError(err, tenant, { cliente, vehiculo } = {}) {
  if (err.codigo !== 'VALIDACION') return err;

  const campo = err.detalles?.[0]?.campo;
  if (campo === 'telefono' && cliente) {
    const existente = await buscarClientePorTelefono(tenant, cliente.telefono);
    if (existente) {
      return new AppError('CONFLICTO', 'Ya existe un cliente con ese teléfono', [
        { campo: 'telefono', mensaje: `El teléfono ya está registrado a nombre de ${existente.nombre}`, clienteId: existente.id },
      ]);
    }
  }

  if (campo === 'placa' && vehiculo) {
    const existente = await buscarVehiculoPorPlaca(tenant, vehiculo.placa);
    if (existente?.clientes) {
      return new AppError('CONFLICTO', 'Ya existe un vehículo con esa placa', [
        { campo: 'placa', mensaje: `La placa ya está registrada a nombre de ${existente.clientes.nombre}`, clienteId: existente.clientes.id },
      ]);
    }
  }

  // RF-F3-03: el vehículo ya está en el car wash.
  if (campo === 'vehiculoId' && /servicio en curso/i.test(err.message)) {
    return new AppError('CONFLICTO', err.message, err.detalles);
  }

  return err;
}

/** HU-08 CA1 y CA2: registrar el ingreso y dejar la orden en `recibido`. */
export async function crear(req, res, next) {
  try {
    const { vehiculoId, nuevoVehiculo, servicioIds, observaciones } = req.body;
    const cliente = nuevoVehiculo?.cliente;
    const vehiculo = nuevoVehiculo?.vehiculo;

    // Un vehículo de otro establecimiento responde igual que uno inexistente (HU-41 CA2).
    if (vehiculoId) await req.tenant.obtener('vehiculos', vehiculoId, 'id', 'Vehículo');

    let ordenId;
    try {
      ordenId = await req.tenant.rpc('crear_orden', {
        p_vehiculo_id: vehiculoId ?? null,
        p_servicio_ids: servicioIds,
        p_observaciones: observaciones ?? null,
        p_creada_por: req.ctx.usuarioId,
        p_cliente: cliente
          ? { ...cliente, correo: cifrar(cliente.correo), canal: 'panel', ip: req.ip ?? null }
          : null,
        p_vehiculo: vehiculo ?? null,
      });
    } catch (err) {
      throw await traducirError(err, req.tenant, { cliente, vehiculo });
    }

    const orden = detalle(await req.tenant.obtener('ordenes', ordenId, COLUMNAS_DETALLE, 'Orden'));
    const notificacion = await avisarCliente(req.tenant, ordenId, 'ingreso'); // HU-46 CA1
    res.status(201).json({ ...orden, notificacion });
  } catch (err) {
    next(err);
  }
}

/**
 * HU-10: la función SQL usa P0001 para conflictos de negocio. La API los devuelve como 409;
 * un recurso de otro establecimiento sigue respondiendo 404 igual que uno inexistente.
 */
function traducirErrorEstado(err) {
  if (err instanceof AppError) return err;
  if (err?.hint === 'NO_ENCONTRADO') return noEncontrado('Orden');
  if (err?.code === 'P0001') return new AppError('CONFLICTO', err.message);
  if (err?.code === '23514' && err.hint === 'usuario') {
    return new AppError('SIN_PERMISO', 'El usuario no está activo en este establecimiento');
  }
  return err;
}

/** HU-10 CA1 a CA3: avanzar de estado o revertir el último cambio. */
export async function cambiarEstado(req, res, next) {
  try {
    const { id } = req.params;
    const { estado, revertir } = req.body;

    // Un id inválido o de otro establecimiento responde 404 sin revelar que existe (HU-41 CA2).
    await req.tenant.obtener('ordenes', id, 'id', 'Orden');

    try {
      await req.tenant.rpc('cambiar_estado_orden', {
        p_orden_id: id,
        p_nuevo_estado: estado ?? null,
        p_usuario_id: req.ctx.usuarioId,
        p_revertir: revertir === true,
      });
    } catch (err) {
      throw traducirErrorEstado(err);
    }

    const orden = detalle(await req.tenant.obtener('ordenes', id, COLUMNAS_DETALLE, 'Orden'));
    const notificacion = orden.estado === 'listo' && revertir !== true
      ? await avisarCliente(req.tenant, id, 'listo')
      : null;
    res.json({ ...orden, ...(notificacion ? { notificacion } : {}) }); // HU-46 CA2
  } catch (err) {
    next(err);
  }
}

export async function registrarNovedad(req, res, next) {
  try {
    const { id } = req.params;
    const { tipo, mensaje, minutosExtra } = req.body;

    await req.tenant.obtener('ordenes', id, 'id', 'Orden');

    let novedad;
    try {
      novedad = await req.tenant.rpc('registrar_novedad', {
        p_orden_id: id,
        p_tipo: tipo,
        p_mensaje: mensaje ?? null,
        p_minutos_extra: minutosExtra ?? null,
        p_creada_por: req.ctx.usuarioId,
      });
    } catch (err) {
      throw traducirErrorEstado(err);
    }

    res.status(201).json(novedad);
  } catch (err) {
    next(err);
  }
}

/** HU-09: órdenes que siguen en el car wash (todo lo que no se ha entregado), de la más antigua a la más reciente. */
export async function listarActivas(req, res, next) {
  try {
    const { data, error } = await req.tenant
      .listar('ordenes', COLUMNAS_DETALLE)
      .neq('estado', 'entregado')
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json((data ?? []).map(detalle));
  } catch (err) {
    next(err);
  }
}
