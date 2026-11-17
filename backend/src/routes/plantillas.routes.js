// HU-32 — Plantillas de notificación (solo administrador: módulo "notificaciones").
import { Router } from 'express';
import { validar } from '../shared/validar.js';
import { guardarPlantilla, plantillaParams, vistaPrevia } from '../schemas/plantillas.schemas.js';
import * as ctrl from '../controllers/plantillas.controller.js';

const router = Router();

router.get('/', ctrl.listar); // GET /api/v1/plantillas
router.post('/vista-previa', validar({ body: vistaPrevia }), ctrl.vistaPrevia); // POST /api/v1/plantillas/vista-previa
router.put('/:estado/:canal', validar({ params: plantillaParams, body: guardarPlantilla }), ctrl.guardar);
router.delete('/:estado/:canal', validar({ params: plantillaParams }), ctrl.restaurar);

export default router;
