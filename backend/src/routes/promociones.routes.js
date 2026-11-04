// HU-12 — Rutas de promociones. Todos las consultan; solo el admin las gestiona.
import { Router } from 'express';
import { requiereRol } from '../middlewares/auth.js';
import { validar } from '../shared/validar.js';
import { promocionNueva, promocionCambios, filtroPromociones } from '../schemas/promociones.schemas.js';
import * as ctrl from '../controllers/promociones.controller.js';

const router = Router();

router.get('/', validar({ query: filtroPromociones }), ctrl.listar);
router.post('/', requiereRol('admin'), validar({ body: promocionNueva }), ctrl.crear);
router.patch('/:id', requiereRol('admin'), validar({ body: promocionCambios }), ctrl.actualizar); // incluye activar/desactivar

export default router;
