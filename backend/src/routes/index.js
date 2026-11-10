// Rutas de la versión 1 de la API (HU-43 CA3). Se montan en /api/v1.
// HU-59: cada prefijo operativo se protege con el mismo mapa de permisos que GET /me y el frontend.
import { Router } from 'express';
import { requiereSesion, requiereRol, requiereModulo } from '../middlewares/auth.js';

import clientesRoutes from './clientes.routes.js';
import vehiculosRoutes from './vehiculos.routes.js';
import serviciosRoutes from './servicios.routes.js';
import ordenesRoutes from './ordenes.routes.js';
import promocionesRoutes from './promociones.routes.js';
import usuariosRoutes from './usuarios.routes.js';
import establecimientoRoutes from './establecimiento.routes.js';
import superadminRoutes from './superadmin.routes.js';
import reportesRoutes from './reportes.routes.js';
import * as me from '../controllers/me.controller.js';
import * as politicas from '../controllers/politicas.controller.js';
import * as seguimiento from '../controllers/seguimiento.controller.js';
import * as publico from '../controllers/publico.controller.js';
import { validar } from '../shared/validar.js';
import { busquedaPublica } from '../schemas/publico.schemas.js';

export const VERSION_API = '1.0.0';

export const MODULOS = [
  ['/clientes', clientesRoutes],
  ['/vehiculos', vehiculosRoutes],
  ['/servicios', serviciosRoutes],
  ['/ordenes', ordenesRoutes],
  ['/promociones', promocionesRoutes],
  ['/usuarios', usuariosRoutes],
  ['/establecimiento', establecimientoRoutes],
  ['/superadmin', superadminRoutes],
  ['/reportes', reportesRoutes],
];

export const MODULO_DE_PREFIJO = {
  '/clientes': 'clientes',
  '/vehiculos': 'vehiculos',
  '/ordenes': 'dashboard',
  // '/promociones' NO va aquí: GET es de solo lectura para el operario (FormularioIngreso pide las vigentes
  // al registrar un ingreso). POST/PATCH ya exigen requiereRol('admin') en promociones.routes.js.
  '/usuarios': 'usuarios',
  '/reportes': 'reportes',
};

const router = Router();
const COMMIT = process.env.RENDER_GIT_COMMIT || 'local';

router.get('/health', (req, res) => {
  res.json({ ok: true, servicio: 'zaru-api', version: VERSION_API, commit: COMMIT, fecha: new Date().toISOString() });
});

// La consulta de política es pública.
router.get('/politicas-datos/vigente', politicas.vigente);

// HU-18: el cliente final sigue su lavado con el código de seguimiento, sin sesión.
router.get('/publico/seguimiento/:codigo', seguimiento.obtener);
router.get('/publico/seguimiento/:codigo/eventos', seguimiento.eventos);

// HU-17: el cliente final entra desde el enlace o el QR de su sede con la placa o el celular.
router.get('/publico/sedes/:slug', publico.sede);
router.post('/publico/sedes/:slug/buscar', validar({ body: busquedaPublica }), publico.buscar);

// Todo lo demás requiere sesión.
router.use(requiereSesion);
router.get('/me', me.obtener);

// La administración global nunca recibe req.tenant.
router.use('/superadmin', superadminRoutes);

// Un superadministrador no puede usar endpoints operativos.
router.use(requiereRol('admin', 'operario'));
for (const [prefijo, rutas] of MODULOS) {
  if (prefijo === '/superadmin') continue;
  const modulo = MODULO_DE_PREFIJO[prefijo];
  if (modulo) router.use(prefijo, requiereModulo(modulo), rutas);
  else router.use(prefijo, rutas);
}

export default router;
