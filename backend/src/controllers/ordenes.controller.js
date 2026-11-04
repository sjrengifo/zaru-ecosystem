// HU-08, HU-09, HU-10 y HU-46 — Órdenes de servicio y avisos por correo al cliente.
// - Multi-tenant (HU-41): todo acceso a datos pasa por req.tenant.
// - HU-46 CA1: al registrar el ingreso se envía la confirmación con los servicios solicitados.
// - HU-46 CA2: al pasar a "listo" se envía el aviso para recoger el vehículo.
// - HU-46 CA3: el correo se envía en segundo plano, después de responder. Si el cliente no tiene
//   correo o el envío falla, la orden queda guardada igual y la respuesta solo informa el resultado.
// Pendiente de HU-12 CA3: aplicar la promoción vigente al total (hoy descuento = 0).
import { AppError } from '../shared/errores.js';
import { prepararCorreo, enSegundoPlano, EVENTOS } from '../shared/notificaciones.js';

/** HU-10: secuencia válida de estados. */
export const SIGUIENTE_ESTADO = { recibido: 'en_lavado', en_lavado: 'listo', listo: 'entregado' };

const COLUMNAS_ORDEN = 'id, estado, estado_desde, created_at, subtotal, descuento, total';
const COLUMNAS_ACTIVAS =
  `${COLUMNAS_ORDEN}, vehiculos(id, placa, tipo, clientes(id, nombre, correo)), orden_servicios(precio, duracion_min, servicios(nombre))`;

/** Lo que el panel necesita de una orden, sin exponer el correo del cliente. */
function formatoOrden(orden, correos = {}) {
  const vehiculo = orden.vehiculos ?? null;
  const cliente = vehiculo?.clientes ?? null;
  return {
    id: orden.id,
    estado: orden.estado,
    estadoDesde: orden.estado_desde,
    creadaEn: orden.created_at,
    subtotal: orden.subtotal,
    descuento: orden.descuento,
    total: orden.total,
    vehiculo: vehiculo && { id: vehiculo.id, placa: vehiculo.placa, tipo: vehiculo.tipo },
    cliente: cliente && { id: cliente.id, nombre: cliente.nombre, tieneCorreo: Boolean(cliente.correo) },
    servicios: (orden.orden_servicios ?? []).map((s) => ({ nombre: s.servicios?.nombre, precio: s.precio, duracionMin: s.duracion_min })),
    correos, // HU-46: { 'orden.recibida': 'enviada', 'orden.lista': 'fallida', … }
  };
}

/** HU-09: órdenes en curso del establecimiento, con el estado de sus correos (HU-46). */
export async function listarActivas(req, res, next) {
  try {
    const { data, error } = await req.tenant
      .listar('ordenes', COLUMNAS_ACTIVAS)
      .neq('estado', 'entregado')
      .order('created_at');
    if (error) throw error;

    const ids = data.map((o) => o.id);
    const correos = {};
    if (ids.length) {
      const { data: notificaciones, error: errorNotif } = await req.tenant
        .listar('notificaciones', 'orden_id, evento, estado')
        .eq('canal', 'correo')
        .in('orden_id', ids);
      if (errorNotif) throw errorNotif;
      for (const n of notificaciones ?? []) (correos[n.orden_id] ??= {})[n.evento] = n.estado;
    }
    res.json(data.map((o) => formatoOrden(o, correos[o.id])));
  } catch (err) {
    next(err);
  }
}

