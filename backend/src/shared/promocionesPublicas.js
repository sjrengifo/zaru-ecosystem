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
// condiciones, que son parte del detalle (HU-27, RF-F5-10).
import { supabase } from '../config/supabase.js';
import { crearAccesoTenant } from './tenant.js';
import { cargarSede, sedePublica } from './accesoCliente.js';

const VISTA = 'promociones_vigentes';
const COLUMNAS = 'id, nombre, descripcion, descuento_pct, fecha_fin, servicios';

/** Lo que el cliente ve de una promoción en la lista. */
export function promocionPublica(fila) {
  return {
    id: fila.id,
    nombre: fila.nombre,
    descripcion: fila.descripcion ?? null,
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
