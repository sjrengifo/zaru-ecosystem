// HU-39 — Consumo propio de la sede (RF-F7-23). Solo administradores con tenant.
import { Router } from 'express';
import { requiereRol } from '../middlewares/auth.js';
import { validar } from '../shared/validar.js';
import { filtroConsumo } from '../schemas/consumo.schemas.js';
import * as ctrl from '../controllers/consumo.controller.js';

const router = Router();
router.use(requiereRol('admin'));

router.get('/', validar({ query: filtroConsumo }), ctrl.obtenerPropio);
router.get('/alertas', validar({ query: filtroConsumo }), ctrl.alertasPropias);

export default router;
