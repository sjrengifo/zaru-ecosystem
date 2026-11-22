// HU-26 / HU-27 — Promociones vigentes de la sede para el cliente final. Pública: no usa la sesión del panel.
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';

/** Lanza un Error con `status` y `codigo` si la API respondió un error. */
async function leer(respuesta, mensaje) {
  const json = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    const error = new Error(json.error?.mensaje || mensaje);
    error.status = respuesta.status;
    error.codigo = json.error?.codigo;
    throw error;
  }
  return json;
}

/** { sede, promociones } de la sede del enlace. Lanza un Error con `status` si la API responde un error. */
export async function listarPromociones(slug) {
  const respuesta = await fetch(`${BASE_URL}/publico/sedes/${encodeURIComponent(slug)}/promociones`);
  return leer(respuesta, 'No pudimos cargar las promociones');
}

/** HU-27 — { sede, promocion } con las condiciones. 404 si ya no está vigente o no es de la sede. */
export async function obtenerPromocion(slug, id) {
  const respuesta = await fetch(`${BASE_URL}/publico/sedes/${encodeURIComponent(slug)}/promociones/${encodeURIComponent(id)}`);
  return leer(respuesta, 'No pudimos cargar la promoción');
}
