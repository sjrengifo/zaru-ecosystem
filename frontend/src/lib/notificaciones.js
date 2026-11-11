// HU-34 — Reglas de presentación de la bitácora de notificaciones, sin React ni llamadas a la API.
// El backend ya entrega el destino enmascarado y distingue "aceptada por el proveedor" de
// "entregada"; aquí solo se traducen los códigos a textos claros para el administrador.

export const ETIQUETAS_CANAL = { correo: 'Correo', sms: 'SMS', push: 'Push' };
export const ETIQUETAS_TIPO = {
  operativa: 'Operativa',
  comercial: 'Comercial',
  recordatorio: 'Recordatorio',
  novedad: 'Novedad',
  correccion: 'Corrección',
  sistema: 'Sistema',
};
export const ETIQUETAS_ESTADO = {
  programada: 'Programada',
  pendiente: 'Pendiente',
  enviando: 'Enviando',
  enviada: 'Enviada',
  entregada: 'Entregada',
  fallida: 'Fallida',
  cancelada: 'Cancelada',
};

/** Clase del distintivo de estado (se apoya en .estado-etiqueta de global.css). */
const CLASE_ESTADO = {
  programada: 'estado-envio-programada',
  pendiente: 'estado-envio-pendiente',
  enviando: 'estado-envio-pendiente',
  enviada: 'estado-envio-enviada',
  entregada: 'estado-envio-entregada',
  fallida: 'estado-envio-fallida',
  cancelada: 'estado-envio-cancelada',
};

export const estadoNotificacion = (estado) => ({
  texto: ETIQUETAS_ESTADO[estado] ?? estado ?? '—',
  clase: CLASE_ESTADO[estado] ?? 'estado-envio-cancelada',
});

/**
 * Texto de entrega que NO confunde "el proveedor aceptó" con "el cliente lo recibió".
 * @param {{ estado?: string, aceptadaPorProveedor?: boolean, entregada?: boolean }} n
 */
export function textoEntrega(n = {}) {
  if (n.entregada) return 'Entregada (el proveedor confirmó la entrega)';
  if (n.aceptadaPorProveedor) return 'Aceptada por el proveedor (sin acuse de entrega)';
  if (n.estado === 'fallida') return 'No entregada: falló el envío';
  if (n.estado === 'cancelada') return 'Cancelada';
  return 'Aún no enviada';
}

const FECHA_HORA = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Fecha y hora en Bogotá; "—" si el valor no es una fecha válida. */
export function fechaYHora(valor) {
  if (!valor) return '—';
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? '—' : FECHA_HORA.format(fecha);
}

/** Solo la hora en Bogotá (para agrupar la columna Fecha y Hora del listado). */
const HORA = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export function horaBogota(valor) {
  if (!valor) return '—';
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? '—' : HORA.format(fecha);
}

/** ¿Hay al menos un filtro activo? Controla el botón "Limpiar filtros". */
export const hayFiltros = (filtros = {}) => Object.values(filtros).some((valor) => String(valor ?? '').trim() !== '');

export const FILTROS_VACIOS = Object.freeze({ placa: '', desde: '', hasta: '', canal: '', estado: '', tipo: '' });
