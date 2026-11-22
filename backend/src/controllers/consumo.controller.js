// HU-39 — Controladores de consumo mensual y catálogo de planes.
//
// El reporte global y el detalle solo se exponen bajo `/superadmin` (requiereModulo('superadmin')).
// El consumo propio se expone bajo `/consumo` y usa siempre req.tenant: ningún id de establecimiento
// enviado por el frontend puede cambiar la sede consultada.
import { registrarAuditoria } from '../shared/auditoria.js';
import {
  mesBogota,
  consultarReporte,
  consultarConsumoPropio,
  consultarDetalle,
  listarPlanes,
  actualizarPlan,
} from '../shared/consumo.js';

const mesDe = (req) => req.query?.mes ?? mesBogota();

/** RF-F7-23: el administrador consulta únicamente el consumo de su sede. */
export async function obtenerPropio(req, res, next) {
  try {
    const datos = await consultarConsumoPropio(req.tenant, { mes: mesDe(req) });
    res.json(datos);
  } catch (err) {
    next(err);
  }
}

/** CA3: reporte global de todos los establecimientos para el administrador de plataforma. */
export async function reporte(req, res, next) {
  try {
    const datos = await consultarReporte({ mes: mesDe(req) });
    await registrarAuditoria(req, {
      accion: 'hu39.consultar.reporte',
      recurso: 'consumo_mensual',
      resultado: 'permitido',
      detalle: { mes: datos.mes, establecimientos: datos.resumen.establecimientos },
    });
    res.json(datos);
  } catch (err) {
    next(err);
  }
}

/** Detalle de una sede y su historial mensual (solo plataforma). */
export async function detalle(req, res, next) {
  try {
    const datos = await consultarDetalle({ establecimientoId: req.params.establecimientoId, mes: mesDe(req) });
    await registrarAuditoria(req, {
      accion: 'hu39.consultar.detalle',
      recurso: 'consumo_mensual',
      recursoId: req.params.establecimientoId,
      resultado: 'permitido',
      detalle: { mes: datos.mes },
    });
    res.json(datos);
  } catch (err) {
    next(err);
  }
}

/** Cupos vigentes del catálogo (DA-12, ajustables sin desplegar código). */
export async function planes(req, res, next) {
  try {
    res.json(await listarPlanes());
  } catch (err) {
    next(err);
  }
}

/** Ajuste de cupos por el administrador de plataforma. Nunca modifica el consumo registrado. */
export async function cambiarPlan(req, res, next) {
  try {
    const plan = await actualizarPlan(req.params.nombre, req.body);
    await registrarAuditoria(req, {
      accion: 'hu39.plan.actualizar',
      recurso: 'planes',
      recursoId: req.params.nombre,
      resultado: 'permitido',
      detalle: req.body,
    });
    res.json(plan);
  } catch (err) {
    next(err);
  }
}
