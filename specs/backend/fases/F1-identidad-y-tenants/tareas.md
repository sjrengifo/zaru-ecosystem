# F1 — Identidad, tenants y autorización: Tareas y validación

Rama sugerida: `feature/ZARU-51-identidad-tenants`.

## Tareas

### T1.1 — Migración de identidad
**Cubre:** RF-F1-02, RF-F1-09, RF-F1-10
1. `supabase migration new identidad_y_tenants` con las tablas y columnas del plan.
2. Rellenar `slug` del establecimiento demo y crear los planes en `seed.sql`.
3. Agregar al seed un administrador de plataforma, un admin y un operario de prueba para el establecimiento demo, y un segundo establecimiento con su admin (para pruebas de aislamiento).
4. `supabase db reset` y revisar asesores.

**Hecho cuando:** la migración aplica limpia y los asesores no muestran alertas.

### T1.2 — Contrato de F1
**Cubre:** todos los RF
1. Agregar a `openapi.yaml` los endpoints y esquemas `Usuario`, `Establecimiento`, `RegistroAuditoria`.
2. `npm run lint:openapi`.

**Hecho cuando:** el contrato está validado y revisado por el equipo antes de implementar.

### T1.3 — Middleware de autenticación y contexto
**Cubre:** RF-F1-01, RF-F1-02, RF-F1-03
1. Escribir primero las pruebas de ESC-F1-01, ESC-F1-02 y ESC-F1-06.
2. Implementar `auth.js` con caché y `req.ctx`.
3. Implementar `GET /me`.

**Hecho cuando:** las tres pruebas pasan.

### T1.4 — Autorización por rol y auditoría
**Cubre:** RF-F1-05, RF-F1-10
1. Prueba de ESC-F1-03.
2. Implementar `requireRol` y `auditar`, y el trigger que impide modificar la auditoría (prueba: un `update` sobre `auditoria` falla).
3. Aplicar `requireRol('admin')` a las rutas existentes de configuración (`servicios` escritura, `establecimiento/branding`).

**Hecho cuando:** ESC-F1-03 pasa y la auditoría registra accesos permitidos y denegados.

### T1.5 — Aislamiento multi-tenant
**Cubre:** RF-F1-06
1. Crear `shared/tenant.js` y refactorizar los repositorios existentes para usarlo.
2. Crear la suite `tests/integration/tenant-isolation/` con la tabla de endpoints y el fixture A/B.
3. Prueba de ESC-F1-04.

**Hecho cuando:** la suite de aislamiento pasa para todos los endpoints existentes.

### T1.6 — Gestión de operarios
**Cubre:** RF-F1-07, RF-F1-08
1. Pruebas de ESC-F1-05 y ESC-F1-08.
2. Módulo `usuarios` con compensación ante fallas.
3. Prueba: si falla el insert del perfil, no queda usuario huérfano en `auth.users`.

**Hecho cuando:** las pruebas pasan y la invitación se ve en el buzón local de Supabase (Inbucket en `localhost:54324`).

### T1.7 — Alta de establecimientos (plataforma)
**Cubre:** RF-F1-09
1. Prueba de ESC-F1-07.
2. Módulo `plataforma` con validación de slug y compensación.

**Hecho cuando:** un establecimiento creado por API queda operativo y aislado.

### T1.8 — Consulta de auditoría
**Cubre:** RF-F1-11
1. Endpoint `GET /auditoria` con filtros y paginación.
2. Prueba: el admin de A no ve registros de B.

### T1.9 — Endurecimiento
**Cubre:** RNF-F1-02, RNF-F1-03, RNF-F1-05
1. Middleware de HTTPS obligatorio en `NODE_ENV=production` (detrás de proxy: `app.set('trust proxy', 1)`).
2. Agregar gitleaks al workflow de CI.
3. Rate limit en rutas privadas.
4. Eliminar el alias `/api` sin versión (coordinar con el frontend).

## Compuerta de validación de la fase

### Verificaciones generales
- [ ] G1 Pruebas en verde
- [ ] G2 Cobertura ≥ 80 %
- [ ] G3 Contrato OpenAPI válido y alineado
- [ ] G4 Respuestas validadas contra el contrato
- [ ] G5 `supabase db reset` sin errores
- [ ] G6 Asesores de Supabase sin alertas WARN
- [ ] G7 Suite de aislamiento creada y en verde para todos los endpoints
- [ ] G8 Todos los CA con prueba enlazada en `05-trazabilidad.md`
- [ ] G9 CI en verde (incluye gitleaks)
- [ ] G10 Demostración al PO

### Verificaciones específicas
- [ ] Con el token de un operario, `POST /api/v1/servicios` devuelve `403` y aparece en `GET /auditoria` como `denegado`.
- [ ] Con el token del admin de A, `GET /api/v1/clientes/{id-de-B}` devuelve `404`.
- [ ] Un operario desactivado recibe `403` sin necesidad de cerrar sesión.
- [ ] Un establecimiento creado desde `/plataforma/establecimientos` funciona sin modificar código.
- [ ] `select` en `information_schema.columns` no encuentra columnas de contraseña en `public` (HU-46 CA4).
- [ ] Un `update` o `delete` sobre `auditoria` es rechazado por la base de datos.

### Cierre
- [ ] Estado de `spec.md` cambiado a `Validada`
- [ ] HU-01, HU-02, HU-43 y HU-46 movidas a "Listo" en Jira (backend)
