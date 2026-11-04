// HU-16 — Reportes de servicios y afluencia, solo para el administrador.
import { Router } from 'express';
import { soloAdmin } from '../middlewares/auth.js';
import { validar } from '../shared/validar.js';
import { rangoReporte } from '../schemas/reportes.schemas.js';
import * as ctrl from '../controllers/reportes.controller.js';

const router = Router();

router.get('/servicios', soloAdmin, validar({ query: rangoReporte }), ctrl.servicios);
router.get('/afluencia', soloAdmin, validar({ query: rangoReporte }), ctrl.afluencia);

export default router;
