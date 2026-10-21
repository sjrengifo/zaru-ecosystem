// Arma la API: permisos CORS, lectura de JSON, rutas y manejo de errores.
import express from 'express';
import cors from 'cors';
import rutas from './routes/index.js';
import { manejarErrores, rutaNoEncontrada } from './middlewares/errorHandler.js';

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json());

// Todas las rutas empiezan por /api  →  ej: /api/clientes
app.use('/api', rutas);

app.use(rutaNoEncontrada);
app.use(manejarErrores);

export default app;
