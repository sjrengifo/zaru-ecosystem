// HU-31 — Estados del flujo que pueden generar notificación y su forma de respuesta.
// La lista sale de ETAPAS (HU-18), la misma que usa el seguimiento del cliente, para que el panel
// nunca invente un estado que la base no conozca.
import { ETAPAS } from './etapasSeguimiento.js';

/** CA2: el aviso de "listo para entrega" es obligatorio y no se puede apagar. */
export const ESTADO_OBLIGATORIO = 'listo';

export const ESTADOS_NOTIFICACION = ETAPAS.map((etapa) => etapa.estado);

/**
 * Combina las filas guardadas con los cinco estados del flujo.
 * Un estado sin fila se considera activo: la migración lo siembra, pero así una base antigua
 * nunca deja de avisar por un dato faltante.
 */
export function armarConfiguracion(filas = []) {
  const guardados = new Map(filas.map((fila) => [fila.estado, fila.activo]));
  return ETAPAS.map(({ estado, titulo }) => ({
    estado,
    titulo,
    activo: guardados.get(estado) ?? true,
    obligatorio: estado === ESTADO_OBLIGATORIO,
  }));
}
