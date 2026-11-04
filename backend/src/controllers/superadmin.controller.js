// HU-57 — Administración de la plataforma Zaru (solo superadministrador).
// Opera sobre todos los establecimientos, por eso no usa req.tenant (excepción documentada en
// tests/unit/sin-acceso-directo.test.js).
//
// Ciclo de vida:  prueba ──(vence)──▶ pendiente_activacion ──▶ activo ⇄ suspendido
//                    └───────────────(activar)──────────────────┘
// Cada alta, activación, suspensión y reenvío de invitación queda en la auditoría (HU-44).
import { supabase } from '../config/supabase.js';
import { AppError, noEncontrado } from '../shared/errores.js';
import { registrarAuditoria } from '../shared/auditoria.js';

const COLUMNAS = 'id, nombre, plan, estado, prueba_inicia_at, prueba_finaliza_at, activado_at, created_at';
const DIA_MS = 24 * 60 * 60 * 1000;

/** Estados desde los que se permite cada acción. */
export const TRANSICIONES = {
  activar: ['prueba', 'pendiente_activacion', 'suspendido'],
  suspender: ['prueba', 'activo', 'pendiente_activacion'],
};

const urlInvitacion = () => `${process.env.FRONTEND_URL || 'http://localhost:5173'}/aceptar-invitacion`;

/** Días que le quedan a un periodo de prueba (0 si ya venció); null si no está en prueba. */
export function diasRestantes(establecimiento, ahora = new Date()) {
  if (establecimiento?.estado !== 'prueba' || !establecimiento.prueba_finaliza_at) return null;
  return Math.max(0, Math.ceil((new Date(establecimiento.prueba_finaliza_at) - ahora) / DIA_MS));
}

async function actualizarPruebasVencidas() {
  const ahora = new Date().toISOString();
  const { error } = await supabase
    .from('establecimientos')
    .update({ estado: 'pendiente_activacion' })
    .eq('estado', 'prueba')
    .lte('prueba_finaliza_at', ahora);
  if (error) throw error;
}

/**
 * Administrador inicial de cada establecimiento con su correo y si ya aceptó la invitación.
 * El correo vive en Supabase Auth; si Auth no responde, el listado se muestra igual sin él.
 */
async function administradoresDe(ids) {
  if (!ids.length) return {};
  const { data: perfiles, error } = await supabase
    .from('perfiles')
    .select('id, nombre, establecimiento_id, created_at')
    .eq('rol', 'admin')
    .in('establecimiento_id', ids)
    .order('created_at');
  if (error) throw error;

  const usuarios = new Map();
  try {
    const { data, error: errorAuth } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (errorAuth) throw errorAuth;
    for (const u of data?.users ?? []) usuarios.set(u.id, u);
  } catch (err) {
    console.error('[HU-57] No se pudieron consultar los correos de los administradores:', err.message);
  }

  const porEstablecimiento = {};
  for (const p of perfiles ?? []) {
    if (porEstablecimiento[p.establecimiento_id]) continue; // el primero es el administrador inicial
    const usuario = usuarios.get(p.id);
    porEstablecimiento[p.establecimiento_id] = {
      nombre: p.nombre,
      correo: usuario?.email ?? null,
      invitacionAceptada: usuario ? Boolean(usuario.email_confirmed_at) : null,
    };
  }
  return porEstablecimiento;
}

