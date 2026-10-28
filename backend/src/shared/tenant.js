// HU-41 — Acceso a datos aislado por establecimiento (multi-tenant).
//
// Todos los controladores leen y escriben a través de `req.tenant`, que se crea en el
// middleware de sesión con el establecimiento del usuario autenticado. Así el filtro por
// establecimiento se aplica automáticamente (CA1) y no depende de que cada consulta lo recuerde.
//
//   const clientes = await req.tenant.listar('clientes', 'id, nombre').order('nombre');
//   const cliente  = await req.tenant.obtener('clientes', req.params.id, '*', 'Cliente');
//   const nuevo    = await req.tenant.crear('clientes', { nombre, telefono });
//
// Reglas:
// - El establecimiento sale SIEMPRE del contexto de la sesión, nunca de la petición: si el cuerpo
//   trae `establecimiento_id`, se ignora.
// - Un id que no existe, que no es un UUID válido o que pertenece a otro establecimiento produce el
//   mismo error NO_ENCONTRADO (CA2): la API no revela si el recurso existe en otro establecimiento.
// - Un establecimiento nuevo queda aislado sin cambios de código (CA3): el filtro usa el id que
//   trae la sesión, no una lista de establecimientos.
// - La base de datos es la segunda barrera: RLS y llaves compuestas (id, establecimiento_id) (HU-42).

import { AppError, noEncontrado } from './errores.js';

/** Tablas cuyo identificador de tenant no se llama establecimiento_id. */
const COLUMNA_TENANT = { establecimientos: 'id' };

/** Columnas que el cliente de la API nunca puede fijar ni cambiar. */
const COLUMNAS_PROTEGIDAS = ['id', 'establecimiento_id', 'created_at'];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const esUuid = (valor) => typeof valor === 'string' && UUID.test(valor);

function sinColumnasProtegidas(valores = {}) {
  return Object.fromEntries(
    Object.entries(valores).filter(([columna, valor]) => !COLUMNAS_PROTEGIDAS.includes(columna) && valor !== undefined),
  );
}

function lanzarSiError(error) {
  if (!error) return;
  if (error.code === '23505') throw new AppError('CONFLICTO', 'El registro ya existe', { restriccion: error.details });
  if (error.code === '23503') throw new AppError('CONFLICTO', 'El registro está relacionado con datos que no existen o no le pertenecen');
  if (error.code === '22P02') throw new AppError('VALIDACION', 'Un dato tiene un formato inválido');
  // Reglas de negocio validadas en la base (check o raise con errcode 23514): el mensaje ya es para el usuario.
  if (error.code === '23514') {
    if (error.hint === 'politica') throw new AppError('CONFLICTO', error.message, [{ campo: 'politicaVersion', mensaje: error.message }]);
    throw new AppError('VALIDACION', error.message, error.hint ? [{ campo: error.hint, mensaje: error.message }] : undefined);
  }
  throw error;
}

/**
 * Crea el acceso a datos de un establecimiento.
 * @param {import('@supabase/supabase-js').SupabaseClient} db cliente con service_role
 * @param {{ establecimientoId: string }} ctx contexto de la sesión
 */
export function crearAccesoTenant(db, ctx) {
  if (!esUuid(ctx?.establecimientoId)) {
    throw new AppError('SIN_PERMISO', 'Usuario sin establecimiento asignado');
  }
  const establecimientoId = ctx.establecimientoId;
  const columna = (tabla) => COLUMNA_TENANT[tabla] ?? 'establecimiento_id';

  return {
    establecimientoId,

    /** Consulta filtrada por el establecimiento. Devuelve el query builder para seguir encadenando. */
    listar(tabla, columnas = '*', opciones) {
      return db.from(tabla).select(columnas, opciones).eq(columna(tabla), establecimientoId);
    },

    /** Un registro del establecimiento por id. Lanza NO_ENCONTRADO si no existe o es de otro establecimiento. */
    async obtener(tabla, id, columnas = '*', recurso) {
      if (!esUuid(id)) throw noEncontrado(recurso);
      const { data, error } = await db
        .from(tabla)
        .select(columnas)
        .eq('id', id)
        .eq(columna(tabla), establecimientoId)
        .maybeSingle();
      lanzarSiError(error);
      if (!data) throw noEncontrado(recurso);
      return data;
    },

    /** Inserta uno o varios registros en el establecimiento de la sesión. */
    async crear(tabla, valores, columnas = '*') {
      const lista = (Array.isArray(valores) ? valores : [valores]).map((v) => ({
        ...sinColumnasProtegidas(v),
        [columna(tabla)]: establecimientoId,
      }));
      const { data, error } = await db.from(tabla).insert(lista).select(columnas);
      lanzarSiError(error);
      return Array.isArray(valores) ? data : data[0];
    },

    /** Actualiza un registro del establecimiento. Lanza NO_ENCONTRADO si no le pertenece. */
    async actualizar(tabla, id, cambios, columnas = '*', recurso) {
      if (!esUuid(id)) throw noEncontrado(recurso);
      const valores = sinColumnasProtegidas(cambios);
      if (Object.keys(valores).length === 0) throw new AppError('VALIDACION', 'No hay datos para actualizar');
      const { data, error } = await db
        .from(tabla)
        .update(valores)
        .eq('id', id)
        .eq(columna(tabla), establecimientoId)
        .select(columnas)
        .maybeSingle();
      lanzarSiError(error);
      if (!data) throw noEncontrado(recurso);
      return data;
    },

    /**
     * Ejecuta una función de la base de datos pasando el establecimiento de la sesión como
     * p_establecimiento_id (cualquier valor enviado por el cliente se reemplaza).
     */
    async rpc(funcion, argumentos = {}) {
      const { data, error } = await db.rpc(funcion, { ...argumentos, p_establecimiento_id: establecimientoId });
      lanzarSiError(error);
      return data;
    },

    /** Elimina un registro del establecimiento. Lanza NO_ENCONTRADO si no le pertenece. */
    async eliminar(tabla, id, recurso) {
      if (!esUuid(id)) throw noEncontrado(recurso);
      const { data, error } = await db
        .from(tabla)
        .delete()
        .eq('id', id)
        .eq(columna(tabla), establecimientoId)
        .select('id')
        .maybeSingle();
      lanzarSiError(error);
      if (!data) throw noEncontrado(recurso);
    },
  };
}
