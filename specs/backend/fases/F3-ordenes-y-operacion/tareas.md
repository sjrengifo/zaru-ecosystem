# F3 — Órdenes y operación en tiempo real: Tareas y validación

Rama sugerida: `feature/ZARU-9-ordenes`. **Prerrequisito:** DA-02 confirmada por el PO.

## Tareas

### T3.1 — Migraciones de órdenes
**Cubre:** RF-F3-01 a RF-F3-09
1. Migración A: agregar el valor `secado` al enum.
2. Migración B: columnas, tablas `eventos` e `idempotencia`, índices y funciones `crear_orden` y `cambiar_estado_orden`.
3. Pruebas SQL directas de las funciones (transición inválida lanza error; reversión fuera de tiempo lanza error).
4. `supabase db reset` y asesores.

### T3.2 — Contrato de F3
1. Endpoints y esquemas `Orden`, `OrdenResumen`, `Dashboard` en `openapi.yaml`, con el encabezado `Idempotency-Key` requerido donde aplica.
2. Revisión del contrato del dashboard con el equipo de frontend.

### T3.3 — Máquina de estados
**Cubre:** RF-F3-05, RF-F3-07
1. Pruebas unitarias con la tabla completa de transiciones.
2. `estado.js`.

### T3.4 — Crear orden
**Cubre:** RF-F3-01 a RF-F3-04
1. Pruebas de ESC-F3-01 y ESC-F3-02, incluida la atomicidad.
2. Servicio, controlador y rutas.

### T3.5 — Cambiar y revertir estado
**Cubre:** RF-F3-05 a RF-F3-09
1. Pruebas de ESC-F3-03 a ESC-F3-06.
2. Endpoint `PATCH /ordenes/{id}/estado`.
3. Prueba de concurrencia.

### T3.6 — Idempotencia
**Cubre:** RF-F3-13
1. Pruebas unitarias del middleware y ESC-F3-08.
2. Implementación y aplicación a `POST /ordenes` y `PATCH /ordenes/{id}/estado`.

### T3.7 — Consulta de órdenes y dashboard
**Cubre:** RF-F3-10, RF-F3-11
1. Prueba de ESC-F3-07 con reloj controlado.
2. `GET /ordenes`, `GET /ordenes/{id}` y `GET /dashboard`.

### T3.8 — Tiempo real del panel
**Cubre:** RF-F3-12
1. Verificar que la publicación `supabase_realtime` y la política RLS de `ordenes` siguen vigentes.
2. Prueba de ESC-F3-09.

### T3.9 — Limpieza, aislamiento y rendimiento
1. Programar con `pg_cron` la limpieza de `idempotencia` (> 24 h).
2. Agregar los endpoints a la suite de aislamiento.
3. Ejecutar las pruebas de rendimiento y registrar resultados en el PR.

## Compuerta de validación de la fase

### Verificaciones generales
- [ ] G1 Pruebas en verde
- [ ] G2 Cobertura ≥ 80 %
- [ ] G3 Contrato OpenAPI válido y alineado
- [ ] G4 Respuestas validadas contra el contrato
- [ ] G5 `supabase db reset` sin errores
- [ ] G6 Asesores de Supabase sin alertas WARN
- [ ] G7 Suite de aislamiento con los endpoints de F3
- [ ] G8 Todos los CA con prueba enlazada en `05-trazabilidad.md`
- [ ] G9 CI en verde
- [ ] G10 Demostración al PO

### Verificaciones específicas
- [ ] Recorrido completo de una orden `recibido → en_lavado → secado → listo → entregado` con el panel abierto en otra pestaña: cada cambio aparece sin recargar.
- [ ] El historial de la orden muestra cada cambio con usuario y hora.
- [ ] Reenviar el mismo `PATCH` con la misma `Idempotency-Key` cinco veces deja un solo registro en `historial_estados`.
- [ ] Por cada cambio de estado existe exactamente un registro en `eventos` sin procesar.
- [ ] Una orden con más tiempo del estimado aparece con `demorada: true`.
- [ ] Dashboard con 100 órdenes < 500 ms; cambio de estado p95 < 300 ms.

### Cierre
- [ ] Estado de `spec.md` cambiado a `Validada`
- [ ] HU-08 a HU-11 movidas a "Listo" en Jira (backend); HU-45 y HU-54 actualizadas con su avance
- [ ] **Hito H1 (Panel operativo) alcanzado**
