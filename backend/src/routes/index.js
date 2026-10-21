// Reúne todas las rutas de la API.
import { Router } from 'express';
import { requiereSesion } from '../middlewares/auth.js';

import clientesRoutes from './clientes.routes.js';
import vehiculosRoutes from './vehiculos.routes.js';
import serviciosRoutes from './servicios.routes.js';
import ordenesRoutes from './ordenes.routes.js';
import promocionesRoutes from './promociones.routes.js';
import usuariosRoutes from './usuarios.routes.js';
import establecimientoRoutes from './establecimiento.routes.js';

const router = Router();

// Ruta pública para comprobar que la API está viva.
router.get('/health', (req, res) => {
  res.json({ ok: true, servicio: 'zaru-api', fecha: new Date().toISOString() });
});

// De aquí en adelante, todo exige sesión iniciada.
router.use(requiereSesion);

router.use('/clientes', clientesRoutes);           // HU-03, HU-04
router.use('/vehiculos', vehiculosRoutes);         // HU-05, HU-06
router.use('/servicios', serviciosRoutes);         // HU-07
router.use('/ordenes', ordenesRoutes);             // HU-08, HU-10
router.use('/promociones', promocionesRoutes);     // HU-12
router.use('/usuarios', usuariosRoutes);           // HU-02
router.use('/establecimiento', establecimientoRoutes); // HU-13

export default router;
