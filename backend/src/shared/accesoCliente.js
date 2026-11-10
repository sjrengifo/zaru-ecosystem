// HU-17 — Acceso del cliente final a la plataforma móvil con la placa o el celular, sin contraseña.
//
// El cliente abre el enlace (o escanea el QR) de su car wash: /s/{slug}. La sede se identifica por
// su slug, que es lo único que se busca de forma global; con la sede encontrada, el vehículo y la
// orden se leen con el acceso del tenant de esa sede (HU-41), igual que en el panel.
//
// CA1/CA2: si la placa o el celular tiene una orden activa en esa sede, se devuelve su código de
//          seguimiento y la pantalla redirige a /seguimiento/{codigo} (HU-18).
// CA4:     si no hay orden activa, la respuesta es la misma exista o no la placa o el celular
//          (RF-F5-03): no se revela quién es cliente de la sede.
// Privacidad (RNF-F5-04): las respuestas solo llevan la sede, la placa y el código; nunca nombre,
//          celular ni correo del cliente.
import { supabase } from '../config/supabase.js';
import { crearAccesoTenant } from './tenant.js';
import { AppError, noEncontrado } from './errores.js';

export const MENSAJE_SIN_SERVICIO = 'El vehículo no se encuentra en servicio actualmente';

const FORMATO_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const FORMATO_PLACA = /^[A-Z0-9]{5,7}$/;
const COLOR_HEX = /^#[0-9A-Fa-f]{6}$/;

/** Slug tal como lo guarda la base (minúsculas, letras, números y guiones). Null si no es válido. */
export function normalizarSlug(valor) {
  const slug = String(valor ?? '').trim().toLowerCase();
  return slug.length <= 60 && FORMATO_SLUG.test(slug) ? slug : null;
}

/** Igual que al registrar el vehículo (RF-F2-11): mayúsculas, sin espacios ni guiones. */
export function normalizarPlaca(valor) {
  const placa = String(valor ?? '').replace(/[\s-]/g, '').toUpperCase();
  return FORMATO_PLACA.test(placa) ? placa : null;
}

/** Celular colombiano de 10 dígitos, como se guarda en clientes (HU-03). Acepta +57, espacios y guiones. */
export function normalizarCelular(valor) {
  let digitos = String(valor ?? '').replace(/\D/g, '');
  if (digitos.length === 12 && digitos.startsWith('57')) digitos = digitos.slice(2);
  return /^3\d{9}$/.test(digitos) ? digitos : null;
}

const sinServicio = () => new AppError('NO_ENCONTRADO', MENSAJE_SIN_SERVICIO);

/** Lo que el cliente ve de su sede: nombre y marca (HU-13). */
export function sedePublica(sede) {
  return {
    slug: sede.slug,
    nombre: sede.nombre,
    logoUrl: sede.logo_url ?? null,
    colorPrimario: COLOR_HEX.test(sede.color_primario ?? '') ? sede.color_primario : null,
    colorSecundario: COLOR_HEX.test(sede.color_secundario ?? '') ? sede.color_secundario : null,
  };
}

/**
 * Sede del enlace. Una sede inexistente o suspendida responde igual (404), como el seguimiento.
 * @returns {Promise<object>} fila de establecimientos (uso interno: incluye el id)
 */
export async function cargarSede(slugRecibido, { db = supabase } = {}) {
  const slug = normalizarSlug(slugRecibido);
  if (!slug) throw noEncontrado('Sede');
  const { data, error } = await db
    .from('establecimientos')
    .select('id, slug, nombre, logo_url, color_primario, color_secundario, estado')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.estado === 'suspendido') throw noEncontrado('Sede');
  return data;
}

/** Ids de los vehículos que coinciden con la placa o con el celular del dueño, dentro de la sede. */
async function vehiculosBuscados(tenant, { placa, celular }) {
  if (placa) {
    const { data, error } = await tenant.listar('vehiculos', 'id').eq('placa', placa);
    if (error) throw error;
    return (data ?? []).map((v) => v.id);
  }
  const { data: clientes, error } = await tenant.listar('clientes', 'id').eq('telefono', celular);
  if (error) throw error;
  if (!clientes?.length) return [];
  const { data: vehiculos, error: errorVehiculos } = await tenant
    .listar('vehiculos', 'id')
    .in('cliente_id', clientes.map((c) => c.id));
  if (errorVehiculos) throw errorVehiculos;
  return (vehiculos ?? []).map((v) => v.id);
}

/**
 * CA1, CA2 y CA4: busca las órdenes activas (no entregadas) de la placa o del celular en la sede.
 * Con placa hay como máximo una (la base permite una orden activa por vehículo); con celular puede
 * haber una por cada vehículo del cliente, y la pantalla le deja elegir.
 * @param {string} slug
 * @param {{ placa?: string, celular?: string }} busqueda ya normalizada por el esquema
 * @returns {Promise<{ sede: object, resultados: Array<{ codigo: string, placa: string }> }>}
 */
export async function buscarOrdenActiva(slug, busqueda, { db = supabase } = {}) {
  const sede = await cargarSede(slug, { db });
  const tenant = crearAccesoTenant(db, { establecimientoId: sede.id });

  const ids = await vehiculosBuscados(tenant, busqueda);
  if (!ids.length) throw sinServicio();

  const { data: ordenes, error } = await tenant
    .listar('ordenes', 'codigo_seguimiento, created_at, vehiculo:vehiculos(placa)')
    .in('vehiculo_id', ids)
    .neq('estado', 'entregado')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const resultados = (ordenes ?? [])
    .filter((o) => o.codigo_seguimiento)
    .map((o) => ({ codigo: o.codigo_seguimiento, placa: o.vehiculo?.placa ?? null }));
  if (!resultados.length) throw sinServicio();

  return { sede: sedePublica(sede), resultados };
}
