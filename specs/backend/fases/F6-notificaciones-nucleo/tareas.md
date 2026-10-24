# F6 — Motor de notificaciones (núcleo): Tareas y validación

Rama sugerida: `feature/ZARU-53-motor-notificaciones`. **Prerrequisitos:** DA-04 y DA-09 confirmadas; cuentas de prueba de Twilio y Resend; claves VAPID generadas (`npx web-push generate-vapid-keys`).

## Tareas

### T6.1 — Migración de notificaciones
**Cubre:** RF-F6-07 a RF-F6-19
1. Migración del plan, incluido el trigger de configuración por defecto y la función `tomar_notificaciones`.
2. Rellenar `config_notificaciones` de los establecimientos existentes.
3. `supabase db reset` y asesores.

### T6.2 — Contrato de F6
1. Endpoints, esquemas y webhooks en `openapi.yaml`.

### T6.3 — Proveedores
**Cubre:** RF-F6-15
1. Interfaz común y proveedor `consola` con pruebas.
2. Proveedores `webpush`, `twilio` y `resend` probados manualmente con las cuentas de prueba.
3. Variables de entorno nuevas en `env.js`.

### T6.4 — Preferencias y suscripción push
**Cubre:** RF-F6-07 a RF-F6-11
1. Pruebas de ESC-F6-05 y ESC-F6-06.
2. Endpoints de preferencias, verificación de celular (reutiliza el OTP de F5) y suscripción push.

### T6.5 — Configuración de estados por sede
**Cubre:** RF-F6-12 a RF-F6-14
1. Pruebas de ESC-F6-07 y ESC-F6-08.
2. Endpoints de configuración.

### T6.6 — Despachador
**Cubre:** RF-F6-01, RF-F6-04 a RF-F6-06
1. Pruebas unitarias y de ESC-F6-03 y ESC-F6-04.
2. `despachador.js` y plantillas por defecto.

### T6.7 — Enviador, reintentos y canal alterno
**Cubre:** RF-F6-02, RF-F6-03, RF-F6-15 a RF-F6-19
1. Pruebas de ESC-F6-01, ESC-F6-02, ESC-F6-09 a ESC-F6-11 y la de concurrencia.
2. `enviador.js`, worker en `server.js` (`WORKER_ENABLED`) y webhooks de entrega.
3. Alertas de fallidas en `GET /dashboard`.

### T6.8 — Bitácora
**Cubre:** RF-F6-20, RF-F6-21, RNF-F6-02
1. Prueba de ESC-F6-12 y de rendimiento con 100 000 registros.
2. Endpoint `GET /notificaciones`.

### T6.9 — Centro de notificaciones del cliente
**Cubre:** RF-F6-22, RF-F6-23
1. Prueba de ESC-F6-13.
2. Endpoints del centro de notificaciones.

### T6.10 — Baja de comunicaciones comerciales
**Cubre:** RF-F6-24, RF-F6-25
1. Prueba de ESC-F6-14.
2. Generador de enlaces de baja y página de confirmación.

### T6.11 — Aislamiento y no regresión
1. Agregar los endpoints a la suite de aislamiento.
2. Medir el p95 de `PATCH /ordenes/{id}/estado` con el worker activo (RNF-F6-01).

## Compuerta de validación de la fase

### Verificaciones generales
- [ ] G1 Pruebas en verde
- [ ] G2 Cobertura ≥ 80 %
- [ ] G3 Contrato OpenAPI válido y alineado
- [ ] G4 Respuestas validadas contra el contrato
- [ ] G5 `supabase db reset` sin errores
- [ ] G6 Asesores de Supabase sin alertas WARN
- [ ] G7 Suite de aislamiento con los endpoints de F6
- [ ] G8 Todos los CA con prueba enlazada en `05-trazabilidad.md`
- [ ] G9 CI en verde
- [ ] G10 Demostración al PO

### Verificaciones específicas
- [ ] Prueba real de punta a punta: un celular de un integrante recibe push, SMS y correo al cambiar el estado de una orden, en menos de 30 s.
- [ ] Revertir un cambio a los 10 s no genera mensaje.
- [ ] Con el proveedor push forzado a fallar, se observan los reintentos a 1, 2 y 4 min y el SMS alterno.
- [ ] Con todos los proveedores fallando, la alerta aparece en el dashboard.
- [ ] El enlace "dejar de recibir" de un correo comercial revoca la autorización y queda la evidencia.
- [ ] La bitácora con 100 000 registros responde filtrada en menos de 3 s y enmascara datos.
- [ ] El p95 del cambio de estado no empeora más de 10 % con el worker activo.

### Cierre
- [ ] Estado de `spec.md` cambiado a `Validada`
- [ ] HU-14, HU-15, HU-17, HU-19, HU-20, HU-24 y HU-48 movidas a "Listo" en Jira (backend); HU-16 completada
