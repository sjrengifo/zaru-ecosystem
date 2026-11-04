import { supabase } from '../config/supabase.js';
import { AppError, noEncontrado } from '../shared/errores.js';

const COLUMNAS = 'id, nombre, plan, estado, prueba_inicia_at, prueba_finaliza_at, activado_at, created_at';

async function actualizarPruebasVencidas() {
  const ahora = new Date().toISOString();
  const { error } = await supabase
    .from('establecimientos')
    .update({ estado: 'pendiente_activacion' })
    .eq('estado', 'prueba')
    .lte('prueba_finaliza_at', ahora);
  if (error) throw error;
}

/** GET: lista global exclusiva del superadministrador. */
export async function listar(req, res, next) {
  try {
    await actualizarPruebasVencidas();
    const { data, error } = await supabase
      .from('establecimientos')
      .select(COLUMNAS)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data ?? []);
  } catch (err) {
    next(err);
  }
}

/**
 * Crea el tenant e invita al administrador inicial.
 * Supabase no ofrece una transacción distribuida entre Auth y Postgres; ante un fallo se
 * compensan las operaciones ya realizadas (eliminando el usuario invitado y el tenant).
 */
export async function crear(req, res, next) {
  let establecimientoId;
  let usuarioId;
  try {
    const { nombre, plan, correoAdministrador, diasPrueba } = req.body;
    const inicio = new Date();
    const fin = new Date(inicio.getTime() + diasPrueba * 24 * 60 * 60 * 1000);

    const { data: establecimiento, error: errorEstablecimiento } = await supabase
      .from('establecimientos')
      .insert({
        nombre,
        plan,
        estado: 'prueba',
        prueba_inicia_at: inicio.toISOString(),
        prueba_finaliza_at: fin.toISOString(),
      })
      .select(COLUMNAS)
      .single();
    if (errorEstablecimiento) throw errorEstablecimiento;
    establecimientoId = establecimiento.id;

    const nombreInicial = correoAdministrador.split('@')[0].slice(0, 80);
    const { data: invitacion, error: errorInvitacion } = await supabase.auth.admin.inviteUserByEmail(
      correoAdministrador,
      {
        data: { nombre: nombreInicial },
        redirectTo: `${ process.env.FRONTEND_URL || 'http://localhost:5173'}/aceptar-invitacion`,
      },
    );
    if (errorInvitacion) throw new AppError('CONFLICTO', 'No se pudo enviar la invitación al administrador inicial. Verifica que el correo no tenga ya una cuenta.');

    usuarioId = invitacion.user?.id;
    if (!usuarioId) throw new Error('Supabase no devolvió el usuario invitado');

    const { error: errorPerfil } = await supabase.from('perfiles').insert({
      id: usuarioId,
      establecimiento_id: establecimientoId,
      nombre: nombreInicial,
      rol: 'admin',
      activo: true,
    });
    if (errorPerfil) throw errorPerfil;

    res.status(201).json({
      establecimiento,
      invitacion: { correo: correoAdministrador, enviada: true },
    });
  } catch (err) {
    // Compensación best-effort. Se conserva el error original para no ocultar la causa.
    if (usuarioId) {
      const { error } = await supabase.auth.admin.deleteUser(usuarioId);
      if (error) console.error(`[HU-57] No se pudo revertir usuario invitado ${usuarioId}:`, error.message);
    }
    if (establecimientoId) {
      const { error } = await supabase.from('establecimientos').delete().eq('id', establecimientoId);
      if (error) console.error(`[HU-57] No se pudo revertir establecimiento ${establecimientoId}:`, error.message);
    }
    next(err instanceof AppError ? err : new AppError('CONFLICTO', 'No fue posible completar el registro del establecimiento. No se confirmó el alta; revisa el estado en el panel antes de reintentar.'));
  }
}

async function cambiarEstado(req, res, next, estado) {
  try {
    await actualizarPruebasVencidas();
    const { data, error } = await supabase
      .from('establecimientos')
      .update({
        estado,
        ...(estado === 'activo' ? { activado_at: new Date().toISOString() } : {}),
      })
      .eq('id', req.params.id)
      .select(COLUMNAS)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw noEncontrado('Establecimiento');
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export const activar = (req, res, next) => cambiarEstado(req, res, next, 'activo');
export const suspender = (req, res, next) => cambiarEstado(req, res, next, 'suspendido');
