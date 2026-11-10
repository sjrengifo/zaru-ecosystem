// HU-30 — Cómo se muestran las autorizaciones de comunicaciones en el panel y en la página de baja.

export const TIPOS_AUTORIZACION = [
  { tipo: 'notificaciones_servicio', clave: 'notificacionesServicio', nombre: 'Avisos del estado del vehículo' },
  { tipo: 'comerciales', clave: 'comerciales', nombre: 'Promociones y ofertas' },
];

export const NOMBRE_TIPO = {
  tratamiento_datos: 'Tratamiento de datos',
  notificaciones_servicio: 'Avisos del estado del vehículo',
  comerciales: 'Promociones y ofertas',
};

/** CA4: por dónde se dio o se retiró cada autorización. */
export const NOMBRE_CANAL = {
  panel: 'Panel del establecimiento',
  app: 'App del cliente',
  enlace_baja: 'Enlace "dejar de recibir"',
  migracion: 'Registro previo a HU-30',
};

export const nombreCanal = (canal) => NOMBRE_CANAL[canal] ?? canal ?? '—';
export const nombreTipo = (tipo) => NOMBRE_TIPO[tipo] ?? tipo;

/**
 * CA4: cómo se lee cada fila del historial (de la más reciente a la más antigua). Una fila sin
 * autorizar es "Retirada" solo si antes estaba otorgada; si nunca se otorgó, es "No otorgada".
 */
export function decisionDe(filas, i) {
  const fila = filas[i];
  if (fila.otorgado) return 'Otorgada';
  const anterior = filas.slice(i + 1).find((f) => f.tipo === fila.tipo);
  return anterior?.otorgado ? 'Retirada' : 'No otorgada';
}
