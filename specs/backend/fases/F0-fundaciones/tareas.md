# F0 — Fundaciones técnicas: Tareas y validación

Rama sugerida: `feature/ZARU-49-fundaciones-backend`.

## Tareas

### T0.0 — Spike de arquitectura (HU-58)
**Cubre:** RF-F0-09
1. Partir de `02-arquitectura.md` (ADR-01 a ADR-08) y escribir `docs/arquitectura/spike-hu58.md` con la decisión y las alternativas descartadas.
2. Prototipo en Supabase: crear un segundo establecimiento con su usuario, comprobar que cada uno solo ve sus filas (RLS) y que un cambio en `ordenes` llega por Realtime solo al establecimiento correcto.
3. Tabla de costos: Supabase, Render y Vercel (planes gratuitos y siguiente nivel) para 81 establecimientos frente a los $800.000 mensuales del caso de negocio.

**Hecho cuando:** el documento está en el repositorio y el prototipo se demuestra al equipo.

**Estado:** terminada el 28 de octubre de 2026. Ver `docs/arquitectura/spike-hu58.md` (19 de 19 pruebas aprobadas).

### T0.1 — Supabase CLI y migraciones versionadas
**Cubre:** RF-F0-07
1. Instalar Docker y Supabase CLI; en la raíz ejecutar `supabase init`.
2. Vincular el proyecto: `supabase link --project-ref djutvsulfduzuylvaten`.
3. Traer la línea base: `supabase db pull` y verificar que genera las migraciones equivalentes a las tres aplicadas.
4. Mover `database/seed.sql` a `supabase/seed.sql` (sin el bloque comentado del administrador; reemplazarlo por un usuario de prueba creado en `auth.users` solo para local).
5. Ejecutar `supabase start` y `supabase db reset`.

**Hecho cuando:** `supabase db reset` deja una base local idéntica a la remota y `supabase migration list` muestra ambas columnas alineadas.

### T0.2 — Configuración validada y logger
**Cubre:** RNF-F0-01, RNF-F0-02
1. Instalar `zod pino pino-http`.
2. Crear `config/env.js` y `config/logger.js` según el plan.
3. Prueba unitaria: sin `SUPABASE_URL`, la carga de `env.js` lanza un error con el nombre de la variable.

**Hecho cuando:** el servidor se niega a arrancar sin variables obligatorias y los logs salen en JSON con datos sensibles redactados.

### T0.3 — Errores y validación estándar
**Cubre:** RF-F0-03, RF-F0-04, RNF-F0-03
1. Crear `shared/errors.js`, `shared/validate.js`, `middlewares/requestId.js` y el nuevo `errorHandler.js`.
2. Pruebas unitarias del mapeo `ZodError → VALIDACION` y `AppError → status`.

**Hecho cuando:** ESC-F0-02 y ESC-F0-03 pasan como pruebas de integración.

### T0.4 — Reestructuración en módulos y versionado
**Cubre:** RF-F0-01
1. Crear `src/modules/{clientes,servicios,establecimiento}` con `routes/controller/service/repository/schemas`.
2. Mover la lógica existente: el controlador solo traduce HTTP; las consultas a Supabase pasan al repositorio.
3. Montar todo bajo `/api/v1` y dejar `/api` como alias temporal.
4. Agregar `helmet` y `express-rate-limit` (límite global básico).
5. Renombrar `index.js` a `server.js` y actualizar `render.yaml` y `package.json`.

**Hecho cuando:** los endpoints existentes responden igual bajo `/api/v1` y el frontend sigue funcionando.

### T0.5 — Contrato OpenAPI
**Cubre:** RF-F0-02
1. Crear `backend/openapi/openapi.yaml` (OpenAPI 3.1) con componentes comunes y los endpoints existentes.
2. Servirlo con `swagger-ui-express` en `/api/docs` y como JSON en `/api/openapi.json`.
3. Agregar `@redocly/cli` y el script `lint:openapi`.

**Hecho cuando:** ESC-F0-01 pasa y `npm run lint:openapi` no reporta errores.

### T0.6 — Health checks
**Cubre:** RF-F0-06
1. Implementar `/health` y `/health/ready` (consulta `select 1` vía RPC o una tabla ligera).
2. Actualizar `healthCheckPath` en `render.yaml` a `/api/v1/health`.

**Hecho cuando:** ESC-F0-04 pasa simulando la base caída con un repositorio falso.

### T0.7 — Infraestructura de pruebas
**Cubre:** Art. 3 de la constitución
1. Instalar `vitest @vitest/coverage-v8 supertest`.
2. Crear `tests/helpers/db.js` (limpieza y fábricas), `tests/helpers/auth.js` (obtiene un JWT real de un usuario de prueba en Supabase local) y `tests/helpers/contract.js` (validación contra OpenAPI).
3. Configurar umbral de cobertura del 80 % en `vitest.config.js`.
4. Migrar las pruebas a la nueva estructura y escribir las de F0.

**Hecho cuando:** `npm run test:coverage` corre localmente contra Supabase local y supera el umbral.

### T0.8 — Pipeline de CI y protección de ramas
**Cubre:** RF-F0-08
1. Ampliar `.github/workflows/ci.yml` según el plan.
2. Configurar protección de ramas en GitHub para `main` y `develop`.
3. Abrir un PR de prueba con una prueba fallando para comprobar el bloqueo y luego cerrarlo.

**Hecho cuando:** ESC-F0-06 se verifica en GitHub.

### T0.9 — Documentación
1. Actualizar el README raíz: comandos nuevos, Supabase local y ruta `/api/docs`.
2. Actualizar `05-trazabilidad.md` con las pruebas de F0.

## Compuerta de validación de la fase

### Verificaciones generales
- [ ] G1 Pruebas en verde
- [ ] G2 Cobertura ≥ 80 %
- [ ] G3 Contrato OpenAPI válido y alineado
- [ ] G4 Respuestas validadas contra el contrato
- [ ] G5 `supabase db reset` sin errores
- [ ] G6 Asesores de Supabase sin alertas WARN
- [ ] G7 No aplica todavía (se crea la suite vacía de aislamiento)
- [ ] G8 Todos los CA con prueba enlazada en `05-trazabilidad.md`
- [ ] G9 CI en verde
- [ ] G10 Demostración al PO

### Verificaciones específicas
- [ ] `curl -i localhost:4000/api/v1/health` devuelve `200` y encabezado `X-Request-Id`.
- [ ] `curl -i -X POST localhost:4000/api/v1/clientes -H 'Content-Type: application/json' -d '{}'` devuelve `401` (sin token) con el formato de error estándar.
- [ ] Arrancar sin `SUPABASE_URL` falla con un mensaje explícito.
- [ ] Un log de error contiene `requestId`, `ruta` y traza, y no contiene el encabezado `authorization`.
- [ ] El frontend actual sigue funcionando contra el backend reestructurado.
- [ ] Un PR con una prueba fallando queda bloqueado.

### Cierre
- [ ] Estado de `spec.md` cambiado a `Validada`
- [ ] HUs parciales actualizadas en Jira con el avance
