// HU-08 y HU-10 — Rutas de órdenes de servicio (cada lavado).
import { Router } from 'express';
import { requiereRol } from '../middlewares/auth.js';
import { validar } from '../shared/validar.js';
import { recibirFotosNovedad } from '../shared/evidencias.js';
import { cambioEstadoOrden, novedadNueva, ordenNueva } from '../schemas/ordenes.schemas.js';
import * as ctrl from '../controllers/ordenes.controller.js';
import * as novedades from '../controllers/novedades.controller.js';

const router = Router();

router.get('/activas', requiereRol('admin', 'operario'), ctrl.listarActivas); // para el dashboard (HU-09)
router.post('/', requiereRol('admin', 'operario'), validar({ body: ordenNueva }), ctrl.crear); // ingreso de vehículo (HU-08)
router.patch('/:id/estado', requiereRol('admin', 'operario'), validar({ body: cambioEstadoOrden }), ctrl.cambiarEstado); // avanzar estado (HU-10)
router.post('/:id/novedades', requiereRol('admin', 'operario'), validar({ body: novedadNueva }), ctrl.registrarNovedad);
router.get('/:id/novedades', requiereRol('admin', 'operario'), novedades.listar);
router.post('/:id/novedades/:novedadId/fotos', requiereRol('admin', 'operario'), recibirFotosNovedad, novedades.subirFotos);

export default router;
