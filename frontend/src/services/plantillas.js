// HU-32 — Plantillas de notificación de la sede (solo administrador). La API filtra por la sede de
// la sesión: nunca llegan ni se cambian las plantillas de otra sede.
import { api } from './api.js';

const ruta = (estado, canal) => `/plantillas/${encodeURIComponent(estado)}/${encodeURIComponent(canal)}`;

export const listarPlantillas = () => api.get('/plantillas');
export const guardarPlantilla = (estado, canal, { asunto, cuerpo }) => api.put(ruta(estado, canal), { asunto, cuerpo });
export const restaurarPlantilla = (estado, canal) => api.delete(ruta(estado, canal));
export const vistaPreviaPlantilla = (datos) => api.post('/plantillas/vista-previa', datos);
