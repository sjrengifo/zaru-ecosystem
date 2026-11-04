// HU-02 — Rutas de usuarios operarios. Solo el admin.
import { Router } from 'express';
import { requiereRol } from '../middlewares/auth.js';
import { validar } from '../shared/validar.js';
import { usuarioNuevo, usuarioCambios, idUsuario } from '../schemas/usuarios.schemas.js';
import * as ctrl from '../controllers/usuarios.controller.js';

const router = Router();

router.use(requiereRol('admin'));
router.get('/', ctrl.listar);
router.post('/', validar({ body: usuarioNuevo }), ctrl.crear);                 // crea operario y le envía acceso
router.put('/:id', validar({ params: idUsuario, body: usuarioCambios }), ctrl.actualizar); // editar o desactivar

export default router;
