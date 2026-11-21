// HU-29 — Preferencias de canal de notificación del cliente final. Usa el mismo pase de HU-23
// (placa + celular); no usa la sesión del panel.
import { BASE_URL, conPase, leer } from './historialCliente.js';

const conCuerpo = (pase, metodo, cuerpo) =>
  conPase(pase, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo ?? {}) });

/** GET /publico/cliente/preferencias → { canales: { push, sms, correo }, sinCanales }. */
export async function obtenerPreferencias(pase) {
  const respuesta = await fetch(`${BASE_URL}/publico/cliente/preferencias`, conPase(pase));
  return leer(respuesta, 'No pudimos cargar tus preferencias');
}

/** PUT /publico/cliente/preferencias — { push, sms, correo, confirmarSinCanales? }. */
export async function guardarPreferencias(pase, cuerpo) {
  const respuesta = await fetch(`${BASE_URL}/publico/cliente/preferencias`, conCuerpo(pase, 'PUT', cuerpo));
  return leer(respuesta, 'No pudimos guardar tus preferencias');
}

/** POST /publico/cliente/celular/codigo — envía el código de 6 dígitos por sms ({ celular? }). */
export async function solicitarCodigoCelular(pase, { celular } = {}) {
  const respuesta = await fetch(`${BASE_URL}/publico/cliente/celular/codigo`, conCuerpo(pase, 'POST', celular ? { celular } : {}));
  return leer(respuesta, 'No pudimos enviar el código');
}

/** POST /publico/cliente/celular/verificar — valida el código y devuelve las preferencias. */
export async function verificarCodigoCelular(pase, codigo) {
  const respuesta = await fetch(`${BASE_URL}/publico/cliente/celular/verificar`, conCuerpo(pase, 'POST', { codigo }));
  return leer(respuesta, 'No pudimos validar el código');
}
