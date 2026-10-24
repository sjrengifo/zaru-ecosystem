# Arquitectura del backend

## 1. Vista de componentes

```
                 ┌──────────────────────────── Backend (Node.js + Express) ────────────────────────────┐
 Panel web ────▶ │  /api/v1/*        middlewares: requestId · logger · helmet · cors · rateLimit       │
 (JWT Supabase)  │                   auth (admin/operario/plataforma) · idempotencia · auditoría       │
                 │                                                                                     │
 Web móvil ────▶ │  /api/v1/publico/* auth cliente final (token de seguimiento / sesión OTP)           │
 cliente final   │                                                                                     │
                 │  modules/<recurso>: routes → controller → service → repository                      │
                 │                                                     │                               │
                 │  workers/notificaciones ── providers/{push, sms, correo, consola}                   │
                 └───────────────────────────────────────────────┬─────────────────────────────────────┘
                                                                 │ service_role
                                                ┌────────────────▼────────────────┐
                                                │ Supabase: PostgreSQL · Auth ·   │
                                                │ Realtime · Storage              │
                                                └─────────────────────────────────┘
```

## 2. Estructura objetivo del código

```
backend/
├── openapi/
│   └── openapi.yaml              Contrato de la API (fuente de verdad)
├── src/
│   ├── server.js                 Arranque HTTP y del worker
│   ├── app.js                    Composición de Express
│   ├── config/
│   │   ├── env.js                Variables de entorno validadas con zod
│   │   ├── supabase.js           Cliente service_role
│   │   └── logger.js             pino
│   ├── shared/
│   │   ├── errors.js             AppError y catálogo de códigos
│   │   ├── validate.js           Middleware de validación zod (body, query, params)
│   │   ├── pagination.js
│   │   ├── mask.js               Enmascarado de datos personales
│   │   └── clock.js              Reloj inyectable (pruebas de tiempo)
│   ├── middlewares/
│   │   ├── requestId.js
│   │   ├── auth.js               Sesión de usuarios del panel
│   │   ├── authCliente.js        Sesión del cliente final
│   │   ├── roles.js              requireRol('admin')
│   │   ├── idempotencia.js
│   │   ├── auditoria.js
│   │   └── errorHandler.js
│   ├── modules/
│   │   └── <recurso>/
│   │       ├── <recurso>.routes.js
│   │       ├── <recurso>.controller.js
│   │       ├── <recurso>.service.js
│   │       ├── <recurso>.repository.js
│   │       └── <recurso>.schemas.js
│   ├── workers/
│   │   └── notificaciones.worker.js
│   └── providers/
│       └── notificaciones/       push.js · sms.js · correo.js · consola.js
└── tests/
    ├── unit/                     Servicios con repositorios falsos
    ├── integration/              Supertest contra Supabase local
    │   └── tenant-isolation/     Suite transversal de aislamiento
    └── helpers/                  Fábricas de datos, login de prueba, validador OpenAPI

supabase/
├── config.toml
├── migrations/                   Migraciones versionadas (fuente de verdad del esquema)
└── seed.sql
```

## 3. Stack

| Necesidad | Elección |
|---|---|
| Runtime / framework | Node.js 20 · Express 4 (ESM) |
| Validación | `zod` |
| Documentación | `openapi.yaml` (OpenAPI 3.1) · `swagger-ui-express` en `/api/docs` · `@redocly/cli` para lint |
| Logs | `pino` + `pino-http` |
| Seguridad HTTP | `helmet`, `cors`, `express-rate-limit` |
| Tokens del cliente final | `jose` (JWT firmado por el backend) |
| Pruebas | `vitest`, `supertest`, validación de respuestas contra OpenAPI |
| Base de datos local | Supabase CLI (`supabase start`, requiere Docker) |
| Notificaciones | `web-push` (push), Twilio (SMS), Resend (correo), proveedor `consola` para desarrollo |

## 4. Convenciones

