// HU-46 — Textos para el operario sobre el correo al cliente. Nunca bloquean su trabajo (CA3):
// el cambio ya quedó guardado y solo se informa qué pasó con el aviso.

/** Mensaje después de registrar el ingreso o de pasar a "listo", a partir de `notificacion` de la API. */
export function mensajeCorreo(notificacion) {
  if (!notificacion) return null;
  switch (notificacion.estado) {
    case 'pendiente':
      return { tipo: 'exito', texto: `Se está enviando el correo a ${notificacion.destino ?? 'el cliente'}.` };
    case 'duplicada':
      return { tipo: 'exito', texto: 'El cliente ya había recibido este aviso.' };
    case 'omitida':
      if (notificacion.motivo === 'revocado') return { tipo: 'advertencia', texto: 'El cliente pidió no recibir avisos: no se envió correo.' };
      return { tipo: 'advertencia', texto: 'El cliente no tiene correo registrado: avísale por otro medio.' };
    default:
      return { tipo: 'advertencia', texto: 'No se pudo enviar el correo, pero el cambio quedó guardado.' };
  }
}

const ETIQUETAS = {
  pendiente: { texto: 'Enviando correo', tipo: 'pendiente' },
  enviando: { texto: 'Enviando correo', tipo: 'pendiente' },
  enviada: { texto: 'Correo enviado', tipo: 'exito' },
  entregada: { texto: 'Correo enviado', tipo: 'exito' },
  fallida: { texto: 'Correo no enviado', tipo: 'error' },
};

/**
 * Etiqueta de la tarjeta del tablero: el último aviso relevante para el estado de la orden.
 * @param {{ estado: string, cliente?: { tieneCorreo: boolean }, correos?: Record<string, string> }} orden
 */
export function etiquetaCorreo(orden) {
  if (orden?.cliente && !orden.cliente.tieneCorreo) return { texto: 'Sin correo', tipo: 'neutro' };
  const correos = orden?.correos ?? {};
  const evento = ['listo', 'entregado'].includes(orden?.estado) && correos['orden.lista'] ? 'orden.lista' : 'orden.recibida';
  const estado = correos[evento];
  if (!estado) return null;
  const etiqueta = ETIQUETAS[estado] ?? ETIQUETAS.fallida;
  return { ...etiqueta, texto: `${etiqueta.texto}${evento === 'orden.lista' ? ' · listo' : ' · ingreso'}` };
}
