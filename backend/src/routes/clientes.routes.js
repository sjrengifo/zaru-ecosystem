// HU-03 y HU-04 — Rutas de clientes.
// 📘 EJEMPLO DE REFERENCIA: ruta → validación (zod) → controlador. Copien este patrón en los demás módulos
// y documenten cada ruta nueva en backend/openapi/openapi.yaml (una prueba lo verifica).
import { Router } from 'express';
import { validar } from '../shared/validar.js';
import { clienteNuevo, clienteCambios, busquedaClientes } from '../schemas/clientes.schemas.js';
import * as ctrl from '../controllers/clientes.controller.js';

const router = Router();

router.get('/', validar({ query: busquedaClientes }), ctrl.listar);   // GET  /api/v1/clientes?buscar=texto
router.get('/:id', ctrl.obtener);                                      // GET  /api/v1/clientes/:id
router.post('/', validar({ body: clienteNuevo }), ctrl.crear);         // POST /api/v1/clientes
router.put('/:id', validar({ body: clienteCambios }), ctrl.actualizar); // PUT  /api/v1/clientes/:id

export default router;
