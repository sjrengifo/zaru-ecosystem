// HU-57 — Administración de la plataforma. Solo el superadministrador (sin tenant).
import { Router } from 'express';
import { requiereModulo } from '../middlewares/auth.js';
import { validar } from '../shared/validar.js';
import { nuevoEstablecimiento, idEstablecimiento, filtroEstablecimientos, cambioEstadoEstablecimiento } from '../schemas/superadmin.schemas.js';
import * as ctrl from '../controllers/superadmin.controller.js';

const router = Router();
router.use(requiereModulo('superadmin')); // HU-59: mismo mapa de permisos que el resto del panel

router.get('/establecimientos', validar({ query: filtroEstablecimientos }), ctrl.listar);
router.post('/establecimientos', validar({ body: nuevoEstablecimiento }), ctrl.crear);
router.post('/establecimientos/:id/activar', validar({ params: idEstablecimiento, body: cambioEstadoEstablecimiento }), ctrl.activar);
router.post('/establecimientos/:id/suspender', validar({ params: idEstablecimiento, body: cambioEstadoEstablecimiento }), ctrl.suspender);
router.post('/establecimientos/:id/reenviar-invitacion', validar({ params: idEstablecimiento }), ctrl.reenviarInvitacion);

export default router;
