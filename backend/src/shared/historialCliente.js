// HU-23 / HU-24 — Historial de servicios del cliente final.
//
// Solo se listan órdenes **entregadas** del cliente autenticado con su pase (shared/paseCliente.js).
// El cliente y el establecimiento salen del pase firmado, nunca de la URL ni de un id del cuerpo.
// Cada consulta se hace con el acceso del tenant de esa sede, así que las llaves compuestas y RLS
// siguen siendo la segunda barrera (HU-41/HU-42).
import { noEncontrado } from './errores.js';

const COLUMNAS = [
  'id, codigo_seguimiento, estado, subtotal, descuento, total, created_at, entregada_at,',
  'vehiculo:vehiculos(id, cliente_id, placa, tipo, marca, color),',
  'servicios:orden_servicios(precio, descuento, servicio:servicios(id, nombre))',
].join(' ');

const nombreServicio = (linea) => linea?.servicio?.nombre ?? linea?.servicios?.nombre ?? 'Servicio';

/** Arma el "tipo de lavado" visible: los servicios realizados, en el orden de la orden. */
export const tipoLavado = (lineas = []) => {
  const nombres = lineas.map(nombreServicio).filter(Boolean);
  return nombres.length ? nombres.join(' + ') : 'Servicio';
};

const numero = (valor) => Number(valor ?? 0);

/** Vehículos del cliente autenticado (para el filtro por placa). */
export async function vehiculosDelCliente(tenant, clienteId) {
  const { data, error } = await tenant
    .listar('vehiculos', 'id, placa, tipo, marca, color')
    .eq('cliente_id', clienteId)
    .order('placa');
  if (error) throw error;
  return data ?? [];
}

/**
 * HU-23: servicios entregados del cliente, del más reciente al más antiguo.
 * @param {object} tenant acceso del establecimiento del pase
 * @param {string} clienteId cliente del pase
 * @param {{ placa?: string }} filtros placa ya normalizada
 * @param {object} sede fila de establecimientos del pase
 */
export async function listarHistorial(tenant, clienteId, { placa } = {}, sede = {}) {
  let vehiculos = await vehiculosDelCliente(tenant, clienteId);
  if (placa) vehiculos = vehiculos.filter((v) => v.placa === placa);
  if (!vehiculos.length) return { sede: sede.nombre ?? null, historial: [], vehiculos: [] };

  const { data, error } = await tenant
    .listar('ordenes', COLUMNAS)
    .in('vehiculo_id', vehiculos.map((v) => v.id))
    .eq('estado', 'entregado')
    .order('entregada_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) throw error;

  const historial = (data ?? []).map((orden) => ({
    id: orden.id,
    codigo: orden.codigo_seguimiento,
    fecha: orden.entregada_at ?? orden.created_at,
    sede: sede.nombre ?? null,
    placa: orden.vehiculo?.placa ?? null,
    tipoLavado: tipoLavado(orden.servicios),
    servicios: (orden.servicios ?? []).map((linea) => ({
      nombre: nombreServicio(linea),
      precio: numero(linea.precio),
    })),
    total: numero(orden.total),
  }));

  return { sede: sede.nombre ?? null, historial, vehiculos };
}

/**
 * HU-24: detalle de un servicio entregado del cliente. Una orden de otro cliente, de otra sede o
 * que todavía no se entregó responde el mismo 404: no se revela que existe.
 */
export async function detalleHistorial(tenant, clienteId, ordenId, sede = {}) {
  const orden = await tenant.obtener('ordenes', ordenId, COLUMNAS, 'Servicio');
  if (orden.estado !== 'entregado' || orden.vehiculo?.cliente_id !== clienteId) throw noEncontrado('Servicio');

  return {
    id: orden.id,
    codigo: orden.codigo_seguimiento,
    fecha: orden.entregada_at ?? orden.created_at,
    sede: sede.nombre ?? null,
    placa: orden.vehiculo?.placa ?? null,
    vehiculo: {
      tipo: orden.vehiculo?.tipo ?? null,
      marca: orden.vehiculo?.marca ?? null,
      color: orden.vehiculo?.color ?? null,
    },
    tipoLavado: tipoLavado(orden.servicios),
    servicios: (orden.servicios ?? []).map((linea) => ({
      nombre: nombreServicio(linea),
      precio: numero(linea.precio),
      descuento: numero(linea.descuento),
    })),
    subtotal: numero(orden.subtotal),
    descuento: numero(orden.descuento),
    total: numero(orden.total),
  };
}
