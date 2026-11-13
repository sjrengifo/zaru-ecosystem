// HU-34 — Bitácora de notificaciones y HU-33 — alertas de avisos fallidos (solo administrador del establecimiento).
import { Router } from 'express';
import { validar } from '../shared/validar.js';
import { filtroNotificaciones, idNotificacion } from '../schemas/notificaciones.schemas.js';
import * as ctrl from '../controllers/notificaciones.controller.js';

const router = Router();

router.get('/', validar({ query: filtroNotificaciones }), ctrl.listar); // GET /api/v1/notificaciones
// HU-33 CA3: avisos que fallaron en todos los canales (alerta del dashboard). Antes de "/:id".
router.get('/fallidas', ctrl.fallidas); // GET /api/v1/notificaciones/fallidas
router.patch('/fallidas/:id/atendida', validar({ params: idNotificacion }), ctrl.atenderFallida);
router.get('/:id', validar({ params: idNotificacion }), ctrl.obtener); // GET /api/v1/notificaciones/:id

export default router;
