// HU-23 / HU-24 — Historial de servicios del cliente final (sin sesión de panel).
//
// El acceso se obtiene con placa + celular (shared/paseCliente.js) y se envía en
// `Authorization: Bearer <pase>`. El cliente y la sede salen del pase firmado; ninguna consulta
// acepta un id de cliente, de sede o de orden ajeno.
import { crearPaseParaCliente } from '../shared/paseCliente.js';
import { detalleHistorial, listarHistorial, vehiculosDelCliente } from '../shared/historialCliente.js';
import { listarCentro, marcarLeida } from '../shared/centroNotificaciones.js';
import { crearLimiteIntentos } from '../shared/limiteIntentos.js';

export const limiteAccesos = crearLimiteIntentos({ maximo: 5 });
const origenDe = (req) => req.ip ?? 'desconocido';

/** POST /publico/sedes/:slug/historial/acceso — verifica placa + celular y emite el pase. */
export async function acceso(req, res, next) {
  const origen = origenDe(req);
  try {
    limiteAccesos.verificar(origen);
    const datos = await crearPaseParaCliente(req.params.slug, req.body);
    res.set('Cache-Control', 'no-store');
    res.json(datos);
  } catch (err) {
    // Solo los intentos con datos que no coinciden cuentan para el límite; un fallo de base no
    // debe bloquear al cliente que sí conoce sus datos.
    if (err?.codigo === 'NO_ENCONTRADO') limiteAccesos.registrarFallo(origen);
    next(err);
  }
}

/** GET /publico/cliente/vehiculos — vehículos del cliente autenticado (para filtrar el historial). */
export async function vehiculos(req, res, next) {
  try {
    const datos = await vehiculosDelCliente(req.cliente.tenant, req.cliente.clienteId);
    res.set('Cache-Control', 'no-store');
    res.json({ vehiculos: datos });
  } catch (err) {
    next(err);
  }
}

/** GET /publico/cliente/historial?placa=ABC123 — servicios entregados, del más reciente al más antiguo. */
export async function historial(req, res, next) {
  try {
    const datos = await listarHistorial(
      req.cliente.tenant,
      req.cliente.clienteId,
      { placa: req.query.placa },
      req.cliente.sede,
    );
    res.set('Cache-Control', 'no-store');
    res.json({ cliente: { nombre: req.cliente.nombre }, ...datos });
  } catch (err) {
    next(err);
  }
}

/** GET /publico/cliente/historial/:ordenId — detalle de un único servicio entregado. */
export async function detalle(req, res, next) {
  try {
    const datos = await detalleHistorial(
      req.cliente.tenant,
      req.cliente.clienteId,
      req.params.ordenId,
      req.cliente.sede,
    );
    res.set('Cache-Control', 'no-store');
    res.json({ cliente: { nombre: req.cliente.nombre }, servicio: datos });
  } catch (err) {
    next(err);
  }
}

/** GET /publico/cliente/notificaciones — HU-38 CA1/CA2: avisos de los últimos 90 días y cuántos faltan por leer. */
export async function notificaciones(req, res, next) {
  try {
    const datos = await listarCentro(req.cliente.tenant, req.cliente.clienteId);
    res.set('Cache-Control', 'no-store');
    res.json(datos);
  } catch (err) {
    next(err);
  }
}

/** PATCH /publico/cliente/notificaciones/:id/leida — HU-38: marca un aviso propio como leído. */
export async function notificacionLeida(req, res, next) {
  try {
    const datos = await marcarLeida(req.cliente.tenant, req.cliente.clienteId, req.params.id);
    res.set('Cache-Control', 'no-store');
    res.json(datos);
  } catch (err) {
    next(err);
  }
}
