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
