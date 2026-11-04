// HU-02 CA3 — Revalidación en segundo plano de la sesión.
// Al volver a la pestaña se comprueba /me para revocar una sesión abierta de un
// operario desactivado. El intervalo evita una consulta por cada cambio de foco.
export const INTERVALO_REVALIDACION_MS = 30_000;

/** ¿Pasó suficiente tiempo desde la última revalidación? */
export function debeRevalidar(ahora, ultima = 0, intervalo = INTERVALO_REVALIDACION_MS) {
  if (!Number.isFinite(ahora) || !Number.isFinite(ultima)) return false;
  return ultima <= 0 || ahora - ultima >= intervalo;
}
