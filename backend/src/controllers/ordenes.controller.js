// HU-08 y HU-10 — Lógica de órdenes.
// HU-08: crear la orden con sus servicios y totales; el alta de cliente + vehículo ocurre en la
// misma transacción de la base (función public.crear_orden).
// TODO HU-10: avanzar estado (recibido → en_lavado → listo → entregado),
//   actualizar "estado_desde", guardar fila en historial_estados con usuario y hora.
//   Al quedar "entregado", guardar entregada_at (queda en el historial del vehículo).
import { AppError } from '../shared/errores.js';
import { cifrar } from '../shared/cifrado.js';
import { pendiente } from './pendiente.js';

const COLUMNAS_DETALLE = [
  'id, estado, subtotal, descuento, total, codigo_seguimiento, entrega_estimada_at,',
  'observaciones, created_at, entregada_at,',
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

    res.status(201).json(detalle(await req.tenant.obtener('ordenes', ordenId, COLUMNAS_DETALLE, 'Orden')));
  } catch (err) {
    next(err);
  }
}

export const listarActivas = pendiente('HU-09');
export const cambiarEstado = pendiente('HU-10');
