// HU-35 — Campañas de promociones segmentadas (solo administrador: módulo "promociones").
import { Router } from 'express';
import { requiereRol } from '../middlewares/auth.js';
import { validar } from '../shared/validar.js';
import { crearCampana, estimarCampana, filtroCampanas } from '../schemas/campanas.schemas.js';
import * as ctrl from '../controllers/campanas.controller.js';

const router = Router();

router.get('/', requiereRol('admin'), validar({ query: filtroCampanas }), ctrl.listar); // GET /api/v1/campanas
router.post('/estimar', requiereRol('admin'), validar({ body: estimarCampana }), ctrl.estimar); // POST /api/v1/campanas/estimar
router.post('/', requiereRol('admin'), validar({ body: crearCampana }), ctrl.crear); // POST /api/v1/campanas

export default router;
