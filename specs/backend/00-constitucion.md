# Constitución del backend

Principios no negociables. Toda especificación, plan, revisión de código y compuerta de validación se evalúa contra este documento. Modificarlo requiere acuerdo del equipo y un ADR en `02-arquitectura.md`.

---

## Art. 1 — Aislamiento multi-tenant

1. Toda tabla de negocio tiene `establecimiento_id NOT NULL` con llave foránea a `establecimientos`.
2. El establecimiento se obtiene **siempre** de la sesión autenticada (`req.ctx.establecimientoId`), nunca del cuerpo, la URL ni los parámetros de la petición.
3. Toda consulta del repositorio filtra por `establecimiento_id`. Un repositorio que no recibe el tenant no compila la consulta.
4. Un recurso de otro establecimiento responde `404 Not Found`, nunca `403`, para no revelar su existencia (HU-41 CA2).
5. RLS permanece habilitado en todas las tablas del esquema `public`, aunque el backend use `service_role`.

## Art. 2 — Contrato primero

1. Ningún endpoint se implementa sin estar definido en `backend/openapi/openapi.yaml`.
2. La API se versiona en la ruta (`/api/v1`). Un cambio incompatible exige una nueva versión; la anterior se mantiene mientras existan clientes que la usen (HU-43 CA3).
3. Las respuestas de error siguen un único formato (ver `04-contrato-api.md`).

## Art. 3 — Pruebas como especificación

1. Cada criterio de aceptación de una HU tiene al menos una prueba automatizada que lo referencia por su identificador (`HU-10 CA1`).
2. Las pruebas de integración corren contra una base de datos real (Supabase local), no contra mocks de Supabase.
3. Ningún PR se integra con pruebas fallando ni con cobertura inferior al 80 % en `src/modules/` y `src/shared/`.

## Art. 4 — Base de datos versionada

1. Todo cambio de esquema es una migración en `supabase/migrations/`. No se modifican tablas desde el panel de Supabase.
2. Las migraciones son inmutables una vez integradas en `develop`; las correcciones se hacen con una migración nueva.
3. Después de cada migración, los asesores de seguridad y rendimiento de Supabase deben quedar sin alertas de nivel `WARN` o superior.

## Art. 5 — Seguridad y datos personales

1. Los secretos viven en variables de entorno validadas al arranque; nunca en el código ni en el repositorio.
2. La clave `service_role` solo existe en el backend.
3. Los datos personales (nombre, teléfono, correo, placa) no se escriben en logs. Teléfonos y correos se enmascaran en respuestas de consulta masiva (HU-34 CA3).
4. Ningún dato personal se almacena sin autorización registrada con fecha, hora y versión de la política (Ley 1581 de 2012).
5. Toda acción sobre información sensible queda en la tabla de auditoría (HU-53 CA1).
6. Toda entrada se valida con un esquema `zod` antes de llegar al servicio.

## Art. 6 — Capas con responsabilidades únicas

`routes → controller → service → repository`. Los controladores no contienen lógica de negocio; los servicios no conocen Express; solo los repositorios conocen Supabase. Esta separación permite probar las reglas de negocio de forma aislada.

## Art. 7 — Operaciones confiables

1. Las operaciones que el cliente puede reintentar (cambio de estado, creación de orden, envío de notificación) son **idempotentes** mediante el encabezado `Idempotency-Key` (HU-54 CA1).
2. Los efectos secundarios lentos o que pueden fallar (envío de notificaciones) se desacoplan con una cola persistente (patrón *outbox*); nunca bloquean la petición del operario (HU-46 CA2).
3. Cada petición tiene un `requestId` que aparece en logs y en las respuestas de error.

## Art. 8 — Simplicidad

Se elige la solución más simple que cumpla la especificación con los servicios gratuitos disponibles (Supabase, Render, Vercel). Cualquier infraestructura adicional (colas externas, Redis, Kubernetes) requiere un ADR que demuestre que un requisito no se puede cumplir sin ella.

## Art. 9 — Definición de Hecho (DoD) de una tarea

- [ ] Contrato OpenAPI actualizado y validado con `npm run lint:openapi`.
- [ ] Pruebas que cubren los criterios de aceptación, en verde.
- [ ] Migraciones aplicadas localmente y `database/schema.sql` regenerado.
- [ ] `05-trazabilidad.md` actualizado.
- [ ] Revisado y aprobado en un Pull Request por al menos un integrante.
