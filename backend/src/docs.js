// HU-43 CA1 — Sirve el contrato OpenAPI (backend/openapi/openapi.yaml) como JSON y como Swagger UI.
import { Router } from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import swaggerUi from 'swagger-ui-express';

export const RUTA_CONTRATO = fileURLToPath(new URL('../openapi/openapi.yaml', import.meta.url));
export const contrato = parse(readFileSync(RUTA_CONTRATO, 'utf8'));

export const documentacion = Router();
documentacion.get('/openapi.json', (req, res) => res.json(contrato));
documentacion.use(
  '/docs',
  swaggerUi.serve,
  swaggerUi.setup(contrato, {
    customSiteTitle: 'API de ZARU Ecosystem',
    swaggerOptions: { persistAuthorization: true, displayRequestDuration: true },
  }),
);
