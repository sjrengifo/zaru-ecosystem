// HU-44 CA1 / HU-57 / HU-59 — Datos de la sesión actual, incluidos los módulos que puede usar su rol.
import { permisosDe } from '../shared/permisos.js';

export async function obtener(req, res, next) {
  try {
    const usuario = { id: req.usuario.id, nombre: req.usuario.nombre, rol: req.ctx.rol };
    const sesion = { expiraEn: req.ctx.tokenExpira };
    const permisos = permisosDe(req.ctx.rol); // HU-59: el panel arma el menú con esta lista

    if (req.ctx.rol === 'superadmin') {
      return res.json({ usuario, establecimiento: null, permisos, sesion });
    }

    const { data: establecimiento, error } = await req.tenant
      .listar(
        'establecimientos',
        'id, nombre, logo_url, color_primario, color_secundario, plan, estado',
      )
      .single();

    if (error) throw error;

    res.json({ usuario, establecimiento, permisos, sesion });
  } catch (err) {
    next(err);
  }
}