- **Idioma:** dominio, rutas, tablas y mensajes en español; nombres técnicos de librerías en inglés.
- **Nombres:** archivos `kebab` por recurso (`ordenes.service.js`), funciones `camelCase`, tablas y columnas `snake_case`.
- **Contexto de petición:** el middleware de autenticación deja `req.ctx = { usuarioId, rol, establecimientoId, requestId }`. Los servicios reciben `ctx` como primer argumento.
- **Errores:** los servicios lanzan `AppError(codigo, mensaje, detalles?)`; el `errorHandler` traduce el código a estado HTTP.
- **Tiempo:** toda lógica dependiente de la hora usa `clock.now()` para poder probarla.
- **Zona horaria:** se almacena en UTC (`timestamptz`); las reglas de negocio con horario (HU-21 CA4) usan `America/Bogota`.

---

## 5. Registro de decisiones de arquitectura (ADR)

### ADR-01 — Backend como única puerta de escritura
**Decisión:** Todas las escrituras pasan por la API con `service_role`; el frontend solo lee directamente de Supabase para Auth y Realtime.
**Motivo:** Centraliza reglas de negocio, auditoría e idempotencia. RLS se mantiene como segunda barrera.

### ADR-02 — Migraciones con Supabase CLI
**Decisión:** Se adopta `supabase/migrations/` como fuente de verdad del esquema (HU-44 CA2). `database/schema.sql` pasa a generarse con `supabase db dump` y se conserva solo como referencia legible.
**Motivo:** Migraciones reproducibles en local, CI y producción.

### ADR-03 — Cola de notificaciones en PostgreSQL (patrón outbox)
**Decisión:** Las notificaciones se insertan en la tabla `notificaciones` dentro de la misma operación que el cambio de estado; un worker las procesa en orden de creación con `FOR UPDATE SKIP LOCKED` (HU-48 CA3).
**Motivo:** Garantiza que no se pierdan eventos sin agregar infraestructura (Art. 8). Se reevalúa si el volumen supera lo que un worker puede procesar.

### ADR-04 — Tiempo real del cliente final por Server-Sent Events
**Decisión:** El panel administrativo usa Supabase Realtime con RLS (ya implementado). El cliente final, que no tiene usuario de Supabase, recibe los cambios por un endpoint SSE del backend (`/publico/seguimiento/{codigo}/eventos`), que solo emite eventos de su orden (HU-47 CA3) y permite reconexión con `Last-Event-ID` (HU-47 CA2).
**Alternativa descartada:** canales públicos de Supabase Realtime, porque no permiten restringir el acceso sin un usuario de Supabase.

### ADR-05 — Acceso del cliente final sin contraseña
**Decisión:** Dos niveles de acceso:
1. **Seguimiento:** con el código de la orden (enlace o QR) o con la placa dentro del enlace de la sede. Solo expone datos operativos no personales (estado, servicios, total, branding).
2. **Sesión de cliente:** código OTP de 6 dígitos enviado al celular registrado. Habilita historial, preferencias, centro de notificaciones y derechos del titular. El backend emite un JWT de corta duración con rol `cliente`.
**Motivo:** HU-29 y HU-34 piden acceso por placa sin fricción, pero el historial y los datos personales requieren verificar la identidad del titular (Ley 1581). Ver decisión abierta DA-03.

### ADR-06 — Ventana de gracia antes de enviar notificaciones de estado
**Decisión:** Las notificaciones de cambio de estado se programan con 20 segundos de retraso. Si el estado se revierte en ese lapso, se cancelan; si ya se enviaron, se envía una corrección (HU-14 CA3). Se mantiene el límite de 30 segundos de HU-14 CA1.

### ADR-07 — Plataforma de despliegue
**Decisión:** Durante el proyecto académico el backend se despliega en Render y la base en Supabase (planes gratuitos). HU-49 (balanceo de carga y autoescalado en AWS o Google Cloud) se aborda en F8 documentando la arquitectura objetivo y validándola con pruebas de carga; su implementación real depende de presupuesto. Ver decisión abierta DA-06.

### ADR-08 — Worker dentro del proceso de la API
**Decisión:** El worker de notificaciones corre en el mismo proceso que la API, activado por `WORKER_ENABLED=true`.
**Consecuencia:** En el plan gratuito de Render el servicio se suspende sin tráfico; la cola se procesa al reactivarse. En F8 se evalúa separar el worker o invocarlo con `pg_cron`.
