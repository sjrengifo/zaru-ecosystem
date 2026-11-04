// HU-13 — Rutas del establecimiento (branding).
import { Router } from 'express';
import { requiereRol } from '../middlewares/auth.js';
import { validar } from '../shared/validar.js';
import { recibirLogo } from '../shared/logo.js';
import { branding } from '../schemas/establecimiento.schemas.js';
import * as ctrl from '../controllers/establecimiento.controller.js';

const router = Router();

router.get('/', ctrl.obtener);                  // nombre, logo y colores
router.put('/branding', requiereRol('admin'), validar({ body: branding }), ctrl.actualizarBranding);
router.post('/logo', requiereRol('admin'), recibirLogo, ctrl.subirLogo);

export default router;
