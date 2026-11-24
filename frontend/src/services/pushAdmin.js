// HU-39/HU-40 — Registro push del administrador autenticado. La clave pública es la misma del
// cliente (ruta pública) porque VAPID es única por ambiente; el dispositivo sí usa la sesión.
import { api } from './api.js';
import { obtenerClavePush } from './pushCliente.js';

export { obtenerClavePush };

/** La suscripción del navegador se guarda para el usuario y la sede de la sesión, no del cuerpo. */
export const registrarPushAdmin = (suscripcion) => api.post('/notificaciones/push', suscripcion);

/** Quita el dispositivo push del administrador de esta sede. */
export const quitarPushAdmin = (endpoint) => api.post('/notificaciones/push/baja', { endpoint });
