// HU-30 CA3 — Página pública "dejar de recibir" y política de datos. No usan la sesión del panel.
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';

async function leer(respuesta, mensajePorDefecto) {
  const json = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    const error = new Error(json.error?.mensaje || mensajePorDefecto);
    error.status = respuesta.status;
    throw error;
  }
  return json;
}

const ruta = (token) => `${BASE_URL}/publico/baja/${encodeURIComponent(token)}`;

/** Qué autorización se va a retirar y de qué establecimiento. */
export async function consultarBaja(token) {
  return leer(await fetch(ruta(token), { cache: 'no-store' }), 'No pudimos cargar esta página');
}

/** Retira la autorización y devuelve la fecha y hora en que quedó registrada. */
export async function confirmarBaja(token) {
  return leer(await fetch(ruta(token), { method: 'POST', cache: 'no-store' }), 'No pudimos registrar tu solicitud');
}

/** Política de tratamiento de datos vigente (pública). */
export async function obtenerPoliticaVigente() {
  return leer(await fetch(`${BASE_URL}/politicas-datos/vigente`), 'No pudimos cargar la política');
}
