// HU-02 — Rutas de usuarios operarios. Solo el admin.
import { Router } from 'express';
import { requiereModulo } from '../middlewares/auth.js';
import * as ctrl from '../controllers/usuarios.controller.js';

const router = Router();

router.use(requiereModulo('usuarios')); // HU-02 CA2, HU-59 CA1
router.get('/', ctrl.listar);
router.post('/', ctrl.crear);                 // crea operario y le envía acceso
router.put('/:id', ctrl.actualizar);          // editar o desactivar

export default router;
