// HU-13 — Rutas del establecimiento (branding).
import { Router } from 'express';
import { requiereRol } from '../middlewares/auth.js';
import * as ctrl from '../controllers/establecimiento.controller.js';

const router = Router();

router.get('/', ctrl.obtener);                  // nombre, logo y colores
router.put('/branding', requiereRol('admin'), ctrl.actualizarBranding);

export default router;
