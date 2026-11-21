// HU-35 — Campañas de promociones segmentadas (solo administrador). La API filtra siempre por la
// sede de la sesión: el `establecimiento_id` del navegador no se envía ni se usa.
import { api } from './api.js';

/** Historial paginado de campañas de la sede. */
export const listarCampanas = (pagina = 1, porPagina = 20) =>
  api.get(`/campanas?pagina=${encodeURIComponent(pagina)}&porPagina=${encodeURIComponent(porPagina)}`);

/** Previsualización: total de destinatarios y exclusiones, sin crear nada (CA2). */
export const estimarCampana = ({ promocionId, segmento }) => api.post('/campanas/estimar', { promocionId, segmento });

/**
 * Confirma la campaña. La clave de idempotencia viaja en el encabezado para que reintentar por un
 * error de red no cree dos campañas (HU-35).
 */
export const crearCampana = ({ promocionId, segmento, programadaPara }, claveIdempotencia) =>
  api.post('/campanas', { promocionId, segmento, programadaPara }, { headers: { 'Idempotency-Key': claveIdempotencia } });
