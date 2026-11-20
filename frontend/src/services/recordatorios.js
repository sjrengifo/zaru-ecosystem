// HU-36 CA3 — Página pública para dejar de recibir recordatorios de un vehículo.
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

const ruta = (token) => `${BASE_URL}/publico/recordatorios/${encodeURIComponent(token)}/desactivar`;

export async function consultarRecordatorio(token) {
  return leer(await fetch(ruta(token), { cache: 'no-store' }), 'No pudimos cargar esta página');
}

export async function desactivarRecordatorio(token) {
  return leer(await fetch(ruta(token), { method: 'POST', cache: 'no-store' }), 'No pudimos registrar tu solicitud');
}
