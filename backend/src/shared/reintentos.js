// HU-34 (RF-F6-16 a RF-F6-19) — Clasificación de errores de proveedores y espera exponencial.
//
// Regla: se reintenta solo lo recuperable (red, tiempo agotado, límite de peticiones, 5xx).
// Un error permanente (destinatario inválido, credenciales, 4xx de validación) no se reintenta:
// quedaría en un bucle inútil y el mensaje nunca llegaría. La espera es exponencial y acotada:
// 1, 2 y 4 minutos por defecto (configurable para desarrollo/pruebas).

export const ESPERAS_POR_DEFECTO_MS = [60_000, 120_000, 240_000];

/** Marcas de errores que no se arreglan reintentando. */
const PERMANENTES = [
  /\b(400|401|403|404|405|409|413|415|422)\b/,
  /credencial|api[ _-]?key|token (inválido|invalido|vencido)|no autorizado|unauthorized|forbidden/i,
  /destinatario|destino inválido|destino invalido|direcci[oó]n (inválida|invalida|no existe)|address rejected/i,
  /invalid (email|phone|recipient|to)|recipient rejected|mailbox unavailable/i,
  /no existe|no encontrado|not found/i,
];

/** Motivos de error de proveedor que sí se pueden reintentar. */
const RECUPERABLES = [
  /\b(408|425|429|500|502|503|504)\b/,
  /tiempo|timeout|timed out|no respondi[oó]|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|EPIPE|socket hang up/i,
  /red|network|conexi[oó]n|connection|temporal|try again|rate limit|too many requests/i,
  /rechaz|rejected|unavailable|busy|ocupado/i,
];

/**
 * @param {unknown} error
 * @returns {{ recuperable: boolean, motivo: string }}
 */
export function clasificarError(error) {
  const motivo = String(error?.message ?? error ?? 'Error del proveedor').slice(0, 500);
  const codigo = String(error?.code ?? '');
  const texto = `${codigo} ${motivo}`;

  // Un error explícito del proveedor manda sobre el texto genérico.
  if (error?.recuperable === true) return { recuperable: true, motivo };
  if (error?.recuperable === false) return { recuperable: false, motivo };

  if (PERMANENTES.some((patron) => patron.test(texto))) return { recuperable: false, motivo };
  if (RECUPERABLES.some((patron) => patron.test(texto))) return { recuperable: true, motivo };

  // Ante la duda se reintenta: es preferible un intento acotado a perder un aviso por un fallo
  // transitorio no tipificado. MAX_INTENTOS evita cualquier bucle infinito.
  return { recuperable: true, motivo };
}

/** Espera antes del intento `intento` (1 → 1 min, 2 → 2 min, 3 → 4 min). */
export function esperaExponencial(intento, esperas = ESPERAS_POR_DEFECTO_MS) {
  const indice = Math.max(0, Math.min(esperas.length - 1, Number(intento) - 1));
  const base = esperas[indice] ?? esperas.at(-1) ?? 0;
  // Pequeño jitter (hasta 10 %) para que varios reintentos no salgan al mismo tiempo.
  return base + Math.floor(base * 0.1 * Math.random());
}

/** Esperas configuradas por ambiente: NOTIFICACIONES_ESPERAS_MS="1000,2000,4000". */
export function esperasConfiguradas(valor = process.env.NOTIFICACIONES_ESPERAS_MS) {
  if (!valor) return ESPERAS_POR_DEFECTO_MS;
  const lista = String(valor)
    .split(',')
    .map((n) => Number(n.trim()))
    .filter((n) => Number.isFinite(n) && n >= 0);
  return lista.length ? lista : ESPERAS_POR_DEFECTO_MS;
}