/** HU-08 CA1 + HU-46 CA1: registra el ingreso, calcula el total y avisa al cliente por correo. */
export async function crear(req, res, next) {
  try {
    const { vehiculoId, servicios: idsServicios } = req.body;
    const vehiculo = await req.tenant.obtener('vehiculos', vehiculoId, 'id, placa, tipo', 'Vehículo');

    const { data: activa, error: errorActiva } = await req.tenant
      .listar('ordenes', 'id')
      .eq('vehiculo_id', vehiculo.id)
      .neq('estado', 'entregado')
      .limit(1);
    if (errorActiva) throw errorActiva;
    if (activa?.length) {
      throw new AppError('CONFLICTO', `El vehículo ${vehiculo.placa} ya tiene una orden en curso`, [
        { campo: 'vehiculoId', mensaje: 'Termina o entrega la orden actual antes de registrar otra' },
      ]);
    }

    const { data: servicios, error: errorServicios } = await req.tenant
      .listar('servicios', 'id, nombre, precio, duracion_min, activo')
      .in('id', idsServicios);
    if (errorServicios) throw errorServicios;
    const disponibles = (servicios ?? []).filter((s) => s.activo);
    if (disponibles.length !== idsServicios.length) {
      throw new AppError('VALIDACION', 'Uno o más servicios no existen o están desactivados', [
        { campo: 'servicios', mensaje: 'Revisa los servicios seleccionados' },
      ]);
    }

    const subtotal = disponibles.reduce((suma, s) => suma + Number(s.precio), 0);
    const ahora = new Date().toISOString();
    const orden = await req.tenant.crear('ordenes', {
      vehiculo_id: vehiculo.id,
      estado: 'recibido',
      subtotal,
      descuento: 0,
      total: subtotal,
      creada_por: req.ctx.usuarioId,
      estado_desde: ahora,
    }, COLUMNAS_ORDEN);

    const padre = { tabla: 'ordenes', id: orden.id, columna: 'orden_id', recurso: 'Orden' };
    try {
      // HU-07 CA2: la orden guarda el precio y la duración vigentes hoy.
      await req.tenant.crearDetalle('orden_servicios', padre, disponibles.map((s) => ({
        servicio_id: s.id, precio: s.precio, duracion_min: s.duracion_min,
      })), 'servicio_id');
    } catch (err) {
      await req.tenant.eliminar('ordenes', orden.id, 'Orden').catch(() => {});
      throw err;
    }
    await registrarHistorial(req, orden.id, 'recibido');

    const correo = await prepararCorreo(req.tenant, { evento: EVENTOS.RECIBIDA, ordenId: orden.id });
    res.status(201).json({
      ...formatoOrden({ ...orden, vehiculos: { ...vehiculo, clientes: null } }),
      servicios: disponibles.map((s) => ({ nombre: s.nombre, precio: s.precio, duracionMin: s.duracion_min })),
      notificacion: correo.resumen,
    });
    enSegundoPlano(correo.enviar);
  } catch (err) {
    next(err);
  }
}

/** HU-10 CA1: trazabilidad de cada cambio (usuario y hora). Un fallo aquí no revierte el cambio. */
async function registrarHistorial(req, ordenId, estado) {
  try {
    await req.tenant.crearDetalle(
      'historial_estados',
      { tabla: 'ordenes', id: ordenId, columna: 'orden_id', recurso: 'Orden' },
      { estado, usuario_id: req.ctx.usuarioId },
      'id',
    );
  } catch (err) {
    console.error(`[HU-10] No se pudo registrar el historial de la orden ${ordenId}:`, err.message);
  }
}

/** HU-10 + HU-46 CA2: avanza al siguiente estado; al quedar "listo" avisa al cliente. */
export async function cambiarEstado(req, res, next) {
  try {
    const { estado } = req.body;
    const actual = await req.tenant.obtener('ordenes', req.params.id, 'id, estado', 'Orden');

    if (actual.estado === 'entregado') throw new AppError('CONFLICTO', 'La orden ya fue entregada');
    const siguiente = SIGUIENTE_ESTADO[actual.estado];
    if (estado !== siguiente) {
      throw new AppError('VALIDACION', `La orden está en "${actual.estado}": solo puede pasar a "${siguiente}"`, [
        { campo: 'estado', mensaje: `Estado siguiente válido: ${siguiente}` },
      ]);
    }

    const ahora = new Date().toISOString();
    let orden;
    try {
      orden = await req.tenant.actualizar(
        'ordenes',
        actual.id,
        { estado, estado_desde: ahora, ...(estado === 'entregado' ? { entregada_at: ahora } : {}) },
        COLUMNAS_ORDEN,
        'Orden',
        { estado: actual.estado }, // si otro operario ya la movió, no se pisa su cambio
      );
    } catch (err) {
      if (err.codigo === 'NO_ENCONTRADO') throw new AppError('CONFLICTO', 'Otro usuario ya cambió el estado de esta orden. Actualiza el tablero.');
      throw err;
    }
    await registrarHistorial(req, orden.id, estado);

    const correo = estado === 'listo'
      ? await prepararCorreo(req.tenant, { evento: EVENTOS.LISTA, ordenId: orden.id })
      : null;
    res.json({
      id: orden.id,
      estado: orden.estado,
      estadoDesde: orden.estado_desde,
      total: orden.total,
      notificacion: correo?.resumen ?? null,
    });
    if (correo) enSegundoPlano(correo.enviar);
  } catch (err) {
    next(err);
  }
}
