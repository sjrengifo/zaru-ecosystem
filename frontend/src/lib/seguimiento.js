// HU-18 — Reglas de la pantalla de seguimiento del cliente final, sin React.

/** Mismo formato que acepta la API: letras y números, sin espacios ni guiones. */
const FORMATO_CODIGO = /^[0-9A-Z]{6,16}$/;

/** Normaliza lo que escribe o pega el cliente. Devuelve null si no puede ser un código. */
export function normalizarCodigo(valor) {
  const codigo = String(valor ?? '').replace(/[\s-]/g, '').toUpperCase();
  return FORMATO_CODIGO.test(codigo) ? codigo : null;
}

/** Enlace público que el operario comparte con el cliente. */
export function enlaceSeguimiento(codigo, origen = typeof window !== 'undefined' ? window.location.origin : '') {
  return `${origen}/seguimiento/${encodeURIComponent(codigo)}`;
}

/** Mensaje que lee el lector de pantalla cuando cambia la etapa. */
export function anuncioEtapa(seguimiento) {
  if (!seguimiento?.etapa) return '';
  return `Tu vehículo ahora está en: ${seguimiento.etapa.titulo}.`;
}

/** Porcentaje de avance del lavado para la barra (0 a 100). */
export function avance(seguimiento) {
  const { paso, totalPasos } = seguimiento?.etapa ?? {};
  if (!paso || !totalPasos) return 0;
  if (totalPasos <= 1) return 100;
  return Math.round(((paso - 1) / (totalPasos - 1)) * 100);
}

/**
 * ¿Conviene reemplazar el seguimiento mostrado por el recibido?
 * La API envía la versión de la orden; un evento atrasado (por ejemplo, la respuesta de una
 * consulta lenta que llega después del evento en vivo) no debe devolver la pantalla a una etapa anterior.
 */
export function esMasReciente(actual, recibido) {
  if (!recibido) return false;
  if (!actual) return true;
  return Number(recibido.version ?? 0) >= Number(actual.version ?? 0);
}
