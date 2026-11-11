// HU-38 — Centro de notificaciones del cliente final. Usa el mismo pase de HU-23 (placa + celular),
// guardado por sede en sessionStorage; no usa la sesión del panel.
import { BASE_URL, conPase, leer } from './historialCliente.js';

/** GET /publico/cliente/notificaciones → { notificaciones, noLeidas }. */
export async function listarNotificacionesCliente(pase) {
  const respuesta = await fetch(`${BASE_URL}/publico/cliente/notificaciones`, conPase(pase));
  return leer(respuesta, 'No pudimos cargar tus notificaciones');
}

/** PATCH /publico/cliente/notificaciones/{id}/leida → { id, leida, leidaAt }. */
export async function marcarNotificacionLeida(pase, id) {
  const respuesta = await fetch(
    `${BASE_URL}/publico/cliente/notificaciones/${encodeURIComponent(id)}/leida`,
    conPase(pase, { method: 'PATCH' }),
  );
  return leer(respuesta, 'No pudimos marcar la notificación como leída');
}
