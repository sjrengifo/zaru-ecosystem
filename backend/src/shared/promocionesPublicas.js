// HU-26 — Explorador de promociones activas de la sede (ZARU-45 · RF-F5-09 · ESC-F5-07).
//
// GET /publico/sedes/{slug}/promociones, sin sesión: el cliente final ve las promociones que su
// sede tiene vigentes hoy, con la marca de esa sede.
//   CA1: solo filas de la vista promociones_vigentes (HU-12): activas y con hoy (Bogotá) entre la
//        fecha de inicio y la de fin. La vigencia la decide la base; aquí no se recalcula.
//   CA2: el backend consulta con la clave de servicio, que no pasa por el RLS de la vista. Por eso el
//        filtro por sede lo pone el acceso del tenant (crearAccesoTenant) con el id de la sede que
//        resolvió el slug. Del cliente solo llega el slug; nunca un id de sede.
//   CA3: la sede se entrega con sedePublica() (HU-17/HU-22): nombre, logo y colores validados.
//
// Cada promoción sale sin columnas internas (establecimiento_id, activa, estado, created_at) y sin
// condiciones, que son parte del detalle.
//
// HU-27 — Detalle y condiciones de una promoción (ZARU-46 · RF-F5-10).
// GET /publico/sedes/{slug}/promociones/{id}, sin sesión: la misma promoción de la lista más sus
// condiciones de uso y su fecha de inicio, con la marca de la sede.
//   Solo responde si la promoción está en promociones_vigentes y es de la sede del slug. Vencida,
//   programada o desactivada (no están en la vista), de otra sede o con un id que no es UUID: todas
//   responden el mismo 404 "Promoción no encontrada" (tenant.obtener), sin revelar el motivo.
import { supabase } from '../config/supabase.js';
import { crearAccesoTenant } from './tenant.js';
import { AppError } from './errores.js';
import { cargarSede, sedePublica } from './accesoCliente.js';

const VISTA = 'promociones_vigentes';
const COLUMNAS = 'id, nombre, descripcion, descuento_pct, fecha_fin, servicios';
export const MENSAJE_NO_ENCONTRADA = 'Promoción no encontrada';
const COLUMNAS_DETALLE = 'id, nombre, descripcion, condiciones, descuento_pct, fecha_inicio, fecha_fin, servicios';

/** Texto opcional: null si viene vacío o solo con espacios, para que la pantalla no deje un hueco. */
const textoOpcional = (valor) => (typeof valor === 'string' && valor.trim() ? valor.trim() : null);

/** Lo que el cliente ve de una promoción en la lista. */
export function promocionPublica(fila) {
  return {
    id: fila.id,
    nombre: fila.nombre,
    descripcion: textoOpcional(fila.descripcion),
    descuentoPct: Number(fila.descuento_pct),
    fechaFin: fila.fecha_fin,
    servicios: (fila.servicios ?? []).map((s) => s.nombre),
  };
}

/**
 * Promociones vigentes hoy en la sede del slug: primero las que vencen antes, luego por nombre.
 * Sede inexistente o suspendida → NO_ENCONTRADO (404), igual que GET /publico/sedes/{slug}.
 * @returns {Promise<{ sede: object, promociones: object[] }>}
 */
export async function listarPromocionesVigentes(slug, { db = supabase } = {}) {
  const sede = await cargarSede(slug, { db });
  const tenant = crearAccesoTenant(db, { establecimientoId: sede.id });

  const { data, error } = await tenant
    .listar(VISTA, COLUMNAS)
    .order('fecha_fin', { ascending: true })
    .order('nombre', { ascending: true });
  if (error) throw error;

  return { sede: sedePublica(sede), promociones: (data ?? []).map(promocionPublica) };
}

/** Lo que el cliente ve en el detalle de una promoción (HU-27): lo de la lista más condiciones e inicio. */
export function promocionDetallePublica(fila) {
  return {
    ...promocionPublica(fila),
    condiciones: textoOpcional(fila.condiciones),
    fechaInicio: fila.fecha_inicio,
  };
}

/**
 * Una promoción vigente hoy de la sede del slug, con la marca de la sede (HU-27).
 * Sede inexistente o suspendida → NO_ENCONTRADO (404), como la lista.
 * Promoción no vigente, de otra sede o con id inválido → NO_ENCONTRADO "Promoción no encontrada".
 * @returns {Promise<{ sede: object, promocion: object }>}
 */
export async function obtenerPromocionVigente(slug, id, { db = supabase } = {}) {
  const sede = await cargarSede(slug, { db });
  const tenant = crearAccesoTenant(db, { establecimientoId: sede.id });
  // tenant.obtener ya responde NO_ENCONTRADO para id no UUID, inexistente o de otra sede; aquí solo se
  // deja un único mensaje (en femenino) para todos los casos, sin revelar cuál fue.
  const fila = await tenant.obtener(VISTA, id, COLUMNAS_DETALLE, 'Promoción').catch((err) => {
    throw err?.codigo === 'NO_ENCONTRADO' ? new AppError('NO_ENCONTRADO', MENSAJE_NO_ENCONTRADA) : err;
  });
  return { sede: sedePublica(sede), promocion: promocionDetallePublica(fila) };
}
