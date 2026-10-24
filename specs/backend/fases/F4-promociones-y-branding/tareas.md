# F4 — Promociones y branding: Tareas y validación

Rama sugerida: `feature/ZARU-13-promociones-branding`.

## Tareas

### T4.1 — Migración y bucket
**Cubre:** RF-F4-01 a RF-F4-08
1. Migración con columnas, vista `promociones_vigentes`, nueva versión de `crear_orden` y bucket `logos` con sus políticas.
2. `supabase db reset` y asesores.

### T4.2 — Contrato de F4
1. Endpoints y esquemas `Promocion`, `Branding` en `openapi.yaml` (el logo como `multipart/form-data`).

### T4.3 — CRUD de promociones
**Cubre:** RF-F4-01 a RF-F4-03, RF-F4-06
1. Pruebas unitarias de estado de promoción y pruebas de ESC-F4-01 y ESC-F4-02.
2. Módulo `promociones`.

### T4.4 — Aplicación del descuento en órdenes
**Cubre:** RF-F4-04, RF-F4-05
1. Pruebas de ESC-F4-03 y ESC-F4-04.
2. Verificar que las pruebas de F3 siguen en verde con la nueva `crear_orden`.

### T4.5 — Branding y logo
**Cubre:** RF-F4-07 a RF-F4-09
1. Pruebas de ESC-F4-05 y ESC-F4-06, incluido el archivo falso.
2. Endpoints de branding y logo.

### T4.6 — Aislamiento
1. Agregar `promociones/{id}` a la suite.
2. Prueba: el admin de A no puede escribir en `logos/{id-de-B}/`.

## Compuerta de validación de la fase

### Verificaciones generales
- [ ] G1 Pruebas en verde
- [ ] G2 Cobertura ≥ 80 %
- [ ] G3 Contrato OpenAPI válido y alineado
- [ ] G4 Respuestas validadas contra el contrato
- [ ] G5 `supabase db reset` sin errores
- [ ] G6 Asesores de Supabase sin alertas WARN
- [ ] G7 Suite de aislamiento con los endpoints de F4
- [ ] G8 Todos los CA con prueba enlazada en `05-trazabilidad.md`
- [ ] G9 CI en verde
- [ ] G10 Demostración al PO

### Verificaciones específicas
- [ ] Una orden con un servicio en promoción muestra el descuento por servicio y el total correcto.
- [ ] Una promoción con fin "hoy" sigue vigente a las 11:59 p. m. (Bogotá) y deja de estarlo a las 12:00 a. m.
- [ ] Subir un GIF, un PNG de 3 MB y un `.png` falso devuelve `400` en los tres casos.
- [ ] El logo subido se ve en el panel y su URL es pública.

### Cierre
- [ ] Estado de `spec.md` cambiado a `Validada`
- [ ] HU-12 y HU-13 movidas a "Listo" en Jira (backend)
