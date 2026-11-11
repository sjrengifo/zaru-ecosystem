// HU-34 — Bitácora de notificaciones (solo administrador del establecimiento).
import { Router } from 'express';
import { validar } from '../shared/validar.js';
import { filtroNotificaciones, idNotificacion } from '../schemas/notificaciones.schemas.js';
import * as ctrl from '../controllers/notificaciones.controller.js';

const router = Router();

router.get('/', validar({ query: filtroNotificaciones }), ctrl.listar); // GET /api/v1/notificaciones
router.get('/:id', validar({ params: idNotificacion }), ctrl.obtener); // GET /api/v1/notificaciones/:id

export default router;
