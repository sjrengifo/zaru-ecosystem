// HU-31 — Rutas de configuración de notificaciones (solo administrador).
import { Router } from 'express';
import { requiereRol } from '../middlewares/auth.js';
import { validar } from '../shared/validar.js';
import { configuracionNotificaciones } from '../schemas/configuracion-notificaciones.schemas.js';
import * as ctrl from '../controllers/configuracion-notificaciones.controller.js';

const router = Router();

router.get('/notificaciones', requiereRol('admin'), ctrl.obtener);
router.put('/notificaciones', requiereRol('admin'), validar({ body: configuracionNotificaciones }), ctrl.actualizar);

export default router;
