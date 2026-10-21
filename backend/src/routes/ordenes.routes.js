// HU-08 y HU-10 — Rutas de órdenes de servicio (cada lavado).
import { Router } from 'express';
import * as ctrl from '../controllers/ordenes.controller.js';

const router = Router();

router.get('/activas', ctrl.listarActivas);           // para el dashboard (HU-09)
router.post('/', ctrl.crear);                          // ingreso de vehículo (HU-08)
router.patch('/:id/estado', ctrl.cambiarEstado);       // avanzar estado (HU-10)

export default router;
