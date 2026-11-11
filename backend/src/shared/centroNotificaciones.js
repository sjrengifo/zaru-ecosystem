// HU-38 — Centro de notificaciones del cliente final en la app (RF-F6-22, RF-F6-23).
//
// El cliente entra con su pase (placa + celular, shared/paseCliente.js) y consulta los avisos que le
// llegaron en los últimos 90 días, del más reciente al más antiguo, con su marca de leída y el número
// de pendientes (CA1, CA2). Cada aviso de estado lleva a su seguimiento o, si el vehículo ya se
// entregó, al detalle del servicio en el historial (CA3).
//
// - El cliente y el establecimiento salen del pase firmado; nunca de la URL ni del cuerpo.
// - Solo se muestran los avisos que el cliente recibió (`enviada` o `entregada`): un correo que
//   falló o que sigue en cola no le llegó. Si el correo de "listo" falló y salió el SMS alterno,
//   aparece el SMS, así que el aviso no se repite.
// - "Leída" se guarda en `notificaciones.leida_at` (ya existe en el modelo de datos).
import { noEncontrado } from './errores.js';
import { esUuid } from './tenant.js';

export const DIAS_CENTRO = 90;
export const MAX_NOTIFICACIONES = 200;
const DIA_MS = 24 * 60 * 60 * 1000;

/** Estados en los que el aviso sí le llegó al cliente. */
export const ESTADOS_RECIBIDOS = ['enviada', 'entregada'];

const COLUMNAS = 'id, tipo, evento, canal, contenido, orden_id, leida_at, created_at';

/** Título por evento, para avisos que no traen asunto guardado. */
const TITULOS = {
  'orden.recibida': 'Recibimos tu vehículo',
  'orden.lista': 'Tu vehículo está listo para recoger',
  'orden.listo': 'Tu vehículo está listo para recoger',
};

const CATEGORIAS = {
  operativa: 'Estado del servicio',
  comercial: 'Promoción',
  recordatorio: 'Recordatorio',
  novedad: 'Novedad',
  correccion: 'Corrección',
  sistema: 'Aviso',
};

export const desde = (ahora = new Date()) => new Date(ahora.getTime() - DIAS_CENTRO * DIA_MS);

/**
 * CA3: a dónde lleva un aviso de estado. Mientras el vehículo está en servicio, al seguimiento; una
 * vez entregado, al detalle de ese servicio en el historial. Los demás avisos no llevan a otra pantalla.
 */
export function destinoDe(notificacion, orden) {
  if (notificacion.tipo !== 'operativa' || !orden) return null;
  if (orden.estado === 'entregado') return { pantalla: 'historial', ordenId: orden.id };
  return orden.codigo_seguimiento ? { pantalla: 'seguimiento', codigo: orden.codigo_seguimiento } : null;
}

function aVista(fila, orden) {
  const asunto = typeof fila.contenido?.asunto === 'string' ? fila.contenido.asunto.trim() : '';
  return {
    id: fila.id,
    tipo: fila.tipo,
    categoria: CATEGORIAS[fila.tipo] ?? 'Aviso',
    evento: fila.evento,
    titulo: asunto || TITULOS[fila.evento] || 'Aviso de tu car wash',
    canal: fila.canal,
    fecha: fila.created_at,
    leida: Boolean(fila.leida_at),
    placa: orden?.vehiculo?.placa ?? null,
    destino: destinoDe(fila, orden),
  };
}

/**
 * CA1 + CA2: avisos del cliente de los últimos 90 días, del más reciente al más antiguo, y cuántos
 * siguen sin leer.
 * @param {object} tenant acceso del establecimiento del pase
 * @param {string} clienteId cliente del pase
 */
export async function listarCentro(tenant, clienteId, { ahora = new Date() } = {}) {
  const { data, error } = await tenant
    .listar('notificaciones', COLUMNAS)
    .eq('cliente_id', clienteId)
    .in('estado', ESTADOS_RECIBIDOS)
    .gte('created_at', desde(ahora).toISOString())
    .order('created_at', { ascending: false })
    .limit(MAX_NOTIFICACIONES);
  if (error) throw error;
  const filas = data ?? [];

  // Estado y código de cada orden para saber a qué pantalla lleva el aviso (CA3).
  const ordenIds = [...new Set(filas.map((f) => f.orden_id).filter(Boolean))];
  let ordenes = new Map();
  if (ordenIds.length) {
    const { data: datosOrdenes, error: errorOrdenes } = await tenant
      .listar('ordenes', 'id, estado, codigo_seguimiento, vehiculo:vehiculos(placa, cliente_id)')
      .in('id', ordenIds);
    if (errorOrdenes) throw errorOrdenes;
    // Una orden de otro cliente nunca da destino, aunque el aviso apunte a ella.
    ordenes = new Map(
      (datosOrdenes ?? []).filter((o) => o.vehiculo?.cliente_id === clienteId).map((o) => [o.id, o]),
    );
  }

  const notificaciones = filas.map((fila) => aVista(fila, ordenes.get(fila.orden_id)));
  return { notificaciones, noLeidas: notificaciones.filter((n) => !n.leida).length };
}

/**
 * Marca un aviso del cliente como leído. Repetirlo no cambia la fecha en que se leyó.
 * Un aviso de otro cliente, de otra sede o que no le llegó responde el mismo 404.
 */
export async function marcarLeida(tenant, clienteId, id, { ahora = new Date() } = {}) {
  if (!esUuid(id)) throw noEncontrado('Notificación');
  const { data: fila, error } = await tenant
    .listar('notificaciones', 'id, estado, leida_at')
    .eq('id', id)
    .eq('cliente_id', clienteId)
    .maybeSingle();
  if (error) throw error;
  if (!fila || !ESTADOS_RECIBIDOS.includes(fila.estado)) throw noEncontrado('Notificación');
  if (fila.leida_at) return { id: fila.id, leida: true, leidaAt: fila.leida_at };

  const actualizada = await tenant.actualizar(
    'notificaciones',
    id,
    { leida_at: ahora.toISOString() },
    'id, leida_at',
    'Notificación',
    { cliente_id: clienteId },
  );
  return { id: actualizada.id, leida: true, leidaAt: actualizada.leida_at };
}
