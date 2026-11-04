// HU-08, HU-09, HU-10 y HU-46 — Rutas de órdenes de servicio (cada lavado).
// HU-59 CA1: es el trabajo diario del operario, así que admin y operario tienen acceso.
import { Router } from 'express';
import { validar } from '../shared/validar.js';
import { ordenNueva, cambioEstado } from '../schemas/ordenes.schemas.js';
import * as ctrl from '../controllers/ordenes.controller.js';

const router = Router();

router.get('/activas', ctrl.listarActivas);                                      // dashboard (HU-09)
router.post('/', validar({ body: ordenNueva }), ctrl.crear);                      // ingreso + correo (HU-08, HU-46 CA1)
router.patch('/:id/estado', validar({ body: cambioEstado }), ctrl.cambiarEstado); // avanzar + correo "listo" (HU-10, HU-46 CA2)

export default router;
