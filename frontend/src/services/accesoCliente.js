// HU-17 — Llamadas públicas del acceso del cliente final. No usan la sesión del panel.
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';

const ruta = (slug) => `${BASE_URL}/publico/sedes/${encodeURIComponent(slug)}`;

async function leer(respuesta, mensajePorDefecto) {
  const json = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    const error = new Error(json.error?.mensaje || mensajePorDefecto);
    error.status = respuesta.status;
    error.codigo = json.error?.codigo;
    error.detalles = json.error?.detalles;
    throw error;
  }
  return json;
}

/** Nombre y marca de la sede del enlace. */
export async function obtenerSede(slug) {
  return leer(await fetch(ruta(slug)), 'No pudimos cargar el car wash');
}

/** CA1 / CA4: { placa } o { celular } → { sede, resultados: [{ codigo, placa }] }. */
export async function buscarVehiculo(slug, cuerpo) {
  const respuesta = await fetch(`${ruta(slug)}/buscar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
    cache: 'no-store',
  });
  return leer(respuesta, 'No pudimos buscar tu vehículo');
}
