// HU-34 — Consultas de la bitácora de notificaciones (solo administrador).
// La API filtra por el establecimiento de la sesión y enmascara el destino; el panel nunca
// recibe el celular ni el correo completos.
import { api } from './api.js';

/** Convierte los filtros en query string, omitiendo los vacíos para no enviar parámetros inútiles. */
export function queryNotificaciones(filtros = {}) {
  const params = new URLSearchParams();
  for (const [campo, valor] of Object.entries(filtros)) {
    if (valor !== undefined && valor !== null && String(valor).trim() !== '') params.set(campo, String(valor).trim());
  }
  const texto = params.toString();
  return texto ? `?${texto}` : '';
}

export const listarNotificaciones = (filtros) => api.get(`/notificaciones${queryNotificaciones(filtros)}`);

export const obtenerNotificacion = (id) => api.get(`/notificaciones/${encodeURIComponent(id)}`);
