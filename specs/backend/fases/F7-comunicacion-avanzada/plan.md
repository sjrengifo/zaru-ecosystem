# F7 — Comunicación avanzada: Plan técnico

## 1. Resumen del enfoque
Todas las funcionalidades de F7 producen filas en la cola `notificaciones` de F6, de modo que heredan reintentos, bitácora, deduplicación y centro de notificaciones. Se agrega un motor de plantillas con validación de variables, un segmentador de campañas basado en SQL, un programador de recordatorios disparado por el evento `orden.entregada` y un contador de consumo que el enviador consulta antes de usar SMS o correo.

## 2. Cambios en el modelo de datos
Migración `<ts>_comunicacion_avanzada.sql`:

| Objeto | Cambio | RF |
|---|---|---|
| `plantillas_notificacion` | Nueva; filas con `establecimiento_id null` = plantillas de la plataforma | RF-F7-01 a 05 |
| `campanas` | Nueva | RF-F7-06 a 10 |
| `recordatorios` | Nueva; índice único parcial `(vehiculo_id) where estado = 'programado'` | RF-F7-11 a 14 |
| `novedades` | Nueva | RF-F7-15 a 18 |
| `consumo_mensual` | Nueva; función `privado.registrar_consumo(est, canal)` con `insert … on conflict do update` | RF-F7-19 a 23 |
| `notificaciones` | `prioridad smallint default 1` (0 = novedad, 1 = operativa, 2 = comercial); `tomar_notificaciones` ordena por `prioridad, created_at` | RNF-F7-02 |
| `planes` | Cupos definidos (seed): básico 200 SMS / 1 000 correos; intermedio 600 / 3 000; empresarial 2 000 / 10 000 — **valores a confirmar por el PO** | RF-F7-19 |
| Storage | Bucket privado `evidencias`, ruta `{establecimiento_id}/{orden_id}/{novedad_id}/…` | RF-F7-16 |
| Vista `privado.segmento_campana(...)` | Función SQL que recibe filtros y devuelve clientes elegibles con motivo de exclusión | RF-F7-06 a 08 |

## 3. Contrato de API

| Método | Ruta | Rol | Petición | Respuesta | RF |
|---|---|---|---|---|---|
| GET | `/plantillas` | admin | — | `Plantilla[]` (propias y por defecto) | RF-F7-05 |
| PUT | `/plantillas/{evento}/{canal}` | admin | `{ asunto?, cuerpo }` | `Plantilla` + `{ caracteres, segmentos, advertencias[] }` · `400` | RF-F7-01, 02, 04 |
| POST | `/plantillas/vista-previa` | admin | `{ evento, cuerpo, asunto? }` | `{ push, sms, correo: { html } }` | RF-F7-03 |
| POST | `/campanas/estimar` | admin | `{ promocionId, segmento }` | `{ total, exclusiones }` | RF-F7-06 a 08 |
| POST | `/campanas` | admin | `Idempotency-Key` · `{ promocionId, segmento, programadaPara? }` | `201 Campana` (con hora ajustada) | RF-F7-09, 10 |
| GET | `/campanas` | admin | paginación | `Campana[]` | RF-F7-06 |
| POST | `/ordenes/{id}/novedades` | admin, operario | `Idempotency-Key` · `{ tipo, mensaje?, minutosExtra? }` | `201 Novedad` | RF-F7-15, 17, 18 |
| POST | `/ordenes/{id}/novedades/{nid}/fotos` | admin, operario | `multipart` (hasta 3) | `{ fotos: [url firmada] }` | RF-F7-16 |
| GET | `/publico/recordatorios/{token}/desactivar` | — | — | Página de confirmación | RF-F7-13 |
| GET | `/consumo` | admin | `?mes` | `{ sms: { usados, cupo }, correo: { usados, cupo } }` | RF-F7-23 |
| GET | `/plataforma/consumo` | plataforma | `?mes` | `[{ establecimiento, plan, sms, correo }]` | RF-F7-22 |
| GET / PUT | `/plataforma/planes` | plataforma | cupos | `Plan[]` | RF-F7-19 |

`GET /ordenes/{id}` incluye `novedades`; el seguimiento público incluye la `entregaEstimadaAt` actualizada.

## 4. Diseño de módulos

| Componente | Responsabilidad |
|---|---|
| `notificaciones/plantillas.js` | Parser de `{variable}` con lista blanca, conteo de caracteres y segmentos GSM-7/UCS-2, render por canal con branding |
| `modules/campanas` | Estimar, crear (ajuste nocturno con `America/Bogota`), y un paso del worker que materializa las campañas vencidas en notificaciones `comercial` |
| `modules/recordatorios` | El despachador, al procesar `orden.entregada`, cancela el recordatorio vigente del vehículo y, si hay ≥ 3 servicios, calcula el promedio de días entre visitas y programa uno nuevo. El worker convierte los vencidos en notificaciones `recordatorio`. |
| `modules/novedades` | Crea la novedad, actualiza `entrega_estimada_at` si es demora, genera notificación `novedad` con prioridad 0 y `programada_para = now()` |
| `notificaciones/consumo.js` | Antes de enviar SMS o correo: verifica cupo; si está agotado aplica RF-F7-21; tras enviar, registra consumo y dispara la alerta del 80 % una vez por mes |

## 5. Reglas de negocio

| Regla | Implementación |
|---|---|
| Límite de 2 comerciales por cliente cada 7 días | Conteo en `notificaciones` tipo `comercial` estado `enviada/entregada` |
| Horario permitido 7:00 a. m. – 8:00 p. m. | Función `ajustarHorario(fecha)` con zona Bogotá |
| Frecuencia promedio | `(última - primera) / (n - 1)` en días, redondeado |
| Fotos | Máx. 3 por novedad, JPG/PNG por contenido, ≤ 5 MB |
| Alerta del 80 % única | Columna `alerta_80_enviada` en `consumo_mensual` |

## 6. Estrategia de pruebas

| Nivel | Qué se prueba |
|---|---|
| Unitarias | Parser de plantillas, segmentos SMS (incluidas tildes que fuerzan UCS-2), ajuste de horario, cálculo de frecuencia |
| Integración | ESC-F7-01 a ESC-F7-11 con worker paso a paso y reloj controlado |
| Rendimiento | Estimación con 5 000 clientes < 2 s |
| Aislamiento | Plantillas, campañas, novedades, fotos y consumo |

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Campañas grandes retrasan notificaciones operativas | Prioridad en la cola (RNF-F7-02) |
| Costos de SMS en pruebas | Proveedor `consola` fuera de producción y cupos bajos en el ambiente de pruebas |
| Fotos con datos personales (rostros, placas) | Bucket privado y URLs firmadas de corta duración |
