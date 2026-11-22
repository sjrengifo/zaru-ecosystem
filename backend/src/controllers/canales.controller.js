// HU-31/HU-39 — Preferencias de canales de la sede.
// Solo cambian qué canales se ofrecen en la prueba; los avisos operativos y el fallback siguen
// intactos. El establecimiento siempre sale de req.tenant (HU-41).
import { armarPreferenciasCanales } from '../shared/preferenciasCanales.js';

/** GET /configuracion/canales — SMS, correo y push con su preferencia y disponibilidad real. */
export async function obtener(req, res, next) {
  try {
    const { data, error } = await req.tenant.listar('config_canales', 'canal, activo');
    if (error) throw error;
    res.json(armarPreferenciasCanales(data ?? []));
  } catch (err) {
    next(err);
  }
}

/** PUT /configuracion/canales — guarda las preferencias de esta sede en una sola operación. */
export async function actualizar(req, res, next) {
  try {
    const filas = await req.tenant.rpc('guardar_preferencias_canales', { p_canales: req.body.canales });
    res.json(armarPreferenciasCanales(filas ?? []));
  } catch (err) {
    next(err);
  }
}
