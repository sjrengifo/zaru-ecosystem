// HU-30 CA3 — Página pública "dejar de recibir" (cliente final, sin sesión).
//
// El cliente llega desde el enlace firmado de un correo. El token identifica el establecimiento, el
// cliente y la autorización; con él se crea el acceso del tenant de ese establecimiento (HU-41), igual
// que en el panel. Revocar es inmediato (el criterio pide menos de 24 horas) y queda como evidencia
// con canal 'enlace_baja' (CA4). Nunca se devuelven datos personales del cliente.
import { supabase } from '../config/supabase.js';
import { crearAccesoTenant } from './tenant.js';
import { AppError } from './errores.js';
import { autorizacionesDe, leerTokenBaja, NOMBRE_TIPO, registrarAutorizacion, TIPOS } from './autorizaciones.js';

const COLOR_HEX = /^#[0-9A-Fa-f]{6}$/;
const enlaceNoValido = () => new AppError('NO_ENCONTRADO', 'Este enlace no es válido o ya no está disponible');

async function contexto(token, db) {
  const datos = leerTokenBaja(token);
  if (!datos) throw enlaceNoValido();
  const tenant = crearAccesoTenant(db, { establecimientoId: datos.establecimientoId });
  // Si el cliente pidió eliminar sus datos (HU-52), el enlace deja de servir.
  const { data: cliente, error } = await tenant.listar('clientes', 'id').eq('id', datos.clienteId).maybeSingle();
  if (error) throw error;
  if (!cliente) throw enlaceNoValido();
  const { data: sede } = await tenant.listar('establecimientos', 'nombre, logo_url, color_primario, color_secundario').maybeSingle();
  return { ...datos, tenant, sede: sede ?? {} };
}

const sedePublica = (sede) => ({
  nombre: sede.nombre ?? 'Zaru',
  logoUrl: sede.logo_url ?? null,
  colorPrimario: COLOR_HEX.test(sede.color_primario ?? '') ? sede.color_primario : null,
  colorSecundario: COLOR_HEX.test(sede.color_secundario ?? '') ? sede.color_secundario : null,
});

const vigenteDe = (autorizaciones, tipo) =>
  tipo === TIPOS.comerciales ? autorizaciones.comerciales : autorizaciones.notificacionesServicio;

/** Qué se va a revocar y si sigue autorizado (para mostrar la confirmación). */
export async function consultarBaja(token, { db = supabase } = {}) {
  const { tenant, clienteId, tipo, sede } = await contexto(token, db);
  const actual = vigenteDe(await autorizacionesDe(tenant, clienteId), tipo);
  return { tipo, nombreTipo: NOMBRE_TIPO[tipo], autorizado: actual.otorgado, sede: sedePublica(sede) };
}

/** CA3: revoca la autorización y confirma con la fecha y hora en que quedó registrada. */
export async function confirmarBaja(token, { ip = null, db = supabase } = {}) {
  const { tenant, clienteId, tipo, sede } = await contexto(token, db);
  const { autorizaciones } = await registrarAutorizacion(tenant, { clienteId, tipo, otorgado: false, canal: 'enlace_baja', ip });
  const actual = vigenteDe(autorizaciones, tipo);
  return { tipo, nombreTipo: NOMBRE_TIPO[tipo], autorizado: actual.otorgado, revocadaAt: actual.fecha, sede: sedePublica(sede) };
}
