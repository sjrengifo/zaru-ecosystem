// HU-12 — Lógica de promociones.
// - Multi-tenant (HU-41): todo acceso a datos pasa por req.tenant.
// - Validación (HU-43): las rutas validan con schemas/promociones.schemas.js antes de llegar aquí.
// - El estado (vigente, programada, vencida, desactivada) lo calcula la base con la fecha de Bogotá
//   (vista promociones_con_estado): al pasar la fecha de fin deja de estar vigente sola (CA2).
// - Editar o desactivar no altera órdenes ya creadas: cada orden guarda su propio precio y descuento.
import { AppError, noEncontrado } from '../shared/errores.js';
import { detallesDeZod } from '../shared/validar.js';
import { promocionCompleta } from '../schemas/promociones.schemas.js';

const VISTA = 'promociones_con_estado';
const ESTADO_DEL_FILTRO = { vigentes: 'vigente', programadas: 'programada', vencidas: 'vencida' };

const argumentos = (id, p) => ({
  p_promocion_id: id,
  p_nombre: p.nombre,
  p_descripcion: p.descripcion ?? null,
  p_condiciones: p.condiciones ?? null,
  p_descuento_pct: p.descuentoPct,
  p_fecha_inicio: p.fechaInicio,
  p_fecha_fin: p.fechaFin,
  p_activa: p.activa ?? null,
  p_servicio_ids: p.servicioIds,
});

/** La promoción guardada, en el formato de la petición, para combinarla con los cambios. */
const comoPeticion = (fila) => ({
  nombre: fila.nombre,
  descripcion: fila.descripcion,
  condiciones: fila.condiciones,
  descuentoPct: Number(fila.descuento_pct),
  fechaInicio: fila.fecha_inicio,
  fechaFin: fila.fecha_fin,
  activa: fila.activa,
  servicioIds: fila.servicios.map((s) => s.id),
});

/** RF-F4-06: promociones del establecimiento, filtradas por estado. Las vigentes son las que ve el cliente final (CA1). */
export async function listar(req, res, next) {
  try {
    let consulta = req.tenant.listar(VISTA).order('fecha_inicio', { ascending: false }).order('nombre');
    if (req.query.estado !== 'todas') consulta = consulta.eq('estado', ESTADO_DEL_FILTRO[req.query.estado]);
    const { data, error } = await consulta;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
}

/** RF-F4-01, HU-12 CA1: crear una promoción con sus servicios en una sola operación. */
export async function crear(req, res, next) {
  try {
    const id = await req.tenant.rpc('guardar_promocion', argumentos(null, req.body));
    res.status(201).json(await req.tenant.obtener(VISTA, id, '*', 'Promoción'));
  } catch (err) {
    next(err);
  }
}

/** RF-F4-03: editar campos, cambiar servicios o activar/desactivar. */
export async function actualizar(req, res, next) {
  try {
    const guardada = await req.tenant.obtener(VISTA, req.params.id, '*', 'Promoción');
    const resultado = promocionCompleta.safeParse({ ...comoPeticion(guardada), ...req.body });
    if (!resultado.success) throw new AppError('VALIDACION', 'La solicitud tiene datos inválidos', detallesDeZod(resultado.error, 'body'));

    const id = await req.tenant.rpc('guardar_promocion', argumentos(guardada.id, resultado.data));
    if (!id) throw noEncontrado('Promoción');
    res.json(await req.tenant.obtener(VISTA, id, '*', 'Promoción'));
  } catch (err) {
    next(err);
  }
}
