// Arma la API: permisos CORS, lectura de JSON, rutas y manejo de errores.
import express from 'express';
import cors from 'cors';
import rutas from './routes/index.js';
import { manejarErrores, rutaNoEncontrada } from './middlewares/errorHandler.js';
import { requestId } from './middlewares/requestId.js';

const app = express();

// Render y Vercel están detrás de un proxy: así req.ip es la IP real del cliente (auditoría).
app.set('trust proxy', 1);
app.use(requestId);

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', exposedHeaders: ['X-Request-Id'] }));
app.use(express.json());

// Todas las rutas empiezan por /api  →  ej: /api/clientes
app.use('/api', rutas);

app.use(rutaNoEncontrada);
app.use(manejarErrores);

export default app;
