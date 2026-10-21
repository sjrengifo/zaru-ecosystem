// HU-05 y HU-06 — Rutas de vehículos.
import { Router } from 'express';
import * as ctrl from '../controllers/vehiculos.controller.js';

const router = Router();

router.get('/', ctrl.listar);                     // GET  /api/vehiculos?placa=ABC123
router.post('/', ctrl.crear);                      // POST /api/vehiculos
router.get('/:id/historial', ctrl.historial);      // GET  /api/vehiculos/:id/historial  (HU-06)

export default router;
