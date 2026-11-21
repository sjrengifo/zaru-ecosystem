// HU-34 (RF-F6-15 a RF-F6-19) — Worker de la cola de notificaciones.
//
// Se inicia SOLO desde el punto de entrada del servidor (src/index.js), nunca desde app.js: así las
// pruebas de la API no arrancan temporizadores ni envíos reales. Procesa en segundo plano y no
// bloquea ninguna operación del car wash (RNF-F6-01).
//
// Si la migración de HU-34 todavía no está aplicada, `registrarIntento` ignora el error y el envío
// sigue funcionando (la bitácora simplemente no muestra el detalle por intento).
import { supabase } from '../config/supabase.js';
import { procesarCola } from './notificaciones.js';
import { escalaMinutosPruebas, materializarCampanas } from './campanas.js';

export const INTERVALO_WORKER_MS = 15_000;

/**
 * Arranca el worker. Devuelve una función para detenerlo (SIGTERM/SIGINT).
 * @param {{ intervaloMs?: number, db?: object, limite?: number }} opciones
 */
export function iniciarWorkerNotificaciones({ intervaloMs = INTERVALO_WORKER_MS, db = supabase, limite = 20 } = {}) {
  let detenido = false;
  let temporizador = null;
  let ejecutando = false;

  async function tick() {
    if (detenido || ejecutando) return;
    ejecutando = true;
    try {
      // HU-35: primero se materializan las campañas vencidas (las convierte en filas de la cola) y
      // después se procesa la cola, que ya respeta la prioridad comercial.
      try {
        const campanas = await materializarCampanas(db);
        if (campanas.length) {
          console.log(`[HU-35] Campañas materializadas: ${campanas.length}`);
        }
      } catch (err) {
        // Si la migración de HU-35 aún no está aplicada, la cola operativa debe seguir funcionando.
        console.error('[HU-35] No se pudieron materializar las campañas:', err?.message ?? err);
      }
      const procesadas = await procesarCola(db, { limite });
      if (procesadas.length) {
        console.log(`[HU-34] Cola de notificaciones: ${procesadas.length} procesada(s)`);
      }
    } catch (err) {
      // Un fallo del worker nunca tumba la API.
      console.error('[HU-34] Error procesando la cola de notificaciones:', err?.message ?? err);
    } finally {
      ejecutando = false;
      if (!detenido) temporizador = setTimeout(tick, intervaloMs);
    }
  }

  // Deja constancia en el arranque de si la escala de validación local está activa (HU-35).
  const escala = escalaMinutosPruebas();
  if (escala) {
    console.info(
      `[HU-35] Escala de validación local activa: 30 → ${escala[30]} min, 60 → ${escala[60]} min, 90 → ${escala[90]} min`,
    );
  }

  // Primera pasada pronto, pero después de que el servidor termine de arrancar.
  temporizador = setTimeout(tick, 1_000);

  return function detener() {
    detenido = true;
    if (temporizador) clearTimeout(temporizador);
  };
}
