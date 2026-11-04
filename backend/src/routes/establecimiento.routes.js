// HU-13 — Rutas del establecimiento (branding).
import { Router } from 'express';
import { requiereModulo } from '../middlewares/auth.js';
import { validar } from '../shared/validar.js';
import { recibirLogo } from '../shared/logo.js';
import { branding } from '../schemas/establecimiento.schemas.js';
import * as ctrl from '../controllers/establecimiento.controller.js';

const router = Router();

router.get('/', ctrl.obtener);                  // nombre, logo y colores (todo el panel los usa)
router.put('/branding', requiereModulo('branding'), validar({ body: branding }), ctrl.actualizarBranding);
router.post('/logo', requiereModulo('branding'), recibirLogo, ctrl.subirLogo);

export default router;
