// HU-03 y HU-04 — Rutas de clientes.
// 📘 EJEMPLO DE REFERENCIA: copien este patrón (ruta → controlador) para los demás módulos.
import { Router } from 'express';
import * as ctrl from '../controllers/clientes.controller.js';

const router = Router();

router.get('/', ctrl.listar);          // GET  /api/clientes?buscar=texto
router.get('/:id', ctrl.obtener);      // GET  /api/clientes/:id
router.post('/', ctrl.crear);          // POST /api/clientes
router.put('/:id', ctrl.actualizar);   // PUT  /api/clientes/:id

export default router;
