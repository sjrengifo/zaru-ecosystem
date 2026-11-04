// HU-07 — Rutas del catálogo de servicios. Solo el admin puede modificarlo.
import { Router } from 'express';
import { requiereModulo } from '../middlewares/auth.js';
import * as ctrl from '../controllers/servicios.controller.js';

const router = Router();

// HU-59: el operario lee el catálogo solo para elegir servicios al registrar un ingreso (HU-08);
// configurarlo es del módulo "servicios", exclusivo del administrador.
router.get('/', ctrl.listar);
router.post('/', requiereModulo('servicios'), ctrl.crear);
router.put('/:id', requiereModulo('servicios'), ctrl.actualizar);        // incluye activar/desactivar

export default router;
