# Modelo de datos objetivo

Este documento describe el esquema completo al terminar F8 y en qué fase se introduce cada cambio. El esquema actual (desplegado en Supabase, proyecto `zaru`) corresponde a la columna **Existe**.

Convenciones: `id uuid` por defecto, `created_at timestamptz default now()`, `establecimiento_id` en toda tabla de negocio, RLS habilitado en todas las tablas, índices en todas las llaves foráneas.

---

## 1. Diagrama lógico

```
planes ─┐
        ▼
establecimientos ◀── perfiles (auth.users) ── admins_plataforma
   │
   ├── clientes ── consentimientos            politicas_datos
   │      ├── vehiculos ── recordatorios
   │      ├── preferencias_notificacion
   │      ├── suscripciones_push
   │      ├── otp_codigos
   │      └── solicitudes_titular
   │
   ├── servicios ──┐
   ├── promociones ┴─ promocion_servicios
   │
   ├── ordenes ── orden_servicios
   │      ├── historial_estados
   │      ├── eventos (outbox de dominio)
   │      └── novedades
   │
   ├── config_notificaciones · plantillas_notificacion
   ├── notificaciones (outbox) ── campanas
   ├── consumo_mensual
   └── auditoria · idempotencia
```

---

## 2. Tablas por fase

### Existentes (desplegadas)

| Tabla | Propósito |
|---|---|
| `establecimientos` | Tenant: car wash afiliado |
| `perfiles` | Usuario del panel (`admin` / `operario`) |
| `clientes` | Cliente final con autorización de datos |
| `vehiculos` | Vehículos por cliente |
| `servicios` | Catálogo |
| `promociones`, `promocion_servicios` | Promociones |
| `ordenes`, `orden_servicios` | Órdenes de servicio |
| `historial_estados` | Trazabilidad de estados |

### F1 — Identidad y tenants

| Cambio | Detalle |
|---|---|
| `establecimientos` + columnas | `slug text unique not null`, `direccion`, `telefono`, `plan_id → planes`, `estado` (`prueba`, `activo`, `pendiente_activacion`, `suspendido`), `prueba_hasta date` (HU-57) |
| `planes` (nueva) | `nombre` (`basico`, `intermedio`, `empresarial`), `cupo_sms_mes int`, `cupo_correo_mes int` |
| `admins_plataforma` (nueva) | `usuario_id → auth.users`: administradores de ZARU (HU-39, alta de establecimientos) |
| `auditoria` (nueva) | `establecimiento_id`, `usuario_id`, `actor_tipo` (`usuario`/`cliente`/`sistema`), `accion`, `recurso`, `recurso_id`, `resultado` (`permitido`/`denegado`), `detalle jsonb`, `ip`, `request_id`. Solo inserción. |

### F2 — Clientes y datos personales

| Cambio | Detalle |
|---|---|
| `politicas_datos` (nueva) | `version text unique`, `url`, `vigente_desde`. Solo una vigente. |
| `consentimientos` (nueva) | `cliente_id`, `tipo` (`tratamiento_datos`, `notificaciones_servicio`, `comerciales`), `otorgado bool`, `canal` (`panel`, `app`, `enlace_baja`), `politica_version`, `ip`, `created_at`. **Solo inserción**: el estado vigente es el último registro por tipo (HU-30 CA4, HU-51 CA2). |
| `clientes` | Se eliminan `autorizacion_datos` y `fecha_autorizacion` (migran a `consentimientos`); se agregan `celular_verificado_at`, `anonimizado_at` |
| `vehiculos` | `recordatorios_activos bool default true` |
| `servicios` | `incluye_rain_insure bool default false`, `rain_insure_horas int` (HU-15); `orden_servicios.rain_insure_hasta timestamptz` guarda la garantía por orden (HU-15 CA2, HU-25) |
| `solicitudes_titular` (nueva) | `cliente_id`, `tipo` (`consulta`, `actualizacion`, `eliminacion`), `estado`, `resuelta_at`, `detalle jsonb` (HU-52) |

### F3 — Órdenes y operación

| Cambio | Detalle |
|---|---|
| `estado_orden` | Se agrega el valor `secado` entre `en_lavado` y `listo` (HU-31 CA1). Ver DA-02. |
| `ordenes` + columnas | `codigo_seguimiento text unique` (10 caracteres, para enlace/QR), `entrega_estimada_at`, `observaciones` |
| `historial_estados` | `estado_anterior`, `revertido bool default false` (HU-28 CA3) |
| `idempotencia` (nueva) | `clave`, `usuario_id`, `ruta`, `hash_cuerpo`, `respuesta jsonb`, `status int`, `created_at`. Única por (`clave`, `usuario_id`). Expira a las 24 h. |
| `eventos` (nueva, outbox de dominio) | `establecimiento_id`, `tipo` (`orden.creada`, `orden.estado_cambiado`, `orden.estado_revertido`, `orden.entregada`), `orden_id`, `payload jsonb`, `procesado_at`. Se inserta en la misma transacción que el cambio; F6 la consume. |

