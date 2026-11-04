// HU-02 — Usuarios operarios del establecimiento.
//
// El correo y la contraseña viven en Supabase Auth; `perfiles` guarda nombre, rol y estado.
// La cuenta se crea con una invitación por correo. Si el correo no puede enviarse (SMTP,
// límite de envíos o URL de redirección), se genera un enlace seguro de un solo uso que el
// administrador puede compartir. Nunca se genera ni se muestra una contraseña.
import { supabase } from '../config/supabase.js';
import { AppError } from '../shared/errores.js';

const COLUMNAS = 'id, nombre, rol, activo, created_at';
const RECURSO = 'Usuario';
const POR_PAGINA = 200;

function urlInvitacion() {
  const base = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
  return `${base}/aceptar-invitacion`;
}

function opcionesInvitacion(nombre) {
  return { data: { nombre }, redirectTo: urlInvitacion() };
}

/**
 * Recorre las cuentas de Auth por páginas hasta que `visitar` pida detenerse.
 * La Admin API no permite buscar por correo ni pedir varios ids a la vez.
 */
async function recorrerCuentasAuth(visitar) {
  let pagina = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page: pagina, perPage: POR_PAGINA });
    if (error) throw error;

    const usuarios = data?.users ?? [];
    if (visitar(usuarios) || usuarios.length === 0 || data?.nextPage == null) return;
    pagina = data.nextPage;
  }
}

/** Correo de cada cuenta pedida, por id. Las cuentas que no aparezcan quedan fuera del mapa. */
async function correosDe(ids) {
  const pendientes = new Set(ids);
  const correos = new Map();
  if (pendientes.size === 0) return correos;

  await recorrerCuentasAuth((usuarios) => {
    for (const cuenta of usuarios) {
      if (!pendientes.has(cuenta.id)) continue;
      correos.set(cuenta.id, (cuenta.email ?? '').toLowerCase());
      pendientes.delete(cuenta.id);
    }
    return pendientes.size === 0;
  });

  return correos;
}

/** Cuenta de Auth con ese correo, si ya existe en cualquier establecimiento. */
async function cuentaConCorreo(correo) {
  let encontrada = null;
  await recorrerCuentasAuth((usuarios) => {
    encontrada = usuarios.find((cuenta) => (cuenta.email ?? '').toLowerCase() === correo) ?? null;
    return encontrada !== null;
  });
  return encontrada;
}

/** Un perfil ya creado impide reutilizar la cuenta: el correo está en uso. */
async function tienePerfil(usuarioId) {
  const { data, error } = await supabase
    .from('perfiles')
    .select('id')
    .eq('id', usuarioId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

/**
 * Genera un enlace de invitación sin depender del envío de correo.
 * Se reintenta sin `redirectTo` por si esa URL no está permitida en Supabase.
 */
async function generarEnlaceInvitacion(correo, opciones) {
  const intentos = opciones?.redirectTo
    ? [opciones, { ...opciones, redirectTo: undefined }]
    : [opciones ?? {}];

  let ultimoError = null;
  for (const intento of intentos) {
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'invite',
      email: correo,
      options: intento,
    });
    if (!error && data?.properties?.action_link) {
      return { enlace: data.properties.action_link, usuario: data.user, error: null };
    }
    ultimoError = error;
  }
  return { enlace: null, usuario: null, error: ultimoError };
}

/** Crea la cuenta de Auth si no existe y devuelve su id. */
async function asegurarCuentaAuth(correo, nombre) {
  const existente = await cuentaConCorreo(correo);
  if (existente) return { usuario: existente, creada: false };

  const { data, error } = await supabase.auth.admin.createUser({
    email: correo,
    email_confirm: false,
    user_metadata: { nombre },
  });
  if (!error) return { usuario: data.user, creada: true };

  // Otra petición pudo crearla entre la consulta y la creación.
  const otra = await cuentaConCorreo(correo);
  if (otra) return { usuario: otra, creada: false };
  throw error;
}

function publico(perfil, correo) {
  return {
    id: perfil.id,
    nombre: perfil.nombre,
    correo,
    rol: perfil.rol,
    activo: perfil.activo,
    created_at: perfil.created_at,
  };
}

/** GET: solo los operarios del establecimiento de la sesión. */
export async function listar(req, res, next) {
  try {
    const { data, error } = await req.tenant
      .listar('perfiles', COLUMNAS)
      .eq('rol', 'operario')
      .order('nombre');
    if (error) throw error;

    const perfiles = data ?? [];
    const correos = await correosDe(perfiles.map((perfil) => perfil.id));
    res.json(perfiles.map((perfil) => publico(perfil, correos.get(perfil.id) ?? '')));
  } catch (err) {
    next(err);
  }
}

