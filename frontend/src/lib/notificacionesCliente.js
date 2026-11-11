// HU-38 — Reglas de presentación del centro de notificaciones del cliente.

/** CA3: ruta de la app a la que lleva un aviso de estado, o null si no lleva a ninguna pantalla. */
export function rutaDestino(slug, destino) {
  if (destino?.pantalla === 'seguimiento' && destino.codigo) {
    return `/seguimiento/${encodeURIComponent(destino.codigo)}`;
  }
  if (destino?.pantalla === 'historial' && destino.ordenId) {
    return `/s/${encodeURIComponent(slug)}/historial?orden=${encodeURIComponent(destino.ordenId)}`;
  }
  return null;
}

/** CA2: texto del contador; con muchas pendientes no ocupa más de dos cifras. */
export const textoContador = (noLeidas) => (noLeidas > 9 ? '9+' : String(noLeidas));

/** Texto accesible de la campana, p. ej. "Notificaciones, 3 sin leer". */
export function etiquetaCampana(noLeidas) {
  if (!noLeidas) return 'Notificaciones';
  return `Notificaciones, ${noLeidas} sin leer`;
}

/** Marca una notificación como leída en la lista local y recalcula el contador. */
export function conLeida(estado, id) {
  const notificaciones = estado.notificaciones.map((n) => (n.id === id ? { ...n, leida: true } : n));
  return { notificaciones, noLeidas: notificaciones.filter((n) => !n.leida).length };
}
