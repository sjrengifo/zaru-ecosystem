// HU-18 — Llamadas públicas del seguimiento del lavado. No usan la sesión del panel:
// el cliente final entra solo con el código de seguimiento de su orden.
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';

const ruta = (codigo) => `${BASE_URL}/publico/seguimiento/${encodeURIComponent(codigo)}`;

/** CA1: estado actual del lavado. Lanza un error con `status` si la API no lo encuentra. */
export async function obtenerSeguimiento(codigo) {
  const respuesta = await fetch(ruta(codigo), { cache: 'no-store' });
  const json = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    const error = new Error(json.error?.mensaje || 'No pudimos consultar el seguimiento');
    error.status = respuesta.status;
    error.codigo = json.error?.codigo;
    throw error;
  }
  return json;
}

/** CA2: dirección del flujo de eventos en tiempo real (Server-Sent Events). */
export const urlEventosSeguimiento = (codigo) => `${ruta(codigo)}/eventos`;
