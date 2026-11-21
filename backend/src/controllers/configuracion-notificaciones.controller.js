// HU-31 — Configuración de los estados que generan notificación.
// GET devuelve los cinco estados del flujo; PUT guarda los interruptores del establecimiento
// de la sesión. El aislamiento lo aporta req.tenant (HU-41) y la base vuelve a validar el "listo".
import { armarConfiguracion } from '../shared/configNotificaciones.js';

/** CA1: estados del flujo con su interruptor, en el orden en que los vive el cliente. */
export async function obtener(req, res, next) {
  try {
    const { data, error } = await req.tenant.listar('config_notificaciones', 'estado, activo');
    if (error) throw error;
    res.json(armarConfiguracion(data ?? []));
  } catch (err) {
    next(err);
  }
}

/** CA2 y CA3: guardar los interruptores de esta sede; "listo" siempre queda activo. */
export async function actualizar(req, res, next) {
  try {
    const filas = await req.tenant.rpc('guardar_config_notificaciones', { p_config: req.body });
    res.json(armarConfiguracion(filas ?? []));
  } catch (err) {
    next(err);
  }
}
