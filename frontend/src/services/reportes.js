// HU-16 — Consultas de reportes. La API valida la sesión y el rol de administrador
// antes de calcular los datos del establecimiento.
import { api } from './api.js';

const rango = (desde, hasta) => new URLSearchParams({ desde, hasta }).toString();

export const obtenerReporteServicios = (desde, hasta) => api.get(`/reportes/servicios?${rango(desde, hasta)}`);

export const obtenerReporteAfluencia = (desde, hasta) => api.get(`/reportes/afluencia?${rango(desde, hasta)}`);
