// Rutas de la versión 1 de la API (HU-43 CA3). Se montan en /api/v1 (ver app.js).
// Cada ruta nueva debe documentarse en backend/openapi/openapi.yaml: una prueba lo verifica.
import { Router } from 'express';
import { requiereSesion } from '../middlewares/auth.js';

import clientesRoutes from './clientes.routes.js';
import vehiculosRoutes from './vehiculos.routes.js';
import serviciosRoutes from './servicios.routes.js';
import ordenesRoutes from './ordenes.routes.js';
import promocionesRoutes from './promociones.routes.js';
import usuariosRoutes from './usuarios.routes.js';
import establecimientoRoutes from './establecimiento.routes.js';
import * as me from '../controllers/me.controller.js';

export const VERSION_API = '1.0.0';

/** Módulos de la API: prefijo y router. Se exporta para verificar que todos estén documentados. */
export const MODULOS = [
  ['/clientes', clientesRoutes],               // HU-03, HU-04
  ['/vehiculos', vehiculosRoutes],             // HU-05, HU-06
  ['/servicios', serviciosRoutes],             // HU-07
  ['/ordenes', ordenesRoutes],                 // HU-08, HU-10
  ['/promociones', promocionesRoutes],         // HU-12
  ['/usuarios', usuariosRoutes],               // HU-02
  ['/establecimiento', establecimientoRoutes], // HU-13
];

const router = Router();

// Ruta pública para comprobar que la API está viva.
router.get('/health', (req, res) => {
  res.json({ ok: true, servicio: 'zaru-api', version: VERSION_API, fecha: new Date().toISOString() });
});

// De aquí en adelante, todo exige sesión iniciada.
router.use(requiereSesion);

router.get('/me', me.obtener); // HU-44 CA1, HU-01: usuario, rol y establecimiento de la sesión

for (const [prefijo, rutas] of MODULOS) router.use(prefijo, rutas);

export default router;
