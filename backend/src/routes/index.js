// Rutas de la versión 1 de la API (HU-43 CA3). Se montan en /api/v1.
// HU-59: cada prefijo operativo se protege con el mismo mapa de permisos que GET /me y el frontend.
import express, { Router } from 'express';
import { requiereSesion, requiereRol, requiereModulo } from '../middlewares/auth.js';

import clientesRoutes from './clientes.routes.js';
import vehiculosRoutes from './vehiculos.routes.js';
import serviciosRoutes from './servicios.routes.js';
import ordenesRoutes from './ordenes.routes.js';
import promocionesRoutes from './promociones.routes.js';
import campanasRoutes from './campanas.routes.js';
import usuariosRoutes from './usuarios.routes.js';
import establecimientoRoutes from './establecimiento.routes.js';
import superadminRoutes from './superadmin.routes.js';
import reportesRoutes from './reportes.routes.js';
import notificacionesRoutes from './notificaciones.routes.js';
import plantillasRoutes from './plantillas.routes.js';
import configuracionRoutes from './configuracion.routes.js';
import * as me from '../controllers/me.controller.js';
import * as politicas from '../controllers/politicas.controller.js';
import * as seguimiento from '../controllers/seguimiento.controller.js';
import * as publico from '../controllers/publico.controller.js';
import * as promocionesPublicas from '../controllers/promocionesPublicas.controller.js';
import * as baja from '../controllers/baja.controller.js';
import * as recordatorios from '../controllers/recordatorios.controller.js';
import * as webhooks from '../controllers/webhooks.controller.js';
import * as cliente from '../controllers/cliente.controller.js';
import { validar } from '../shared/validar.js';
import { busquedaPublica } from '../schemas/publico.schemas.js';
import {
  bajaPush,
  confirmacionCodigoSms,
  filtroHistorial,
  idNotificacionCliente,
  idOrden,
  preferenciasCanal,
  solicitudCodigoSms,
  solicitudOtp,
  verificacionOtp,
  suscripcionPush,
} from '../schemas/cliente.schemas.js';
import { requierePase } from '../shared/paseCliente.js';

export const VERSION_API = '1.0.0';

export const MODULOS = [
  ['/clientes', clientesRoutes],
  ['/vehiculos', vehiculosRoutes],
  ['/servicios', serviciosRoutes],
  ['/ordenes', ordenesRoutes],
  ['/promociones', promocionesRoutes],
  // HU-35: campañas de promociones segmentadas.
  ['/campanas', campanasRoutes],
  ['/usuarios', usuariosRoutes],
  ['/establecimiento', establecimientoRoutes],
  ['/superadmin', superadminRoutes],
  ['/reportes', reportesRoutes],
  ['/notificaciones', notificacionesRoutes],
  // HU-32: plantillas de notificación de la sede.
  ['/plantillas', plantillasRoutes],
  // HU-31: configuración de los estados que generan notificación.
  ['/configuracion', configuracionRoutes],
];

export const MODULO_DE_PREFIJO = {
  '/clientes': 'clientes',
  '/vehiculos': 'vehiculos',
  '/ordenes': 'dashboard',
  // '/promociones' NO va aquí: GET es de solo lectura para el operario (FormularioIngreso pide las vigentes
  // al registrar un ingreso). POST/PATCH ya exigen requiereRol('admin') en promociones.routes.js.
  // HU-35: las campañas sí son exclusivas del administrador y viven en el módulo de promociones.
  '/campanas': 'promociones',
  '/usuarios': 'usuarios',
  '/reportes': 'reportes',
  '/notificaciones': 'notificaciones',
  // HU-32: las plantillas son parte de las notificaciones; solo el administrador.
  '/plantillas': 'notificaciones',
  // HU-31: la configuración de avisos también vive en el módulo de notificaciones.
  '/configuracion': 'notificaciones',
};

const router = Router();
const COMMIT = process.env.RENDER_GIT_COMMIT || 'local';

router.get('/health', (req, res) => {
  res.json({ ok: true, servicio: 'zaru-api', version: VERSION_API, commit: COMMIT, fecha: new Date().toISOString() });
});

// La consulta de política es pública.
router.get('/politicas-datos/vigente', politicas.vigente);

