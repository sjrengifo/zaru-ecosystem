// Filtros de seguridad que se ponen antes de las rutas.
import { supabase } from '../config/supabase.js';

/**
 * Exige que el usuario haya iniciado sesión (HU-01).
 * El frontend envía el token en el encabezado:  Authorization: Bearer <token>
 * Si es válido, deja disponible en req.usuario: { id, nombre, rol, establecimientoId }
 */
export async function requiereSesion(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Debes iniciar sesión' });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: 'Sesión inválida o vencida' });

    const { data: perfil } = await supabase
      .from('perfiles')
      .select('id, nombre, rol, activo, establecimiento_id')
      .eq('id', data.user.id)
      .single();

    // HU-02 CA3: un operario desactivado no puede entrar.
    if (!perfil || !perfil.activo) return res.status(403).json({ error: 'Usuario sin acceso' });

    req.usuario = {
      id: perfil.id,
      nombre: perfil.nombre,
      rol: perfil.rol,
      establecimientoId: perfil.establecimiento_id, // ← multi-tenant
    };
    next();
  } catch (err) {
    next(err);
  }
}

/** Solo deja pasar a administradores (HU-02 CA2). */
export function soloAdmin(req, res, next) {
  if (req.usuario?.rol !== 'admin') {
    return res.status(403).json({ error: 'Solo el administrador puede hacer esto' });
  }
  next();
}
