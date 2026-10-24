# F5 — API del cliente final: Tareas y validación

Rama sugerida: `feature/ZARU-34-api-cliente-final`. **Prerrequisitos:** DA-01 y DA-03 confirmadas; HUs duplicadas cerradas en Jira.

## Tareas

### T5.1 — Migración y configuración
**Cubre:** RF-F5-11, RF-F5-12, RF-F5-04
1. Migración `otp_codigos` y vista `seguimiento_publico`.
2. Agregar `CLIENTE_JWT_SECRET` y `OTP_PEPPER` a `env.js` y `.env.example`.

### T5.2 — Contrato de F5
1. Endpoints y esquemas `SedePublica`, `Seguimiento`, `PromocionPublica`, `DetalleServicio`, `MisDatos`, y el `securityScheme` `bearerCliente`.
2. Documentar el formato de los eventos SSE en la descripción del endpoint.

### T5.3 — Sede y búsqueda pública
**Cubre:** RF-F5-01 a RF-F5-03, RNF-F5-01
1. Pruebas de ESC-F5-01 y ESC-F5-02.
2. Módulo `publico` con rate limit.

### T5.4 — Seguimiento
**Cubre:** RF-F5-04, RF-F5-08, RNF-F5-04
1. Prueba de ESC-F5-03 y prueba de privacidad.
2. Endpoint de seguimiento sobre la vista.

### T5.5 — Tiempo real por SSE
**Cubre:** RF-F5-05 a RF-F5-07, RNF-F5-05
1. Pruebas de ESC-F5-04 a ESC-F5-06.
2. `bus.js` y `sse.js`; arrancar el bus en `server.js`.
3. Cerrar conexiones de forma ordenada en `SIGTERM`.

### T5.6 — Promociones públicas
**Cubre:** RF-F5-09, RF-F5-10
1. Prueba de ESC-F5-07.
2. Endpoints sobre la vista `promociones_vigentes`.

### T5.7 — OTP y sesión del cliente
**Cubre:** RF-F5-11, RF-F5-12, RNF-F5-02, RNF-F5-03
1. Prueba de ESC-F5-08 y de los límites.
2. Módulo `otp` y `authCliente.js`.

### T5.8 — Historial y detalle
**Cubre:** RF-F5-13 a RF-F5-15
1. Pruebas de ESC-F5-09 y ESC-F5-10.
2. Endpoints `/cliente/vehiculos` e `/cliente/historial`.

### T5.9 — Derechos del titular
**Cubre:** RF-F5-16 a RF-F5-18
1. Prueba de ESC-F5-11 y de la solicitud de eliminación (aparece para el admin).
2. Endpoints `/cliente/mis-datos` y `/cliente/solicitudes-titular`; agregar `GET /solicitudes-titular` al panel del admin.

### T5.10 — Aislamiento
1. Agregar todos los endpoints `/cliente/*` y `/publico/*` a la suite de aislamiento.

## Compuerta de validación de la fase

### Verificaciones generales
- [ ] G1 Pruebas en verde
- [ ] G2 Cobertura ≥ 80 %
- [ ] G3 Contrato OpenAPI válido y alineado
- [ ] G4 Respuestas validadas contra el contrato
- [ ] G5 `supabase db reset` sin errores
- [ ] G6 Asesores de Supabase sin alertas WARN
- [ ] G7 Suite de aislamiento con los endpoints de F5 (públicos y de cliente)
- [ ] G8 Todos los CA con prueba enlazada en `05-trazabilidad.md`
- [ ] G9 CI en verde
- [ ] G10 Demostración al PO

### Verificaciones específicas
- [ ] Desde un celular: abrir `/publico/demo-cali`, buscar la placa y ver el seguimiento con la marca de la sede.
- [ ] Con el seguimiento abierto, el operario cambia el estado y el celular se actualiza en menos de 5 segundos.
- [ ] Apagar el wifi del celular, cambiar el estado dos veces, volver a conectarse: se muestra el estado correcto.
- [ ] `curl` a `/publico/seguimiento/{codigo}` no devuelve nombre, celular ni correo.
- [ ] 11 búsquedas en un minuto desde la misma IP devuelven `429`.
- [ ] El código de una orden entregada hace más de 24 h devuelve `404`.

### Cierre
- [ ] Estado de `spec.md` cambiado a `Validada`
- [ ] HUs de la Épica 2 movidas a "Listo" en Jira (backend); HU-47 y HU-54 actualizadas
- [ ] **Hito H2 (Experiencia del cliente final) alcanzado** (si F4 está validada)
