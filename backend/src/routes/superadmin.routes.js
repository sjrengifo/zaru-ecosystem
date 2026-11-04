import { Router } from 'express';
import { requiereRol } from '../middlewares/auth.js';
import { validar } from '../shared/validar.js';
import { nuevoEstablecimiento, idEstablecimiento } from '../schemas/superadmin.schemas.js';
import * as ctrl from '../controllers/superadmin.controller.js';

const router = Router();
router.use(requiereRol('superadmin'));

router.get('/establecimientos', ctrl.listar);
router.post('/establecimientos', validar({ body: nuevoEstablecimiento }), ctrl.crear);
router.post('/establecimientos/:id/activar', validar({ params: idEstablecimiento }), ctrl.activar);
router.post('/establecimientos/:id/suspender', validar({ params: idEstablecimiento }), ctrl.suspender);

export default router;
