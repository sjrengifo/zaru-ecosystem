// HU-07 — Rutas del catálogo de servicios. Solo el admin puede modificarlo.
import { Router } from 'express';
import { requiereRol } from '../middlewares/auth.js';
import { validar } from '../shared/validar.js';
import { filtroServicios, servicioNuevo, servicioCambios } from '../schemas/servicios.schemas.js';
import * as ctrl from '../controllers/servicios.controller.js';

const router = Router();

router.get('/', validar({ query: filtroServicios }), ctrl.listar); // todos pueden ver el catálogo
router.post('/', requiereRol('admin'), validar({ body: servicioNuevo }), ctrl.crear);
router.patch('/:id', requiereRol('admin'), validar({ body: servicioCambios }), ctrl.actualizar); // incluye activar/desactivar

export default router;
