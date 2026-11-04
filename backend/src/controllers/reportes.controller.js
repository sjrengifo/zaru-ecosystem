// HU-16 — Reportes del establecimiento para el administrador.
// - HU-41: las órdenes se leen a través de req.tenant, nunca de un id enviado por el cliente.
// - El rango usa ordenes.created_at: desde las 00:00 del día inicial hasta antes de las
//   00:00 del día siguiente al final, ambos en hora de Bogotá (el día final se incluye completo).
// - Los ingresos y el nombre de cada servicio salen de la orden (snapshot histórico), no del
//   catálogo actual, que pudo cambiar después de crear la orden.
import { finDiaBogotaExclusivo, inicioDiaBogota, resumirAfluencia, resumirServicios } from '../shared/reportes.js';

const COLUMNAS = [
  'id, created_at,',
  'orden_servicios(precio, descuento, servicio:servicios(id, nombre))',
].join(' ');

/** Órdenes del establecimiento creadas dentro del rango, con sus servicios históricos. */
async function ordenesDelRango(req) {
  const { desde, hasta } = req.query;
  const { data, error } = await req.tenant
    .listar('ordenes', COLUMNAS)
    .gte('created_at', inicioDiaBogota(desde))
    .lt('created_at', finDiaBogotaExclusivo(hasta))
    .order('created_at', { ascending: true });

  if (error) throw error;
  return { desde, hasta, ordenes: data ?? [] };
}

/** CA1: ranking de servicios por número de órdenes e ingresos. */
export async function servicios(req, res, next) {
  try {
    const { desde, hasta, ordenes } = await ordenesDelRango(req);
    res.json({ desde, hasta, ...resumirServicios(ordenes) });
  } catch (err) {
    next(err);
  }
}

/** CA2: afluencia de vehículos por día de la semana y franja horaria. */
export async function afluencia(req, res, next) {
  try {
    const { desde, hasta, ordenes } = await ordenesDelRango(req);
    res.json({ desde, hasta, ...resumirAfluencia(ordenes) });
  } catch (err) {
    next(err);
  }
}
