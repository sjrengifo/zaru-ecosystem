// Filtros de seguridad que se ponen antes de las rutas.
import { supabase } from '../config/supabase.js';
import { crearAccesoTenant } from '../shared/tenant.js';
import { registrarAuditoria } from '../shared/auditoria.js';
import { AppError } from '../shared/errores.js';

/** Lee el campo `exp` del token sin verificarlo (la verificación la hace Supabase Auth). */
function expiracionDelToken(token) {
  try {
    const { exp } = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return typeof exp === 'number' ? new Date(exp * 1000).toISOString() : null;
  } catch {
    return null;
  }
}

/** HU-44 CA3: token ausente, vencido o inválido → 401 y el panel pide iniciar sesión de nuevo. */
function noAutenticado(res, mensaje) {
  res.set('WWW-Authenticate', 'Bearer error="invalid_token"');
  return new AppError('NO_AUTENTICADO', mensaje);
}

/**
 * Exige una sesión válida (HU-01, HU-44) y fija el establecimiento del usuario (HU-41).
 * El frontend envía el token de Supabase Auth en:  Authorization: Bearer <token>
 *
 * Deja disponible:
 * - req.ctx:     { usuarioId, rol, establecimientoId, tokenExpira }
 * - req.usuario: { id, nombre, rol, establecimientoId } (compatibilidad)
 * - req.tenant:  acceso a datos filtrado por el establecimiento (shared/tenant.js)
 *
 * El rol y el establecimiento se leen de `perfiles` en cada petición, nunca de la petición ni de
 * los claims del token: así una desactivación o un cambio de rol aplica de inmediato (RF-F1-02).
 */
export async function requiereSesion(req, res, next) {
  try {
    const encabezado = req.get('authorization') ?? '';
    const [esquema, token] = encabezado.split(' ');
    if (esquema !== 'Bearer' || !token) throw noAutenticado(res, 'Debes iniciar sesión');

    // Supabase Auth verifica firma, expiración y que la sesión no se haya cerrado.
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) throw noAutenticado(res, 'Tu sesión venció o no es válida. Inicia sesión de nuevo');

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
      tokenExpira: expiracionDelToken(token),
    };
    req.usuario = { id: perfil.id, nombre: perfil.nombre, rol: perfil.rol, establecimientoId: perfil.establecimiento_id };
    req.tenant = crearAccesoTenant(supabase, req.ctx);
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * HU-44 CA2: deja pasar solo a los roles indicados. Si el rol no está permitido, responde 403
 * y registra el intento en la auditoría con resultado "denegado".
 *   router.post('/', requiereRol('admin'), ctrl.crear);
 */
export function requiereRol(...roles) {
  return async function verificarRol(req, res, next) {
    if (roles.includes(req.ctx?.rol)) return next();
    await registrarAuditoria(req, {
      resultado: 'denegado',
      motivo: `Rol ${req.ctx?.rol ?? 'desconocido'} sin permiso; requiere ${roles.join(' o ')}`,
    });
    next(new AppError('SIN_PERMISO', 'No tienes permiso para realizar esta acción'));
  };
}

/** Atajo para las funciones exclusivas del administrador (HU-02 CA2). */
export const soloAdmin = requiereRol('admin');
