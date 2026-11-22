# DA-12 — Cupos mensuales por plan (HU-39 / ZARU-28)

| Campo | Valor |
|---|---|
| Estado | **Abierta — pendiente de aprobación formal del Product Owner** |
| Fase afectada | F7 |
| Historia | HU-39, Control de consumo de notificaciones por plan (ZARU-28) |
| Decisión abierta en | `specs/backend/06-decisiones-abiertas.md` |
| Fecha del documento | 2026-11-22 |

## Contexto

El criterio CA3 de HU-39 llegó cortado en Jira: *"…entonces el sistema mostrará por establecimie"* y no
definía los cupos de cada plan. La implementación necesita un valor por plan para reservar, contabilizar
y mostrar el porcentaje consumido; esos valores no pueden inventarse como una decisión aprobada.

## Propuesta (NO aprobada)

Redacción propuesta para CA3:

> …entonces el sistema mostrará por establecimiento el plan, el cupo y el consumo del mes de SMS y
> correos, y el porcentaje usado.

Cupos iniciales propuestos, por mes calendario en `America/Bogota`:

| Plan | SMS | Correo |
|---|---:|---:|
| `basico` | 200 | 1.000 |
| `intermedio` | 600 | 3.000 |
| `empresarial` | 2.000 | 10.000 |

El canal push no tiene cupo limitante: se contabiliza, pero nunca bloquea un aviso operativo. Solo el
SMS agota el cupo y provoca el respaldo a otro canal; el correo también se contabiliza sin bloquear.

## Implementación mientras se decide

- Los valores propuestos son únicamente la semilla de `public.planes` en la migración
  `20261119100000_hu39_consumo_por_plan.sql` (`INSERT … ON CONFLICT DO NOTHING`).
- Ningún cupo está escrito en el backend: el superadmin los consulta con `GET /superadmin/planes` y
  los ajusta con `PUT /superadmin/planes/:nombre`, sin desplegar código.
- El reporte `GET /superadmin/consumo` y el panel del superadmin muestran plan, cupo, consumo y
  porcentaje por establecimiento, mes y canal. La sede ve su propio consumo en `GET /consumo`.
- Las pruebas de integración separan sus filas en `2026-01` y restauran los contadores; no alteran los
  cupos sembrados ni el historial real.

## Condición para cerrar la decisión

El PO debe responder por escrito en Jira, en esta decisión o en el acta del refinamiento:

1. Si acepta la redacción propuesta de CA3.
2. Si acepta, cambia o elimina cada uno de los seis números de la tabla.
3. Si los cupos aplican desde el mes de alta de la sede o desde un corte acordado.
4. Si el plan `empresarial` debe tener cupo ilimitado en correo (la propuesta actual es 10.000).

Hasta entonces **no se debe marcar DA-12 como confirmada ni HU-39 como validada en producción**. Si el
PO cambia las cifras, se actualizan en `public.planes` con la API de superadministrador; no se edita
la migración ya aplicada.

## Registro de decisión

| Campo | Valor |
|---|---|
| Decidido por | Pendiente (Product Owner) |
| Fecha de decisión | Pendiente |
| Referencia del acta o comentario de Jira | Pendiente |
| Cambio aplicado en `public.planes` | Pendiente (si aplica) |
