// HU-26 — Promociones vigentes de la sede para el cliente final (RF-F5-09).
//
// GET /publico/sedes/{slug}/promociones → { sede, promociones }. Público y sin datos personales.
// HU-27 — GET /publico/sedes/{slug}/promociones/{id} → { sede, promocion } con sus condiciones (RF-F5-10).
// La lógica (vigencia, aislamiento por sede y marca) está en shared/promocionesPublicas.js.
import { listarPromocionesVigentes, obtenerPromocionVigente } from '../shared/promocionesPublicas.js';

/** Promociones vigentes hoy en la sede del enlace, con su marca. */
export async function listar(req, res, next) {
  try {
    const resultado = await listarPromocionesVigentes(req.params.slug);
    // Igual que la sede: un minuto de caché basta, la vigencia cambia por día.
    res.set('Cache-Control', 'public, max-age=60');
    res.json(resultado);
  } catch (err) {
    next(err);
  }
}

/** Detalle de una promoción vigente de la sede del enlace, con sus condiciones (HU-27). */
export async function obtener(req, res, next) {
  try {
    const resultado = await obtenerPromocionVigente(req.params.slug, req.params.id);
    res.set('Cache-Control', 'public, max-age=60');
    res.json(resultado);
  } catch (err) {
    next(err);
  }
}
