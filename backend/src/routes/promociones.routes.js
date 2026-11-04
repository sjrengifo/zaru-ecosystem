// HU-12 — Rutas de promociones. Solo el admin (HU-59 CA1: el operario no ve promociones).
import { Router } from 'express';
import { requiereRol, requiereModulo } from '../middlewares/auth.js';
import { validar } from '../shared/validar.js';
import { promocionNueva, promocionCambios, filtroPromociones } from '../schemas/promociones.schemas.js';
import * as ctrl from '../controllers/promociones.controller.js';

const router = Router();
router.use(requiereModulo('promociones')); // HU-59

router.get('/', validar({ query: filtroPromociones }), ctrl.listar);
router.post('/', requiereRol('admin'), validar({ body: promocionNueva }), ctrl.crear);
router.patch('/:id', requiereRol('admin'), validar({ body: promocionCambios }), ctrl.actualizar); // incluye activar/desactivar

export default router;
