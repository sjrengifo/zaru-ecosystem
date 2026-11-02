// HU-13 — Lógica del establecimiento y su branding.
// TODO: subir el logo a Supabase Storage (bucket "logos"), validar PNG/JPG y máx. 2 MB (CA3).
import { pendiente } from './pendiente.js';

/** El establecimiento de la sesión: en esta tabla el identificador de tenant es el propio id. */
export async function obtener(req, res, next) {
  try {
    res.json(await req.tenant.obtener('establecimientos', req.tenant.establecimientoId, '*', 'Establecimiento'));
  } catch (err) {
    next(err);
  }
}

export const actualizarBranding = pendiente('HU-13');
