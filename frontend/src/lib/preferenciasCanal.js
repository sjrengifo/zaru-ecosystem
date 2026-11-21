// HU-29 — Reglas de presentación de las preferencias de notificación del cliente.

export const CANALES = ['push', 'sms', 'correo'];

export const NOMBRE_CANAL = { push: 'Notificación push', sms: 'Mensaje de texto (SMS)', correo: 'Correo electrónico' };

/** Casillas de la pantalla a partir de lo que devolvió la API. */
export function casillasDe(preferencias) {
  const canales = preferencias?.canales ?? {};
  return Object.fromEntries(CANALES.map((canal) => [canal, Boolean(canales[canal]?.activo)]));
}

/** ¿Las casillas difieren de lo guardado? Habilita el botón "Guardar". */
export function hayCambios(casillas, preferencias) {
  const guardado = casillasDe(preferencias);
  return CANALES.some((canal) => casillas[canal] !== guardado[canal]);
}

/** CA3: ¿el cliente se quedaría sin ningún canal? */
export const sinCanales = (casillas) => CANALES.every((canal) => !casillas[canal]);

/** CA1: texto del estado de un canal. */
export function textoEstado(canal, preferencias) {
  const datos = preferencias?.canales?.[canal];
  if (!datos) return '';
  if (canal === 'push' && !datos.disponible) return 'Próximamente';
  return datos.activo ? 'Activo' : 'Inactivo';
}

/** Detalle bajo el nombre del canal: a dónde llegará el aviso o por qué no se puede activar. */
export function detalleCanal(canal, preferencias) {
  const datos = preferencias?.canales?.[canal];
  if (!datos) return '';
  if (canal === 'push') {
    return datos.disponible ? 'Avisos en tu celular.' : 'Estará disponible cuando permitas las notificaciones en tu celular.';
  }
  if (canal === 'sms') {
    if (!datos.disponible) return 'Por ahora no enviamos avisos por SMS.';
    if (datos.verificado && datos.celular) return `Al celular ${datos.celular}.`;
    return 'Debes validar tu celular con un código de 6 dígitos.';
  }
  return datos.disponible && datos.destino ? `A ${datos.destino}.` : 'No tienes un correo registrado.';
}

/** ¿Se puede activar el canal desde la pantalla? (el SMS sin validar abre la verificación). */
export function puedeActivar(canal, preferencias) {
  const datos = preferencias?.canales?.[canal];
  return Boolean(datos?.disponible);
}

/** Código de 6 dígitos: solo números. */
export const limpiarCodigo = (valor) => String(valor ?? '').replace(/\D/g, '').slice(0, 6);

/** Segundos que faltan para poder pedir otro código (0 si ya se puede). */
export function segundosParaReenvio(reenvioEn, ahora = Date.now()) {
  const faltan = Math.ceil((new Date(reenvioEn).getTime() - ahora) / 1000);
  return Number.isFinite(faltan) && faltan > 0 ? faltan : 0;
}