/** GET: lista global, con filtros opcionales ?estado= y ?buscar= (nombre). */
export async function listar(req, res, next) {
  try {
    await actualizarPruebasVencidas();
    let consulta = supabase
      .from('establecimientos')
      .select(COLUMNAS)
      .order('created_at', { ascending: false });
    const { estado, buscar } = req.query ?? {};
    if (estado) consulta = consulta.eq('estado', estado);
    if (buscar) consulta = consulta.ilike('nombre', `%${buscar.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
    const { data, error } = await consulta;
    if (error) throw error;

    const lista = data ?? [];
    const administradores = await administradoresDe(lista.map((e) => e.id));
    res.json(lista.map((e) => ({
      ...e,
      dias_restantes: diasRestantes(e),
      administrador: administradores[e.id] ?? null,
    })));
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
    const fin = new Date(inicio.getTime() + diasPrueba * DIA_MS);

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
        redirectTo: urlInvitacion(),
      },
    );
    if (errorInvitacion) throw new AppError('CONFLICTO', 'No se pudo enviar la invitación al administrador inicial. Verifica que el correo no tenga ya una cuenta.', [
      { campo: 'correoAdministrador', mensaje: 'Este correo no se pudo invitar: puede que ya tenga una cuenta en Zaru' },
    ]);

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

    await registrarAuditoria(req, {
      accion: 'superadmin.establecimiento.registrar',
      recurso: 'establecimientos',
      recursoId: establecimientoId,
      resultado: 'permitido',
      detalle: { plan, diasPrueba },
    });

    res.status(201).json({
      establecimiento: {
        ...establecimiento,
        dias_restantes: diasRestantes(establecimiento),
        administrador: { nombre: nombreInicial, correo: correoAdministrador, invitacionAceptada: false },
      },
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

async function obtenerEstablecimiento(id) {
  const { data, error } = await supabase.from('establecimientos').select(COLUMNAS).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw noEncontrado('Establecimiento');
  return data;
}

const ETIQUETA_ESTADO = { prueba: 'en prueba', activo: 'activo', pendiente_activacion: 'pendiente de activación', suspendido: 'suspendido' };

async function cambiarEstado(req, res, next, accion) {
  try {
    await actualizarPruebasVencidas();
    const actual = await obtenerEstablecimiento(req.params.id);
    if (!TRANSICIONES[accion].includes(actual.estado)) {
      throw new AppError('CONFLICTO', `No se puede ${accion} un establecimiento ${ETIQUETA_ESTADO[actual.estado] ?? actual.estado}`);
    }

    const estado = accion === 'activar' ? 'activo' : 'suspendido';
    const { data, error } = await supabase
      .from('establecimientos')
      .update({
        estado,
        ...(estado === 'activo' ? { activado_at: new Date().toISOString() } : {}),
      })
      .eq('id', actual.id)
      .eq('estado', actual.estado) // si otro superadministrador lo cambió primero, no se pisa
      .select(COLUMNAS)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new AppError('CONFLICTO', 'El estado del establecimiento cambió mientras tanto. Actualiza el listado.');

    await registrarAuditoria(req, {
      accion: `superadmin.establecimiento.${accion}`,
      recurso: 'establecimientos',
      recursoId: actual.id,
      resultado: 'permitido',
      motivo: req.body?.motivo ?? null,
      detalle: { desde: actual.estado, hacia: estado },
    });
    res.json({ ...data, dias_restantes: diasRestantes(data) });
  } catch (err) {
    next(err);
  }
}

export const activar = (req, res, next) => cambiarEstado(req, res, next, 'activar');
// CA3: suspender solo cambia el estado; los datos se conservan y el acceso se niega en auth.js y RLS.
export const suspender = (req, res, next) => cambiarEstado(req, res, next, 'suspender');

/**
 * POST /:id/reenviar-invitacion — vuelve a enviar la invitación al administrador inicial si aún no
 * la aceptó (p. ej. el enlace venció o el correo llegó a spam).
 */
export async function reenviarInvitacion(req, res, next) {
  try {
    const establecimiento = await obtenerEstablecimiento(req.params.id);
    if (establecimiento.estado === 'suspendido') {
      throw new AppError('CONFLICTO', 'El establecimiento está suspendido: actívalo antes de reenviar la invitación');
    }

    const { data: perfil, error } = await supabase
      .from('perfiles')
      .select('id')
      .eq('establecimiento_id', establecimiento.id)
      .eq('rol', 'admin')
      .order('created_at')
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!perfil) throw noEncontrado('Administrador del establecimiento');

    const { data: usuario, error: errorUsuario } = await supabase.auth.admin.getUserById(perfil.id);
    if (errorUsuario || !usuario?.user?.email) throw noEncontrado('Administrador del establecimiento');
    if (usuario.user.email_confirmed_at) {
      throw new AppError('CONFLICTO', 'El administrador ya aceptó la invitación. Si olvidó su contraseña, puede recuperarla desde el inicio de sesión.');
    }

    const correo = usuario.user.email;
    const { error: errorInvitacion } = await supabase.auth.admin.inviteUserByEmail(correo, { redirectTo: urlInvitacion() });
    if (errorInvitacion) throw new AppError('CONFLICTO', 'No se pudo reenviar la invitación. Intenta de nuevo en unos minutos.');

    await registrarAuditoria(req, {
      accion: 'superadmin.establecimiento.reenviar_invitacion',
      recurso: 'establecimientos',
      recursoId: establecimiento.id,
      resultado: 'permitido',
    });
    res.json({ correo, enviada: true });
  } catch (err) {
    next(err);
  }
}
