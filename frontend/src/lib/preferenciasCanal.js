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

/**
 * HU-40: soporte de push en este navegador. Por defecto se asume soportado y sin preguntar (pruebas y SSR).
 * @typedef {{ soportado: boolean, motivo: string|null, permiso: string }} SoportePush
 */
const SOPORTE_POR_DEFECTO = { soportado: true, motivo: null, permiso: 'default' };

/** CA1: texto del estado de un canal. */
export function textoEstado(canal, preferencias, soporte = SOPORTE_POR_DEFECTO) {
  const datos = preferencias?.canales?.[canal];
  if (!datos) return '';
  if (canal === 'push') {
    if (datos.configurado === false || !soporte.soportado) return 'No disponible';
    if (!datos.disponible) return 'Sin activar';
  }
  return datos.activo ? 'Activo' : 'Inactivo';
}

/** HU-40 CA3: por qué este navegador no puede recibir push. */
export function mensajeSinSoportePush(motivo) {
  if (motivo === 'ios-sin-instalar') {
    return 'En iPhone, agrega esta página a tu pantalla de inicio (Compartir → Agregar a inicio) para activarlas. Mientras, usa SMS o correo.';
  }
  return 'Tu navegador no permite notificaciones push. Elige SMS o correo.';
}

/** HU-40: ¿se puede ofrecer el botón "Activar en este celular"? */
export function puedeRegistrarPush(preferencias, soporte = SOPORTE_POR_DEFECTO) {
  const datos = preferencias?.canales?.push;
  return Boolean(datos && datos.configurado !== false && !datos.disponible && soporte.soportado && soporte.permiso !== 'denied');
}

/** Detalle bajo el nombre del canal: a dónde llegará el aviso o por qué no se puede activar. */
export function detalleCanal(canal, preferencias, soporte = SOPORTE_POR_DEFECTO) {
  const datos = preferencias?.canales?.[canal];
  if (!datos) return '';
  if (canal === 'push') {
    if (datos.configurado === false) return 'Por ahora no enviamos notificaciones push.';
    if (!soporte.soportado) return mensajeSinSoportePush(soporte.motivo);
    if (datos.disponible) return 'Avisos al instante en tu celular, aunque no tengas la página abierta.';
    if (soporte.permiso === 'denied') {
      return 'Bloqueaste las notificaciones en este navegador. Permítelas en su configuración; mientras, te avisamos por SMS o correo.';
    }
    return 'Actívalas para recibir los avisos al instante en este celular.';
  }
  if (canal === 'sms') {
    if (!datos.disponible) return 'Por ahora no enviamos avisos por SMS.';
    if (datos.verificado && datos.celular) return `Al celular ${datos.celular}.`;
    return 'No tienes un celular registrado. Agrega uno con «Usar otro número».';
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
