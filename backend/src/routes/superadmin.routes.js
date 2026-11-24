// HU-57 / HU-39 — Administración de la plataforma. Solo el superadministrador (sin tenant).
import { Router } from 'express';
import { requiereModulo } from '../middlewares/auth.js';
import { validar } from '../shared/validar.js';
import {
  nuevoEstablecimiento,
  idEstablecimiento,
  filtroEstablecimientos,
  cambioEstadoEstablecimiento,
} from '../schemas/superadmin.schemas.js';
import {
  filtroConsumo,
  idEstablecimientoConsumo,
  nombrePlan,
  cuposPlan,
} from '../schemas/consumo.schemas.js';
import * as ctrl from '../controllers/superadmin.controller.js';
import * as consumo from '../controllers/consumo.controller.js';

const router = Router();
router.use(requiereModulo('superadmin')); // HU-59: mismo mapa de permisos que el resto del panel

router.get('/establecimientos', validar({ query: filtroEstablecimientos }), ctrl.listar);
router.post('/establecimientos', validar({ body: nuevoEstablecimiento }), ctrl.crear);
router.post('/establecimientos/:id/activar', validar({ params: idEstablecimiento, body: cambioEstadoEstablecimiento }), ctrl.activar);
router.post('/establecimientos/:id/suspender', validar({ params: idEstablecimiento, body: cambioEstadoEstablecimiento }), ctrl.suspender);
router.post('/establecimientos/:id/reenviar-invitacion', validar({ params: idEstablecimiento }), ctrl.reenviarInvitacion);

// HU-39 CA3: reporte global, detalle por sede y catálogo de cupos de los planes.
router.get('/consumo', validar({ query: filtroConsumo }), consumo.reporte);
router.get('/consumo/alertas', validar({ query: filtroConsumo }), consumo.alertasGlobales);
router.get('/consumo/:establecimientoId', validar({ params: idEstablecimientoConsumo, query: filtroConsumo }), consumo.detalle);
router.get('/planes', consumo.planes);
router.put('/planes/:nombre', validar({ params: nombrePlan, body: cuposPlan }), consumo.cambiarPlan);

export default router;
