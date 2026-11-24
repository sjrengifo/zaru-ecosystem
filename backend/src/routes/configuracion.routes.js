// HU-31 — Rutas de configuración de notificaciones (solo administrador).
import { Router } from 'express';
import { requiereRol } from '../middlewares/auth.js';
import { validar } from '../shared/validar.js';
import { configuracionNotificaciones } from '../schemas/configuracion-notificaciones.schemas.js';
import { preferenciasCanales } from '../schemas/canales.schemas.js';
import * as ctrl from '../controllers/configuracion-notificaciones.controller.js';
import * as ctrlCanales from '../controllers/canales.controller.js';

const router = Router();

router.get('/notificaciones', requiereRol('admin'), ctrl.obtener);
router.put('/notificaciones', requiereRol('admin'), validar({ body: configuracionNotificaciones }), ctrl.actualizar);
// HU-31/HU-39: preferencias por canal para la prueba. No bloquean los avisos operativos.
router.get('/canales', requiereRol('admin'), ctrlCanales.obtener);
router.put('/canales', requiereRol('admin'), validar({ body: preferenciasCanales }), ctrlCanales.actualizar);

export default router;
