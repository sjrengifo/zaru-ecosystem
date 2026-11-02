// HU-12 — Rutas de promociones. Solo el admin las gestiona.
import { Router } from 'express';
import { requiereRol } from '../middlewares/auth.js';
import * as ctrl from '../controllers/promociones.controller.js';

const router = Router();

router.get('/', ctrl.listar);
router.post('/', requiereRol('admin'), ctrl.crear);
router.put('/:id', requiereRol('admin'), ctrl.actualizar);

export default router;
