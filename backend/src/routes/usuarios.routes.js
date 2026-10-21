// HU-02 — Rutas de usuarios operarios. Solo el admin.
import { Router } from 'express';
import { soloAdmin } from '../middlewares/auth.js';
import * as ctrl from '../controllers/usuarios.controller.js';

const router = Router();

router.use(soloAdmin);
router.get('/', ctrl.listar);
router.post('/', ctrl.crear);                 // crea operario y le envía acceso
router.put('/:id', ctrl.actualizar);          // editar o desactivar

export default router;
