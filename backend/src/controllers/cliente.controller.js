// HU-23 / HU-24 — Historial de servicios del cliente final (sin sesión de panel).
//
// El acceso se obtiene con el celular y un código de un solo uso por SMS (shared/otpCliente.js) y
// el pase se envía en `Authorization: Bearer <pase>`. El cliente y la sede salen del pase firmado;
// ninguna consulta acepta un id de cliente, de sede o de orden ajeno.
import { solicitarCodigoAcceso, verificarCodigoAcceso } from '../shared/otpCliente.js';
import { detalleHistorial, listarHistorial, vehiculosDelCliente } from '../shared/historialCliente.js';
import { listarCentro, marcarLeida } from '../shared/centroNotificaciones.js';
import { confirmarCodigo, guardarPreferencias, obtenerPreferencias, solicitarCodigo } from '../shared/preferenciasCanal.js';
import { crearLimiteIntentos } from '../shared/limiteIntentos.js';
import { eliminarDispositivo, registrarDispositivo } from '../shared/suscripcionesPush.js';
import { clavePublicaPush } from '../shared/proveedorPush.js';
import { AppError } from '../shared/errores.js';

// Códigos incorrectos por dirección IP, además de los 5 intentos de cada código.
export const limiteAccesos = crearLimiteIntentos({ maximo: 10 });
const origenDe = (req) => req.ip ?? 'desconocido';

/** POST /publico/sedes/:slug/otp — RF-F5-11: envía el código. 202 exista o no el celular. */
export async function solicitarOtp(req, res, next) {
  try {
    const datos = await solicitarCodigoAcceso(req.params.slug, req.body);
    res.set('Cache-Control', 'no-store');
    res.status(202).json(datos);
  } catch (err) {
    next(err);
  }
}

/** POST /publico/sedes/:slug/otp/verificar — RF-F5-12: valida el código y emite el pase de 30 días. */
export async function verificarOtp(req, res, next) {
  const origen = origenDe(req);
  try {
    limiteAccesos.verificar(origen);
    const datos = await verificarCodigoAcceso(req.params.slug, req.body);
    res.set('Cache-Control', 'no-store');
    res.json(datos);
  } catch (err) {
    // Solo cuentan los códigos incorrectos; un fallo de base no debe bloquear al cliente.
    if (err?.codigo === 'NO_AUTENTICADO') limiteAccesos.registrarFallo(origen);
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

/** GET /publico/cliente/preferencias — HU-29 CA1: canales push, sms y correo con su estado actual. */
export async function preferencias(req, res, next) {
  try {
    const datos = await obtenerPreferencias(req.cliente.tenant, req.cliente.clienteId);
    res.set('Cache-Control', 'no-store');
    res.json(datos);
  } catch (err) {
    next(err);
  }
}

/** PUT /publico/cliente/preferencias — HU-29 CA2, CA3, CA4: guarda los canales elegidos. */
export async function guardarPreferenciasCanal(req, res, next) {
  try {
    const datos = await guardarPreferencias(req.cliente.tenant, req.cliente.clienteId, req.body);
    res.set('Cache-Control', 'no-store');
    res.json(datos);
  } catch (err) {
    next(err);
  }
}

/** POST /publico/cliente/celular/codigo — HU-29 CA2: envía por sms un código de 6 dígitos al celular. */
export async function solicitarCodigoCelular(req, res, next) {
  try {
    const datos = await solicitarCodigo(req.cliente.tenant, req.cliente.clienteId, req.body);
    res.set('Cache-Control', 'no-store');
    res.json(datos);
  } catch (err) {
    next(err);
  }
}

/** POST /publico/cliente/celular/verificar — HU-29 CA2: valida el código y deja el celular verificado. */
export async function verificarCodigoCelular(req, res, next) {
  try {
    const datos = await confirmarCodigo(req.cliente.tenant, req.cliente.clienteId, req.body);
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

/** GET /publico/push/clave — HU-40: llave pública VAPID para que el navegador se suscriba. 503 sin push. */
export function clavePush(req, res, next) {
  const clavePublica = clavePublicaPush();
  if (!clavePublica) {
    next(new AppError('SERVICIO_NO_DISPONIBLE', 'Las notificaciones push no están disponibles en este momento'));
    return;
  }
  res.set('Cache-Control', 'public, max-age=3600');
  res.json({ clavePublica });
}

/** POST /publico/cliente/push — HU-40 CA1: registra el dispositivo del cliente para recibir push. */
export async function registrarPush(req, res, next) {
  try {
    const datos = await registrarDispositivo(req.cliente.tenant, req.cliente.clienteId, req.body, {
      userAgent: req.get?.('user-agent'),
    });
    res.set('Cache-Control', 'no-store');
    res.status(201).json(datos);
  } catch (err) {
    next(err);
  }
}

/** DELETE /publico/cliente/push — HU-40: el cliente deja de recibir push en este dispositivo. */
export async function eliminarPush(req, res, next) {
  try {
    const datos = await eliminarDispositivo(req.cliente.tenant, req.cliente.clienteId, req.body.endpoint);
    res.set('Cache-Control', 'no-store');
    res.json(datos);
  } catch (err) {
    next(err);
  }
}
