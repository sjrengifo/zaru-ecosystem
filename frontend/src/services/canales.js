// HU-31/HU-39 — Preferencias de canales de la sede. Solo cambian la prueba y los avisos no críticos;
// los avisos operativos y el fallback automático siguen intactos.
import { api } from './api.js';

export const listarCanales = () => api.get('/configuracion/canales');

export const guardarCanales = (canales) =>
  api.put('/configuracion/canales', { canales: canales.map(({ canal, activo }) => ({ canal, activo })) });
