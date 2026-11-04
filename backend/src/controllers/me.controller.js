// HU-44 CA1 / HU-57 — Datos de la sesión actual.
export async function obtener(req, res, next) {
  try {
    if (req.ctx.rol === 'superadmin') {
      return res.json({
        usuario: {
          id: req.usuario.id,
          nombre: req.usuario.nombre,
          rol: req.ctx.rol,
        },
        establecimiento: null,
        sesion: { expiraEn: req.ctx.tokenExpira },
      });
    }

    const { data: establecimiento, error } = await req.tenant
      .listar(
        'establecimientos',
        'id, nombre, logo_url, color_primario, color_secundario, plan, estado',
      )
      .single();

    if (error) throw error;

    res.json({
      usuario: {
        id: req.usuario.id,
        nombre: req.usuario.nombre,
        rol: req.ctx.rol,
      },
      establecimiento,
      sesion: { expiraEn: req.ctx.tokenExpira },
    });
  } catch (err) {
    next(err);
  }
}