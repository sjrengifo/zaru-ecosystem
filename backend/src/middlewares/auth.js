// Filtros de seguridad que se ponen antes de las rutas.
import { supabase } from '../config/supabase.js';
import { crearAccesoTenant } from '../shared/tenant.js';
import { AppError } from '../shared/errores.js';

/**
 * Exige que el usuario haya iniciado sesión (HU-01) y fija su establecimiento (HU-41).
 * El frontend envía el token en el encabezado:  Authorization: Bearer <token>
 *
 * Si es válido, deja disponible:
 * - req.usuario: { id, nombre, rol, establecimientoId }
 * - req.ctx:     { usuarioId, rol, establecimientoId }
 * - req.tenant:  acceso a datos filtrado por el establecimiento (shared/tenant.js)
 *
 * El rol y el establecimiento se leen de la tabla `perfiles`; nunca de la petición (HU-41 CA1).
 */
export async function requiereSesion(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) throw new AppError('NO_AUTENTICADO', 'Debes iniciar sesión');

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) throw new AppError('NO_AUTENTICADO', 'Sesión inválida o vencida');

    const { data: perfil } = await supabase
      .from('perfiles')
      .select('id, nombre, rol, activo, establecimiento_id')
      .eq('id', data.user.id)
      .maybeSingle();

    // HU-02 CA3: un usuario desactivado o sin perfil no puede entrar.
    if (!perfil || !perfil.activo) throw new AppError('SIN_PERMISO', 'Usuario sin acceso');

    req.ctx = {
      usuarioId: perfil.id,
      rol: perfil.rol,
      establecimientoId: perfil.establecimiento_id,
    };
    req.usuario = { id: perfil.id, nombre: perfil.nombre, rol: perfil.rol, establecimientoId: perfil.establecimiento_id };
    req.tenant = crearAccesoTenant(supabase, req.ctx);
    next();
  } catch (err) {
    next(err);
  }
}

/** Solo deja pasar a administradores (HU-02 CA2). */
export function soloAdmin(req, res, next) {
  if (req.usuario?.rol !== 'admin') {
    return next(new AppError('SIN_PERMISO', 'Solo el administrador puede hacer esto'));
  }
  next();
}
