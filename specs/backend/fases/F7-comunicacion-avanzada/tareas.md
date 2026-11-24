# F7 — Comunicación avanzada: Tareas y validación

Rama sugerida: `feature/ZARU-21-comunicacion-avanzada` (o una rama por HU). **Prerrequisitos:** DA-12 confirmada; cupos de los planes definidos por el PO.

## Tareas

### T7.1 — Migración
1. Migración del plan, incluido el bucket `evidencias` y los cupos de los planes.
2. Seed de plantillas por defecto de la plataforma (por evento y canal).
3. `supabase db reset` y asesores.

### T7.2 — Contrato de F7
1. Endpoints y esquemas en `openapi.yaml`.

### T7.3 — Plantillas
**Cubre:** RF-F7-01 a RF-F7-05
1. Pruebas unitarias del parser y de segmentos; pruebas de ESC-F7-01 a ESC-F7-03.
2. Módulo de plantillas; el enviador de F6 pasa a usar la plantilla de la sede si existe.

### T7.4 — Campañas
**Cubre:** RF-F7-06 a RF-F7-10
1. Pruebas de ESC-F7-04 y ESC-F7-05 y de rendimiento.
2. Función de segmento, endpoints y paso del worker.

### T7.5 — Recordatorios
**Cubre:** RF-F7-11 a RF-F7-14
1. Pruebas de ESC-F7-06 y ESC-F7-07, y de la desactivación.
2. Programador en el despachador y paso del worker.

### T7.6 — Novedades del operario
**Cubre:** RF-F7-15 a RF-F7-18
1. Pruebas de ESC-F7-08 y ESC-F7-09.
2. Endpoints de novedades y fotos.

### T7.7 — Consumo por plan
**Cubre:** RF-F7-19 a RF-F7-23
1. Pruebas de ESC-F7-10 y ESC-F7-11.
2. `consumo.js` integrado en el enviador; endpoints de consumo y planes.

**Estado:** implementado con la migración `20261119100000_hu39_consumo_por_plan.sql`, `shared/consumo.js`, los hooks de reserva/confirmación/liberación en `shared/notificaciones.js` y el panel de la F7 en el Superadmin. Pruebas: `tests/unit/consumo.test.js`, `tests/integration/hu39-consumo.test.js` y `frontend/tests/consumo.test.jsx`. La suite de integración exige que la migración esté aplicada en el proyecto Supabase de pruebas; mientras no lo esté, falla con un mensaje explícito en lugar de omitirse. Con la migración ya aplicada, `npx vitest run tests/integration/hu39-consumo.test.js` pasa 4/4 (CA1, CA2 y CA3).

**Extensión de preferencias y prueba real (HU-31/HU-39):** migración `20261119110000_hu31_preferencias_canales.sql` (aplicada en Supabase, integración 4/4), `shared/preferenciasCanales.js`, `shared/pruebaCanales.js`, `controllers/canales.controller.js`, `enviarPrueba` en `notificaciones.controller.js`, las rutas `GET|PUT /configuracion/canales` y `POST /notificaciones/prueba`, y los paneles `ConfiguracionCanales.jsx` (sede) y el ancla del reporte en `Superadmin.jsx`. Pruebas: `tests/unit/canales.test.js` (5), `tests/unit/prueba-canales.test.js` (6), `tests/integration/hu31-canales.test.js` (4), `frontend/tests/notificaciones.test.jsx` (10) y `frontend/tests/superadmin.test.jsx`. La prueba real usa el correo/celular del administrador desde Auth; los fallos de proveedor se informan por canal con su consumo y nunca se ocultan. Push no se puede verificar de extremo a extremo hasta HU-40.

### T7.8 — Aislamiento y prioridad
1. Agregar los endpoints a la suite de aislamiento.
2. Prueba: con una campaña de 1 000 mensajes en cola, una notificación operativa nueva se envía antes que los comerciales pendientes.

## Compuerta de validación de la fase

### Verificaciones generales
- [ ] G1 Pruebas en verde
- [ ] G2 Cobertura ≥ 80 %
- [ ] G3 Contrato OpenAPI válido y alineado
- [ ] G4 Respuestas validadas contra el contrato
- [ ] G5 `supabase db reset` sin errores
- [ ] G6 Asesores de Supabase sin alertas WARN
- [ ] G7 Suite de aislamiento con los endpoints de F7
- [ ] G8 Todos los CA con prueba enlazada en `05-trazabilidad.md`
- [ ] G9 CI en verde
- [ ] G10 Demostración al PO

### Verificaciones específicas
- [ ] Una plantilla personalizada con la marca de la sede llega al celular de prueba.
- [ ] Una campaña programada a las 10:00 p. m. queda para las 7:00 a. m.
- [ ] La estimación de una campaña excluye a quienes no autorizaron y a quienes ya recibieron 2 en la semana.
- [ ] Una novedad de daño con 3 fotos aparece en el historial de la orden; las fotos solo abren con URL firmada.
- [ ] Una demora de 15 minutos se refleja en el seguimiento del cliente.
- [ ] Con el cupo de SMS agotado, un aviso de `listo` llega por correo.

### Cierre
- [ ] Estado de `spec.md` cambiado a `Validada`
- [ ] HU-32, HU-35, HU-36, HU-37 y HU-39 movidas a "Listo" en Jira (backend)
- [ ] **Hito H3 (Comunicación) alcanzado**
