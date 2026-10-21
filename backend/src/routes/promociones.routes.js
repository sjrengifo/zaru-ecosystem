// HU-12 — Rutas de promociones. Solo el admin las gestiona.
import { Router } from 'express';
import { soloAdmin } from '../middlewares/auth.js';
import * as ctrl from '../controllers/promociones.controller.js';

const router = Router();

router.get('/', ctrl.listar);
router.post('/', soloAdmin, ctrl.crear);
router.put('/:id', soloAdmin, ctrl.actualizar);

export default router;
