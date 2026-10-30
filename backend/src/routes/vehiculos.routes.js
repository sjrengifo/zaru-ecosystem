// HU-05 y HU-06 — Rutas de vehículos.
import { Router } from 'express';
import { validar } from '../shared/validar.js';
import { vehiculoNuevo, busquedaVehiculos } from '../schemas/vehiculos.schemas.js';
import * as ctrl from '../controllers/vehiculos.controller.js';

const router = Router();

router.get('/', validar({ query: busquedaVehiculos }), ctrl.listar); // GET  /api/v1/vehiculos?placa=ABC123
router.post('/', validar({ body: vehiculoNuevo }), ctrl.crear);       // POST /api/v1/vehiculos
router.get('/:id/historial', ctrl.historial);                         // GET  /api/v1/vehiculos/:id/historial  (HU-06)

export default router;
