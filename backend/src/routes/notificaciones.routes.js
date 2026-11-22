// HU-34 — Bitácora de notificaciones y HU-33 — alertas de avisos fallidos (solo administrador del establecimiento).
import { Router } from 'express';
import { requiereRol } from '../middlewares/auth.js';
import { validar } from '../shared/validar.js';
import { filtroNotificaciones, idNotificacion } from '../schemas/notificaciones.schemas.js';
import { pruebaNotificacion } from '../schemas/canales.schemas.js';
import { bajaPush, suscripcionPush } from '../schemas/cliente.schemas.js';
import * as ctrl from '../controllers/notificaciones.controller.js';

const router = Router();

router.get('/', validar({ query: filtroNotificaciones }), ctrl.listar); // GET /api/v1/notificaciones
// HU-39/HU-40: dispositivo push del administrador para la prueba de envío. Antes de "/:id".
// La clave pública es la misma del registro de clientes (ruta pública /publico/push/clave).
router.post('/push', requiereRol('admin'), validar({ body: suscripcionPush }), ctrl.registrarPushAdmin);
router.post('/push/baja', requiereRol('admin'), validar({ body: bajaPush }), ctrl.eliminarPushAdmin);
// HU-31/HU-39: envío real de prueba con fallback y consumo. Antes de "/:id".
router.post('/prueba', requiereRol('admin'), validar({ body: pruebaNotificacion }), ctrl.enviarPrueba);
// HU-33 CA3: avisos que fallaron en todos los canales (alerta del dashboard). Antes de "/:id".
router.get('/fallidas', ctrl.fallidas); // GET /api/v1/notificaciones/fallidas
router.patch('/fallidas/:id/atendida', validar({ params: idNotificacion }), ctrl.atenderFallida);
router.get('/:id', validar({ params: idNotificacion }), ctrl.obtener); // GET /api/v1/notificaciones/:id

export default router;
