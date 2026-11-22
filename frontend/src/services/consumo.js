// HU-39 — Consumo mensual y catálogo de cupos. Los permisos se validan en el backend.
import { api } from './api.js';

const consulta = (mes) => (mes ? `?mes=${encodeURIComponent(mes)}` : '');

/** Consumo real de la sede de la sesión; el backend ignora cualquier id enviado por el frontend. */
export const obtenerConsumoPropio = (mes) => api.get(`/consumo${consulta(mes)}`);

/** Reporte global de todos los establecimientos (solo superadministrador). */
export const obtenerReporteConsumo = (mes) => api.get(`/superadmin/consumo${consulta(mes)}`);

/** Detalle de una sede y su historial mensual. */
export const obtenerDetalleConsumo = (establecimientoId, mes) =>
  api.get(`/superadmin/consumo/${encodeURIComponent(establecimientoId)}${consulta(mes)}`);

/** Cupos actuales de los planes; los valores reales salen de la base de datos. */
export const listarPlanesConsumo = () => api.get('/superadmin/planes');

/** Ajustar cupos para futuros envíos; no reescribe el consumo histórico. */
export const actualizarPlanConsumo = (nombre, cupos) => api.put(`/superadmin/planes/${encodeURIComponent(nombre)}`, cupos);
