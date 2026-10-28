// HU-44 CA1 / HU-01 — Datos de la sesión actual: usuario, rol, establecimiento y vencimiento del token.

export async function obtener(req, res, next) {
  try {
    const establecimiento = await req.tenant.obtener(
      'establecimientos',
      req.tenant.establecimientoId,
      'id, nombre, logo_url, color_primario, color_secundario',
      'Establecimiento',
    );
    res.json({
      usuario: { id: req.usuario.id, nombre: req.usuario.nombre, rol: req.ctx.rol },
      establecimiento,
      sesion: { expiraEn: req.ctx.tokenExpira },
    });
  } catch (err) {
    next(err);
  }
}
