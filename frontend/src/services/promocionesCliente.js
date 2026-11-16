// HU-26 — Promociones vigentes de la sede para el cliente final. Pública: no usa la sesión del panel.
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';

/** { sede, promociones } de la sede del enlace. Lanza un Error con `status` si la API responde un error. */
export async function listarPromociones(slug) {
  const respuesta = await fetch(`${BASE_URL}/publico/sedes/${encodeURIComponent(slug)}/promociones`);
  const json = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    const error = new Error(json.error?.mensaje || 'No pudimos cargar las promociones');
    error.status = respuesta.status;
    error.codigo = json.error?.codigo;
    throw error;
  }
  return json;
}
