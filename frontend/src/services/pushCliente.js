// HU-40 — Llamadas del registro del dispositivo para notificaciones push. Usan el pase del cliente.
import { BASE_URL, conPase, leer } from './historialCliente.js';

/** GET /publico/push/clave → { clavePublica }. 503 si el ambiente no tiene push. */
export async function obtenerClavePush() {
  const respuesta = await fetch(`${BASE_URL}/publico/push/clave`);
  return leer(respuesta, 'Las notificaciones push no están disponibles en este momento');
}

/** POST /publico/cliente/push — registra la suscripción de este navegador. */
export async function registrarPush(pase, suscripcion) {
  const respuesta = await fetch(`${BASE_URL}/publico/cliente/push`, conPase(pase, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(suscripcion),
  }));
  return leer(respuesta, 'No pudimos registrar tu dispositivo');
}

/** DELETE /publico/cliente/push — este navegador deja de recibir push. */
export async function eliminarPush(pase, endpoint) {
  const respuesta = await fetch(`${BASE_URL}/publico/cliente/push`, conPase(pase, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  }));
  return leer(respuesta, 'No pudimos quitar tu dispositivo');
}
