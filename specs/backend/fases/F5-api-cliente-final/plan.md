# F5 — API del cliente final: Plan técnico

## 1. Resumen del enfoque
Se crean dos grupos de rutas: `/publico/*` (sin sesión, con rate limit y sin datos personales) y `/cliente/*` (con JWT propio de rol `cliente`). El tiempo real del cliente final se sirve por SSE desde el backend (ADR-04): un componente `bus` se suscribe una sola vez a Supabase Realtime sobre `ordenes` con la clave de servicio y reparte cada cambio solo a las conexiones SSE de esa orden.

## 2. Cambios en el modelo de datos
Migración `<ts>_cliente_final.sql`:

| Objeto | Cambio | RF |
|---|---|---|
| `otp_codigos` | Nueva (ver modelo); índice `(celular, created_at desc)` | RF-F5-11, RF-F5-12 |
| `establecimientos.slug` | Índice único (ya existe desde F1) | RF-F5-01 |
| Vista `privado.seguimiento_publico` | Orden + servicios + pasos + branding, sin columnas personales | RF-F5-04, RNF-F5-04 |

## 3. Contrato de API

| Método | Ruta | Auth | Petición | Respuesta | RF |
|---|---|---|---|---|---|
| GET | `/publico/{slug}` | — | — | `SedePublica` | RF-F5-01 |
| POST | `/publico/{slug}/buscar` | — | `{ placa }` o `{ celular }` | `{ codigoSeguimiento }` · `404` | RF-F5-02, 03 |
| GET | `/publico/seguimiento/{codigo}` | — | — | `Seguimiento` | RF-F5-04, 08 |
| GET | `/publico/seguimiento/{codigo}/eventos` | — | `Last-Event-ID?` | `text/event-stream` (`event: estado`) | RF-F5-05 a 07 |
| GET | `/publico/{slug}/promociones` | — | — | `PromocionPublica[]` | RF-F5-09 |
| GET | `/publico/{slug}/promociones/{id}` | — | — | `PromocionPublica` | RF-F5-10 |
| POST | `/publico/{slug}/otp` | — | `{ celular }` | `202` siempre | RF-F5-11 |
| POST | `/publico/{slug}/otp/verificar` | — | `{ celular, codigo }` | `{ token, expiraEn }` · `401` | RF-F5-12 |
| GET | `/cliente/vehiculos` | cliente | — | `Vehiculo[]` | RF-F5-13 |
| GET | `/cliente/historial` | cliente | `?placa` + paginación | `Pagina<ServicioHistorial>` | RF-F5-14 |
| GET | `/cliente/historial/{ordenId}` | cliente | — | `DetalleServicio` | RF-F5-15 |
| GET | `/cliente/mis-datos` | cliente | — | `MisDatos` | RF-F5-16 |
| PATCH | `/cliente/mis-datos` | cliente | `{ nombre?, correo? }` | `MisDatos` | RF-F5-17 |
| POST | `/cliente/solicitudes-titular` | cliente | `{ tipo: "eliminacion", motivo? }` | `201` | RF-F5-18 |

## 4. Diseño de módulos

| Componente | Comportamiento |
|---|---|
| `middlewares/authCliente.js` | Verifica el JWT con `jose` (HS256, `CLIENTE_JWT_SECRET`), exige `rol = cliente` y arma `req.ctx = { clienteId, establecimientoId }`. Rechaza clientes anonimizados. |
| `modules/publico` | Resolución de sede por slug; búsqueda normalizando la placa; respuestas sin datos personales; `express-rate-limit` por IP + slug. |
| `modules/otp` | Genera 6 dígitos con `crypto.randomInt`, guarda `sha256(codigo + pepper)`, envía por el proveedor de SMS (en F5, `consola`). |
| `modules/seguimiento/bus.js` | Una suscripción Realtime a `ordenes` y `historial_estados`; mantiene `Map<ordenId, Set<res>>`; al recibir un cambio, emite a las conexiones de esa orden con `id` = id del registro de historial. |
| `modules/seguimiento/sse.js` | Encabezados SSE, `retry: 5000`, comentario `: ping` cada 25 s; al conectar envía el estado actual y, si hay `Last-Event-ID`, los registros de `historial_estados` posteriores. |
| `modules/clienteFinal` | Historial, detalle, mis datos y solicitudes; siempre filtra por `ctx.clienteId` y `ctx.establecimientoId`. |

## 5. Reglas de negocio

| Regla | Implementación | Error |
|---|---|---|
| Código válido hasta 24 h después de la entrega | Consulta compara `entregada_at` | `404` |
| Respuesta uniforme ante placa sin orden | Mismo cuerpo y mismo tiempo aproximado | `404` |
| OTP: 5 intentos, 5 minutos, un solo uso | `otp_codigos.intentos`, `expira_at`, `usado_at` | `401` |
| Rain Insure vigente | `entregada_at + rain_insure_dias > now()` | — |
| Cambio de celular | Requiere OTP al nuevo número y actualiza `celular_verificado_at` | `409` si ya existe en la sede |

## 6. Estrategia de pruebas

| Nivel | Qué se prueba |
|---|---|
| Unitarias | Generación y verificación de OTP, cálculo de Rain Insure, `bus` con conexiones simuladas |
| Integración | ESC-F5-01 a ESC-F5-11; SSE con un cliente `eventsource` en la prueba |
| Privacidad | Prueba que recorre todas las respuestas `/publico/*` y falla si encuentra el nombre, celular o correo del cliente de prueba |
| Aislamiento | Token `cliente` de A contra recursos de B; slug de A con placa de B |
| Abuso | Rate limits de búsqueda y OTP devuelven `429` |

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Enumeración de placas | Rate limit, respuesta uniforme y solo datos no personales |
| Muchas conexiones SSE abiertas | Una sola suscripción Realtime compartida; límite de conexiones por IP |
| Render suspende el servicio y corta los SSE | El cliente reconecta automáticamente y recibe el estado actual (RF-F5-06) |
| Varias instancias del backend en F8 | Cada instancia mantiene su propia suscripción Realtime; el diseño no requiere estado compartido |