// HU-18: el cliente final sigue su lavado con el código de seguimiento, sin sesión.
router.get('/publico/seguimiento/:codigo', seguimiento.obtener);
router.get('/publico/seguimiento/:codigo/eventos', seguimiento.eventos);

// HU-17: el cliente final entra desde el enlace o el QR de su sede con la placa o el celular.
router.get('/publico/sedes/:slug', publico.sede);
router.post('/publico/sedes/:slug/buscar', validar({ body: busquedaPublica }), publico.buscar);

// HU-26: promociones vigentes de la sede, con su marca, sin sesión.
router.get('/publico/sedes/:slug/promociones', promocionesPublicas.listar);
// HU-27: detalle y condiciones de una promoción vigente de la sede, sin sesión.
router.get('/publico/sedes/:slug/promociones/:id', promocionesPublicas.obtener);

// HU-33 CA4: los proveedores confirman la entrega. Públicas: las protege la firma del proveedor.
router.post('/webhooks/resend', webhooks.resend);
router.post('/webhooks/twilio', express.urlencoded({ extended: false, limit: '64kb' }), webhooks.twilio);

// HU-30 CA3: el cliente deja de recibir avisos o promociones desde el enlace del correo, sin sesión.
router.get('/publico/baja/:token', baja.consultar);
router.post('/publico/baja/:token', baja.confirmar);

// HU-36 CA3: baja de los recordatorios de un vehículo desde el enlace del correo.
router.get('/publico/recordatorios/:token/desactivar', recordatorios.consultar);
router.post('/publico/recordatorios/:token/desactivar', recordatorios.desactivar);
// HU-23 / HU-24: historial y detalle de servicios del cliente final. Ninguna de estas rutas acepta
// un id de cliente o de sede ajeno: ambos salen del pase firmado.
// RF-F5-11 / RF-F5-12: el cliente entra con su celular y un código de un solo uso por SMS.
router.post('/publico/sedes/:slug/otp', validar({ body: solicitudOtp }), cliente.solicitarOtp);
router.post('/publico/sedes/:slug/otp/verificar', validar({ body: verificacionOtp }), cliente.verificarOtp);
router.get('/publico/cliente/vehiculos', requierePase, cliente.vehiculos);
router.get('/publico/cliente/historial', requierePase, validar({ query: filtroHistorial }), cliente.historial);
router.get('/publico/cliente/historial/:ordenId', requierePase, validar({ params: idOrden }), cliente.detalle);
// HU-38: centro de notificaciones del cliente final, con el mismo pase del historial.
router.get('/publico/cliente/notificaciones', requierePase, cliente.notificaciones);
router.patch('/publico/cliente/notificaciones/:id/leida', requierePase, validar({ params: idNotificacionCliente }), cliente.notificacionLeida);
// HU-29: el cliente elige por qué canales recibe sus avisos (push, sms, correo) y valida su celular con
// un código de 6 dígitos para activar el sms. Mismo pase del historial.
router.get('/publico/cliente/preferencias', requierePase, cliente.preferencias);
router.put('/publico/cliente/preferencias', requierePase, validar({ body: preferenciasCanal }), cliente.guardarPreferenciasCanal);
router.post('/publico/cliente/celular/codigo', requierePase, validar({ body: solicitudCodigoSms }), cliente.solicitarCodigoCelular);
router.post('/publico/cliente/celular/verificar', requierePase, validar({ body: confirmacionCodigoSms }), cliente.verificarCodigoCelular);
// HU-40: registrar (o quitar) el dispositivo del cliente para recibir notificaciones push.
router.get('/publico/push/clave', cliente.clavePush);
router.post('/publico/cliente/push', requierePase, validar({ body: suscripcionPush }), cliente.registrarPush);
router.delete('/publico/cliente/push', requierePase, validar({ body: bajaPush }), cliente.eliminarPush);

// Todo lo demás requiere sesión.
router.use(requiereSesion);
router.get('/me', me.obtener);

// La administración global nunca recibe req.tenant.
router.use('/superadmin', superadminRoutes);

// Un superadministrador no puede usar endpoints operativos.
router.use(requiereRol('admin', 'operario'));
for (const [prefijo, rutas] of MODULOS) {
  if (prefijo === '/superadmin') continue;
  const modulo = MODULO_DE_PREFIJO[prefijo];
  if (modulo) router.use(prefijo, requiereModulo(modulo), rutas);
  else router.use(prefijo, rutas);
}

export default router;