/** POST: invita al operario y crea su perfil con rol fijo 'operario' en el tenant de la sesión. */
export async function crear(req, res, next) {
  const { nombre, correo } = req.body;
  let usuarioId;
  let perfilCreado = false;
  let cuentaCreadaAqui = false;
  let enlace = null;
  let enviada = false;

  try {
    if (!req.ctx.establecimientoId) {
      throw new AppError('SIN_PERMISO', 'La sesión no tiene un establecimiento asociado');
    }

    const existente = await cuentaConCorreo(correo);
    if (existente) {
      if (existente.email_confirmed_at || (await tienePerfil(existente.id))) {
        throw new AppError('CONFLICTO', 'Ya existe una cuenta con ese correo electrónico');
      }

      // Cuenta creada por una invitación anterior que no llegó a tener perfil:
      // se reutiliza para no duplicar el correo.
      usuarioId = existente.id;
      const generado = await generarEnlaceInvitacion(correo, opcionesInvitacion(nombre));
      if (generado.error || !generado.usuario?.id) {
        console.error('[HU-02] No se pudo generar el enlace de invitación:', generado.error?.message);
        throw new AppError('ERROR_INTERNO', 'No se pudo generar la invitación del operario. Intenta de nuevo.');
      }
      usuarioId = generado.usuario.id;
      enlace = generado.enlace;
    } else {
      const { data: invitacion, error: errorInvitacion } = await supabase.auth.admin.inviteUserByEmail(
        correo,
        opcionesInvitacion(nombre),
      );

      if (!errorInvitacion && invitacion?.user?.id) {
        usuarioId = invitacion.user.id;
        cuentaCreadaAqui = true;
        enviada = true;
      } else {
        if (errorInvitacion) {
          console.warn(
            '[HU-02] El correo de invitación no pudo enviarse; se genera un enlace seguro:',
            errorInvitacion.message,
          );
        }

        // La invitación pudo crear la cuenta aunque el envío fallara.
        const creada = await asegurarCuentaAuth(correo, nombre);
        usuarioId = creada.usuario?.id;
        cuentaCreadaAqui = creada.creada;
        if (!usuarioId) throw new Error('Supabase no devolvió el usuario invitado');

        const generado = await generarEnlaceInvitacion(correo, opcionesInvitacion(nombre));
        if (generado.error || !generado.enlace) {
          console.error('[HU-02] No se pudo generar el enlace de invitación:', generado.error?.message);
          throw new AppError('ERROR_INTERNO', 'No se pudo generar la invitación del operario. Intenta de nuevo.');
        }
        enlace = generado.enlace;
      }
    }

    const { data: perfil, error: errorPerfil } = await supabase
      .from('perfiles')
      .insert({
        id: usuarioId,
        establecimiento_id: req.ctx.establecimientoId,
        nombre,
        rol: 'operario',
        activo: true,
      })
      .select(COLUMNAS)
      .single();
    if (errorPerfil) throw errorPerfil;
    perfilCreado = true;

    // El enlace contiene un token de un solo uso: no debe quedar en cachés.
    res.status(201).set('Cache-Control', 'no-store').json({
      usuario: publico(perfil, correo),
      invitacion: { correo, enviada, ...(enlace ? { enlace } : {}) },
    });
  } catch (err) {
    // Compensación best-effort: solo se borra una cuenta creada por esta petición
    // que no llegó a tener perfil. Nunca se toca una cuenta preexistente.
    if (usuarioId && !perfilCreado && cuentaCreadaAqui) {
      const { data: perfilExistente } = await supabase
        .from('perfiles')
        .select('id')
        .eq('id', usuarioId)
        .maybeSingle();
      if (!perfilExistente) {
        const { error: errorBorrado } = await supabase.auth.admin.deleteUser(usuarioId);
        if (errorBorrado) console.error(`[HU-02] No se pudo revertir el usuario invitado ${usuarioId}:`, errorBorrado.message);
      }
    }
    next(
      err instanceof AppError
        ? err
        : new AppError(
          err?.code === '23505' ? 'CONFLICTO' : 'ERROR_INTERNO',
          err?.code === '23505'
            ? 'Ya existe un perfil para ese usuario'
            : 'No fue posible crear el operario. Intenta de nuevo.',
        ),
    );
  }
}

/** PUT: edita nombre o estado de un operario del mismo establecimiento. */
export async function actualizar(req, res, next) {
  try {
    const perfil = await req.tenant.obtener('perfiles', req.params.id, COLUMNAS, RECURSO);

    // El listado solo muestra operarios, pero la ruta no debe permitir tocar un admin o superadmin.
    if (perfil.rol !== 'operario') {
      throw new AppError('SIN_PERMISO', 'No puedes modificar este usuario');
    }

    const cambios = {};
    if (req.body.nombre !== undefined) cambios.nombre = req.body.nombre;
    if (req.body.activo !== undefined) cambios.activo = req.body.activo;

    const actualizado = await req.tenant.actualizar('perfiles', perfil.id, cambios, COLUMNAS, RECURSO);
    const correos = await correosDe([perfil.id]);
    res.json(publico(actualizado, correos.get(perfil.id) ?? ''));
  } catch (err) {
    next(err);
  }
}
