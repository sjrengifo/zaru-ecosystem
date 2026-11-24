# DA-12 — Cupos mensuales por plan (HU-39 / ZARU-28)

| Campo | Valor |
|---|---|
| Estado | **Aprobada por el Product Owner el 2026-11-22** |
| Fase afectada | F7 |
| Historia | HU-39, Control de consumo de notificaciones por plan (ZARU-28) |
| Decisión abierta en | `specs/backend/06-decisiones-abiertas.md` |
| Fecha del documento | 2026-11-22 |

## Contexto

El criterio CA3 de HU-39 llegó cortado en Jira: *"…entonces el sistema mostrará por establecimie"* y no
definía los cupos de cada plan. La implementación necesitaba un valor por plan para reservar, contabilizar
y mostrar el porcentaje consumido.

## Decisión aprobada

Redacción aprobada para CA3:

> …entonces el sistema mostrará por establecimiento el plan, el cupo y el consumo del mes de SMS y
> correos, y el porcentaje usado.

Cupos aprobados, por mes calendario en `America/Bogota`:

| Plan | SMS | Correo |
|---|---:|---:|
| `basico` | 200 | 1.000 |
| `intermedio` | 600 | 3.000 |
| `empresarial` | 2.000 | 10.000 |

El canal push no tiene cupo limitante: se contabiliza, pero nunca bloquea un aviso operativo. Solo el
SMS agota el cupo y provoca el respaldo a otro canal; el correo también se contabiliza sin bloquear.

## Implementación

- Los valores aprobados son la semilla de `public.planes` en la migración
  `20261119100000_hu39_consumo_por_plan.sql` (`INSERT … ON CONFLICT DO NOTHING`).
- Ningún cupo está escrito en el backend: el superadmin los consulta con `GET /superadmin/planes` y
  los ajusta con `PUT /superadmin/planes/:nombre`, sin desplegar código.
- El reporte `GET /superadmin/consumo` y el panel del superadmin muestran plan, cupo, consumo y
  porcentaje por establecimiento, mes y canal. La sede ve su propio consumo en `GET /consumo`.
- Las pruebas de integración separan sus filas en `2026-01` y restauran los contadores; no alteran los
  cupos sembrados ni el historial real.
- No se edita la migración ya aplicada. Si en el futuro el PO cambia las cifras, se actualizan en
  `public.planes` con la API de superadministrador.
- El encabezado de `20261119100000_hu39_consumo_por_plan.sql` conserva el texto original («propuesta
  sujeta a confirmación formal») porque una migración aplicada nunca se reescribe
  ([`../base-de-datos.md`](../base-de-datos.md), regla 1). Ese texto es un artefacto histórico: este
  documento y [`../../specs/backend/06-decisiones-abiertas.md`](../../specs/backend/06-decisiones-abiertas.md)
  son la fuente autoritativa del estado aprobado.

## Verificación posterior a la aprobación

```sql
select nombre, cupo_sms_mes, cupo_correo_mes
from public.planes
order by nombre;
```

Debe devolver exactamente las tres filas y los seis valores de la tabla anterior.

**Estado de esta verificación:** se confirmó en Supabase el 2026-11-22 la existencia de `planes`,
`config_canales`, `suscripciones_push` y `notificaciones_push_admin`, con `rls_activa = true`. La consulta
de los seis valores de cupo de esta sección **no ha sido ejecutada ni adjuntada como evidencia**, por lo
que no se reporta como verificada en campo; los valores de la tabla son la decisión aprobada, no un
resultado observado.

## Registro de decisión

| Campo | Valor |
|---|---|
| Decidido por | Product Owner |
| Fecha de decisión | 2026-11-22 |
| Referencia | Aprobación comunicada al equipo de desarrollo el 2026-11-22. Adjuntar aquí el enlace al comentario de Jira o acta si el proceso formal lo exige |
| Cambio aplicado en `public.planes` | No fue necesario: la semilla ya coincide con la decisión |
