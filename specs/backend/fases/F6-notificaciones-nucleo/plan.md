# F6 — Motor de notificaciones (núcleo): Plan técnico

## 1. Resumen del enfoque
Se implementa una canalización en dos etapas sobre PostgreSQL (ADR-03):

```
ordenes ──(misma transacción)──▶ eventos ──[Despachador]──▶ notificaciones ──[Enviador]──▶ Proveedor
                                              │                    ▲    │
                                              │                    │    └─ reintentos / canal alterno
                                    config_notificaciones          │
                                    preferencias + consentimientos └── cancelación por reversión
```

1. **Despachador:** toma `eventos` sin procesar, decide a quién y por qué canales notificar, y crea filas en `notificaciones` con `programada_para = ahora + 20 s` (ventana de gracia, ADR-06).
2. **Enviador:** toma notificaciones `pendiente`/`programada` vencidas con `FOR UPDATE SKIP LOCKED`, renderiza el mensaje y llama al proveedor del canal.

Ambos corren en `workers/notificaciones.worker.js` cada 5 segundos (ADR-08).

## 2. Cambios en el modelo de datos
Migración `<ts>_notificaciones.sql`:

| Objeto | Cambio | RF |
|---|---|---|
| Enums | `canal_notificacion` (`push`, `sms`, `correo`), `tipo_notificacion`, `estado_notificacion` | — |
| `preferencias_notificacion` | Nueva | RF-F6-07 a 10 |
| `suscripciones_push` | Nueva | RF-F6-11 |
| `config_notificaciones` | Nueva; trigger que crea la configuración por defecto (todo activo) al crear un establecimiento; `check` que impide `activo = false` para `listo` | RF-F6-12 a 14 |
| `notificaciones` | Nueva (ver modelo) con `clave_dedupe unique` = `orden_id:historial_id:canal` | RF-F6-15 a 19 |
| `establecimientos` | `token_baja_secreto` para firmar enlaces de baja | RF-F6-24 |
| Índices | Cola: `(estado, programada_para)`; bitácora: `(establecimiento_id, created_at desc)`, `(establecimiento_id, canal, estado)`; centro: `(cliente_id, created_at desc)` | RNF-F6-02 |
| `privado.tomar_notificaciones(limite)` | `update … set estado='enviando' where id in (select … for update skip locked order by created_at limit n) returning *` | RF-F6-15 |
| `pg_cron` | Purga de notificaciones > 1 año | — |

## 3. Contrato de API

| Método | Ruta | Rol | Petición | Respuesta | RF |
|---|---|---|---|---|---|
| GET | `/cliente/preferencias` | cliente | — | `{ canales: [{ canal, activo, destino, verificado }] }` | RF-F6-07 |
| PUT | `/cliente/preferencias` | cliente | `{ canales: [{ canal, activo }], confirmarSinCanales? }` | `200` · `409` | RF-F6-08 a 10 |
| POST | `/cliente/celular/verificar` | cliente | `{ codigo }` (tras solicitar OTP) | `200` | RF-F6-08 |
| POST | `/cliente/push/suscripciones` | cliente | `PushSubscription` del navegador | `201` | RF-F6-11 |
| GET | `/cliente/notificaciones` | cliente | paginación | `{ datos, noLeidas }` | RF-F6-22, 23 |
| PATCH | `/cliente/notificaciones/{id}/leida` | cliente | — | `204` | RF-F6-22 |
| GET | `/publico/baja/{token}` | — | — | Página HTML de confirmación | RF-F6-24 |
| GET | `/configuracion/notificaciones` | admin | — | `[{ estado, activo, obligatorio }]` | RF-F6-12 |
| PUT | `/configuracion/notificaciones` | admin | `[{ estado, activo }]` | `200` · `400` | RF-F6-13, 14 |
| GET | `/notificaciones` | admin | `?placa&desde&hasta&canal&estado&tipo` + paginación | `Pagina<NotificacionBitacora>` | RF-F6-20, 21 |
| GET | `/notificaciones/fallidas` | admin, operario | — | `[{ placa, celular, orden, motivo }]` | RF-F6-18 |

`GET /dashboard` (F3) agrega `alertasNotificacion` con las fallidas del día.

## 4. Diseño de módulos

| Componente | Responsabilidad |
|---|---|
| `notificaciones/despachador.js` | Por evento: verifica consentimiento `notificaciones_servicio`, `config_notificaciones` y preferencias; crea una notificación por canal; para `orden.estado_revertido`, cancela las `programada` del cambio revertido o crea una de tipo `correccion` si ya se enviaron. Marca el evento como procesado. |
| `notificaciones/enviador.js` | Renderiza, llama al proveedor, registra `enviada` o el error; calcula `proximo_intento_at` (1, 2, 4 min); tras el tercer fallo de una `listo` crea la alterna con `notificacion_origen_id`; si no hay alterna, `fallida` definitiva. |
| `notificaciones/plantillas.js` | Plantillas por defecto por evento y canal con variables `{nombre_cliente}`, `{placa}`, `{estado}`, `{sede}`, `{direccion}`, `{hora}`, `{valor}`, `{enlace}` |
| `providers/notificaciones/*` | Interfaz común `enviar({ destino, asunto, cuerpo }) → { idProveedor }`. `consola` (desarrollo/pruebas), `webpush`, `twilio`, `resend`. Selección por `NOTIF_PROVEEDOR_<CANAL>`. |
| `webhooks/proveedores` | `POST /webhooks/twilio` y `/webhooks/resend` marcan `entregada` (validando firma). Si llega una entrega tardía, cancela reintentos y alternas pendientes del mismo origen (RF-F6-19). |
| `shared/mask.js` | Enmascarado de celular y correo para la bitácora |

## 5. Reglas de negocio

| Regla | Implementación |
|---|---|
| Ventana de gracia 20 s, envío ≤ 30 s | `programada_para = now() + 20 s`; worker cada 5 s |
| Orden de envío | `order by created_at` en `tomar_notificaciones` |
| Sin duplicados | `clave_dedupe` única + cancelación de pendientes al confirmarse la entrega |
| Canal alterno solo para `listo` | Condición en `enviador.js` |
| Enlace de baja | JWT firmado con `token_baja_secreto` que contiene `clienteId`; sin expiración |

## 6. Estrategia de pruebas

| Nivel | Qué se prueba |
|---|---|
| Unitarias | Despachador y enviador con repositorio y proveedor falsos, reloj controlado (reintentos 1-2-4 min, ventana de gracia), plantillas y enmascarado |
| Integración | ESC-F6-01 a ESC-F6-14 ejecutando el worker paso a paso (`worker.tick()`) con el proveedor `consola` o uno que falla a voluntad |
| Concurrencia | Dos workers simultáneos no envían la misma notificación |
| Rendimiento | 100 000 notificaciones sintéticas: bitácora filtrada < 3 s; 30 envíos/min |
| Aislamiento | Bitácora, configuración y centro de notificaciones |

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Render suspendido retrasa envíos | Documentado en ADR-08; en F8 se evalúa worker separado o `pg_cron` + Edge Function |
| Costos de SMS | Proveedor `consola` por defecto fuera de producción; cupos por plan en F7 |
| Suscripciones push vencidas | Si el proveedor responde `410 Gone`, se elimina la suscripción |
