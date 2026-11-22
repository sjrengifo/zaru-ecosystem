// HU-13 — Rutas del establecimiento (branding).
import { Router } from 'express';
import { requiereRol } from '../middlewares/auth.js';
import { validar } from '../shared/validar.js';
import { recibirLogo } from '../shared/logo.js';
import { branding, direccionSede } from '../schemas/establecimiento.schemas.js';
import * as ctrl from '../controllers/establecimiento.controller.js';

const router = Router();

router.get('/', ctrl.obtener);                  // nombre, logo y colores
router.put('/branding', requiereRol('admin'), validar({ body: branding }), ctrl.actualizarBranding);
router.post('/logo', requiereRol('admin'), recibirLogo, ctrl.subirLogo);
// HU-28 CA2: dirección que se muestra en el aviso de vehículo listo.
router.put('/direccion', requiereRol('admin'), validar({ body: direccionSede }), ctrl.actualizarDireccion);

export default router;