### F4 — Promociones y branding

| Cambio | Detalle |
|---|---|
| `promociones` + columnas | `descripcion`, `condiciones`, `activa bool default true` (HU-27) |
| `ordenes` + columnas | `promocion_id → promociones` (promoción aplicada) |
| Storage | Bucket `logos` (público, PNG/JPG, ≤ 2 MB) |

### F5 — Cliente final

| Cambio | Detalle |
|---|---|
| `otp_codigos` (nueva) | `cliente_id`, `celular`, `codigo_hash`, `expira_at`, `intentos`, `usado_at` |

### F6 — Notificaciones (núcleo)

| Cambio | Detalle |
|---|---|
| `preferencias_notificacion` (nueva) | `cliente_id`, `canal` (`push`, `sms`, `correo`), `activo bool`. Única por (`cliente_id`, `canal`). |
| `suscripciones_push` (nueva) | `cliente_id`, `endpoint`, `claves jsonb` |
| `config_notificaciones` (nueva) | `establecimiento_id`, `estado estado_orden`, `activo bool`. `listo` siempre activo (HU-31 CA2). |
| `notificaciones` (nueva, outbox) | `cliente_id`, `orden_id`, `tipo` (`operativa`, `comercial`, `recordatorio`, `novedad`, `correccion`, `sistema`), `evento`, `canal`, `destino`, `contenido jsonb`, `estado` (`programada`, `pendiente`, `enviando`, `enviada`, `entregada`, `fallida`, `cancelada`), `intentos`, `programada_para`, `proximo_intento_at`, `error`, `clave_dedupe text unique`, `notificacion_origen_id` (canal alterno), `leida_at` |

### F7 — Comunicación avanzada

| Cambio | Detalle |
|---|---|
| `plantillas_notificacion` (nueva) | `establecimiento_id`, `evento`, `canal`, `asunto`, `cuerpo`. Única por (`establecimiento_id`, `evento`, `canal`). |
| `campanas` (nueva) | `promocion_id`, `segmento jsonb`, `programada_para`, `estado`, `total_destinatarios`, `creada_por` |
| `recordatorios` (nueva) | `vehiculo_id`, `fecha_programada`, `estado` (`programado`, `enviado`, `cancelado`) |
| `novedades` (nueva) | `orden_id`, `tipo` (`demora`, `dano_preexistente`, `objeto_encontrado`, `otro`), `mensaje` (≤ 300), `minutos_extra`, `fotos text[]` (≤ 3), `creada_por` |
| `consumo_mensual` (nueva) | `establecimiento_id`, `mes date`, `canal`, `cantidad`, `alerta_80_enviada bool`. Única por (`establecimiento_id`, `mes`, `canal`). |
| `notificaciones` + columna | `prioridad smallint default 1` (0 novedad, 1 operativa, 2 comercial) |
| Storage | Bucket privado `evidencias` (fotos de novedades) |

---

## 3. Reglas de integridad clave

| Regla | Mecanismo |
|---|---|
| Teléfono único por establecimiento | `unique (establecimiento_id, telefono)` |
| Placa única por establecimiento | `unique (establecimiento_id, placa)` |
| Precio histórico inmutable | `orden_servicios.precio` copia el precio al crear la orden |
| Transiciones de estado válidas | Validadas en `ordenes.service`; la base solo garantiza el enum |
| Consentimientos inmutables | Sin políticas ni permisos de `update`/`delete`; revocar es insertar `otorgado = false` |
| Auditoría inmutable | Solo `insert`; `revoke update, delete` incluso para `service_role` mediante trigger que lo impide |
| Sin datos personales sin autorización | El servicio de clientes exige un consentimiento `tratamiento_datos` otorgado en la misma transacción (función SQL `crear_cliente_con_consentimiento`) |
| Anonimización | `anonimizar_cliente(id)` reemplaza nombre, teléfono y correo por valores irreversibles y conserva órdenes para estadísticas (HU-52 CA3) |

## 4. Índices para consultas frecuentes (HU-42 CA3)

| Consulta | Índice |
|---|---|
| Órdenes activas del dashboard | `ordenes (establecimiento_id, estado) where estado <> 'entregado'` |
| Búsqueda de vehículo por placa | `vehiculos (establecimiento_id, placa)` (único) |
| Búsqueda de clientes por nombre | `gin (nombre gin_trgm_ops)` con extensión `pg_trgm` |
| Historial de un vehículo | `ordenes (vehiculo_id, created_at desc)` |
| Cola de notificaciones | `notificaciones (estado, proximo_intento_at) where estado in ('pendiente','programada')` |
| Bitácora con filtros | `notificaciones (establecimiento_id, created_at desc)` |
| Último consentimiento | `consentimientos (cliente_id, tipo, created_at desc)` |
