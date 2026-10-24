# F0 — Fundaciones técnicas: Plan técnico

## 1. Resumen del enfoque
Se reorganiza `backend/src` según `02-arquitectura.md`, se adoptan las librerías del stack, se escribe el contrato OpenAPI inicial, se configura Supabase CLI para migraciones y base local, y se amplía el workflow de CI. Los módulos existentes (`clientes`, `servicios`, `establecimiento`) se migran a la estructura por módulos sin cambiar su comportamiento.

## 2. Cambios en el modelo de datos

| Objeto | Cambio | Motivo |
|---|---|---|
| `supabase/migrations/` | Se crean tres migraciones que reproducen exactamente el esquema desplegado: `esquema_inicial`, `funciones_seguridad_esquema_privado`, `indices_llaves_foraneas` | RF-F0-07 |
| `supabase/seed.sql` | Se mueve desde `database/seed.sql` | RF-F0-07 |
| `database/schema.sql` | Pasa a generarse con `supabase db dump --schema public,privado` | ADR-02 |

Las migraciones locales deben llevar las mismas versiones que las aplicadas en el proyecto remoto (`supabase migration list` debe mostrar local y remoto alineados).

## 3. Contrato de API

| Método | Ruta | Respuesta | RF |
|---|---|---|---|
| GET | `/api/v1/health` | `200 { estado: "ok", version, fecha }` | RF-F0-06 |
| GET | `/api/v1/health/ready` | `200 { baseDeDatos: "ok" }` · `503` | RF-F0-06 |
| GET | `/api/docs` | Swagger UI | RF-F0-02 |
| GET | `/api/openapi.json` | Contrato en JSON | RF-F0-02 |

`openapi.yaml` incluye desde F0 los componentes reutilizables: `Error`, `ErrorDetalle`, `Paginacion`, `securitySchemes` (`bearerPanel`, `bearerCliente`) y el parámetro `Idempotency-Key`.

## 4. Diseño de módulos

| Componente | Responsabilidad |
|---|---|
| `config/env.js` | Esquema `zod` de variables (`NODE_ENV`, `PORT`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FRONTEND_URL`, `LOG_LEVEL`). Exporta un objeto inmutable. |
| `config/logger.js` | `pino` con `redact` para `req.headers.authorization`, `*.telefono`, `*.correo`, `*.password`. |
| `middlewares/requestId.js` | Usa `X-Request-Id` entrante o genera un UUID; lo expone en la respuesta. |
| `shared/errors.js` | `AppError` + mapa `codigo → status`. |
| `shared/validate.js` | `validate({ body, query, params })` con esquemas `zod`; traduce `ZodError` a `VALIDACION`. |
| `middlewares/errorHandler.js` | Formato único; registra 5xx con nivel `error` y 4xx con nivel `warn`. |
| `app.js` | Orden: `requestId → pino-http → helmet → cors → json(1mb) → /api/v1 → /api/docs → 404 → errorHandler`. |
| `server.js` | Arranca HTTP; cierre ordenado con `SIGTERM`. |

## 5. Herramientas

| Script (`backend/package.json`) | Comando |
|---|---|
| `dev` | `node --watch --env-file-if-exists=.env src/server.js` |
| `start` | `node src/server.js` |
| `test` | `vitest run` |
| `test:watch` | `vitest` |
| `test:coverage` | `vitest run --coverage` |
| `lint` | `eslint src tests` |
| `lint:openapi` | `redocly lint openapi/openapi.yaml` |
| `db:reset` | `supabase db reset` (desde la raíz) |

## 6. Estrategia de pruebas

| Nivel | Qué se prueba |
|---|---|
| Unitarias | `validate`, `errors`, `mask`, `env` (variables faltantes) |
| Integración | `/health`, `/health/ready`, formato de error 400/404/500, encabezados de `helmet`, `X-Request-Id` |
| Contrato | Helper `expectMatchesContract(res, operationId)` que valida respuestas contra `openapi.yaml` |
| Base local | `tests/helpers/db.js` limpia tablas entre pruebas y ofrece fábricas (`crearEstablecimiento`, `crearUsuario`…) |

## 7. Pipeline de CI (`.github/workflows/ci.yml`)

```
backend:
  1. checkout + setup-node 20 + npm ci
  2. npm run lint
  3. npm run lint:openapi
  4. supabase/setup-cli → supabase start (solo db, auth, rest)
  5. supabase db reset
  6. npm run test:coverage   (umbral 80 % → falla si no se cumple)
frontend:
  1. npm ci + npm run build
```

Protección de ramas `main` y `develop`: checks obligatorios `backend` y `frontend`, 1 aprobación.

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Equipos sin Docker no pueden correr Supabase local | Documentar instalación; las pruebas unitarias corren sin Docker; CI siempre ejecuta la suite completa |
| Desalineación entre migraciones locales y remotas | Usar `supabase db pull` para generar la línea base y verificar con `supabase migration list` |
| La reestructuración rompe el frontend existente | Mantener `/api/*` como alias temporal de `/api/v1/*` hasta que el frontend migre (se elimina en F1) |
