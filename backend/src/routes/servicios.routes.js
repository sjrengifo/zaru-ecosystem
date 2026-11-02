// HU-07 — Rutas del catálogo de servicios. Solo el admin puede modificarlo.
import { Router } from 'express';
import { requiereRol } from '../middlewares/auth.js';
import * as ctrl from '../controllers/servicios.controller.js';

const router = Router();

router.get('/', ctrl.listar);                         // todos pueden ver el catálogo
router.post('/', requiereRol('admin'), ctrl.crear);
router.put('/:id', requiereRol('admin'), ctrl.actualizar);        // incluye activar/desactivar

export default router;
