// Arma la API: seguridad HTTP, CORS, lectura de JSON, rutas versionadas, documentación y errores.
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rutasV1 from './routes/index.js';
import { documentacion } from './docs.js';
import { manejarErrores, rutaNoEncontrada } from './middlewares/errorHandler.js';
import { requestId } from './middlewares/requestId.js';

const app = express();

// Render y Vercel están detrás de un proxy: así req.ip es la IP real del cliente (auditoría).
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(requestId);

// HU-43 CA1: documentación OpenAPI en /api/docs (Swagger UI) y /api/openapi.json.
app.use('/api', documentacion);

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', exposedHeaders: ['X-Request-Id', 'Deprecation', 'Link'] }));
app.use(express.json({ limit: '1mb' }));

// HU-43 CA3: versión actual.
app.use('/api/v1', rutasV1);

// HU-43 CA3: /api sin versión sigue funcionando para las aplicaciones ya desplegadas.
// Responde igual que /api/v1 y avisa con encabezados estándar que debe migrarse (RFC 8594 / 9745).
const legado = express.Router();
legado.use((req, res, next) => {
  if (/^\/v\d+(\/|$)/.test(req.path)) return next('router'); // /api/v2… inexistente → 404
  res.set({ Deprecation: 'true', Link: '</api/v1>; rel="successor-version"' });
  next();
});
legado.use(rutasV1);
app.use('/api', legado);

app.use(rutaNoEncontrada);
app.use(manejarErrores);

export default app;
