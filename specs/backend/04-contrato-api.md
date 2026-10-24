# Contrato de la API v1

Este documento fija las convenciones y el catálogo de endpoints. El detalle formal (esquemas de petición y respuesta, ejemplos) vive en `backend/openapi/openapi.yaml`, que es la fuente de verdad ejecutable.

---

## 1. Convenciones generales

| Aspecto | Regla |
|---|---|
| Base | `/api/v1` |
| Formato | JSON UTF-8; fechas en ISO 8601 UTC |
| Autenticación panel | `Authorization: Bearer <JWT de Supabase Auth>` |
| Autenticación cliente final | `Authorization: Bearer <JWT emitido por el backend>` (rol `cliente`) o código de seguimiento en la ruta |
| Idempotencia | `Idempotency-Key: <uuid>` obligatorio en `POST /ordenes`, `PATCH /ordenes/{id}/estado`, `POST /ordenes/{id}/novedades` y `POST /campanas` |
| Paginación | `?pagina=1&tamano=20` (máx. 100). Respuesta: `{ "datos": [...], "pagina": 1, "tamano": 20, "total": 134 }` |
| Filtros | Parámetros de consulta en español: `?buscar=`, `?placa=`, `?desde=`, `?hasta=`, `?estado=` |
| Identificador de petición | Encabezado de respuesta `X-Request-Id` |
| Documentación | `GET /api/docs` (Swagger UI) y `GET /api/openapi.json` |

## 2. Formato de error

```json
{
  "error": {
    "codigo": "VALIDACION",
    "mensaje": "La solicitud tiene datos inválidos",
    "detalles": [
      { "campo": "telefono", "mensaje": "Debe tener 10 dígitos" }
    ],
    "requestId": "b1f3c2…"
  }
}
```

| Código | HTTP | Uso |
|---|---|---|
| `VALIDACION` | 400 | Datos inválidos o incompletos (HU-45 CA2) |
| `NO_AUTENTICADO` | 401 | Token ausente, inválido o vencido (HU-46 CA3) |
| `SIN_PERMISO` | 403 | Rol sin acceso a la función (HU-46 CA2) |
| `NO_ENCONTRADO` | 404 | No existe **o pertenece a otro establecimiento** (HU-43 CA2) |
| `CONFLICTO` | 409 | Duplicados (teléfono, placa) o transición de estado inválida |
| `IDEMPOTENCIA_CONFLICTO` | 422 | Misma `Idempotency-Key` con cuerpo distinto |
| `LIMITE_EXCEDIDO` | 429 | Rate limit (OTP, acceso público) |
| `NO_IMPLEMENTADO` | 501 | Endpoint definido en el contrato pero aún no construido |
| `ERROR_INTERNO` | 500 | Error no controlado (sin detalles internos) |

## 3. Roles

| Rol | Origen | Alcance |
|---|---|---|
| `plataforma` | `admins_plataforma` | Administración de ZARU: establecimientos, planes, consumo |
| `admin` | `perfiles.rol` | Todo su establecimiento |
| `operario` | `perfiles.rol` | Operación diaria: clientes, vehículos, órdenes, novedades |
| `cliente` | Sesión OTP | Sus propios datos dentro de un establecimiento |
| `publico` | Sin sesión | Seguimiento por código o placa, branding y promociones de una sede |

---

## 4. Catálogo de endpoints

### Sistema (F0)

| Método | Ruta | Rol | HU |
|---|---|---|---|
| GET | `/health` | publico | HU-50 |
| GET | `/health/ready` | publico | HU-50 (verifica base de datos) |

### Identidad y tenants (F1)

| Método | Ruta | Rol | HU |
|---|---|---|---|
| GET | `/me` | admin, operario | HU-01, HU-46 |
| GET | `/usuarios` | admin | HU-02 |
| POST | `/usuarios` | admin | HU-02 CA1 |
| PATCH | `/usuarios/{id}` | admin | HU-02 CA3 |
| GET | `/plataforma/establecimientos` | plataforma | HU-43 CA3 |
| POST | `/plataforma/establecimientos` | plataforma | HU-43 CA3 |
| PATCH | `/plataforma/establecimientos/{id}` | plataforma | HU-43 |
| GET | `/auditoria` | admin | HU-55 CA1 |

### Clientes, vehículos y catálogo (F2)

| Método | Ruta | Rol | HU |
|---|---|---|---|
| GET | `/clientes` | admin, operario | HU-04 CA1 |
| POST | `/clientes` | admin, operario | HU-03, HU-53 |
| GET | `/clientes/{id}` | admin, operario | HU-04 |
| PATCH | `/clientes/{id}` | admin, operario | HU-04 CA2 |
| GET | `/clientes/{id}/consentimientos` | admin | HU-16 CA4 |
| POST | `/clientes/{id}/consentimientos` | admin, operario | HU-16 |
| POST | `/clientes/{id}/anonimizar` | admin | HU-54 CA3 |
| GET | `/vehiculos` | admin, operario | HU-05 |
| POST | `/vehiculos` | admin, operario | HU-05 |
| GET | `/vehiculos/{id}` | admin, operario | HU-05 |
| PATCH | `/vehiculos/{id}` | admin, operario | HU-05 |
| GET | `/vehiculos/{id}/historial` | admin, operario | HU-06 |
| GET | `/servicios` | admin, operario | HU-07 |
| POST | `/servicios` | admin | HU-07 CA1 |
| PATCH | `/servicios/{id}` | admin | HU-07 CA2, CA3 |
| GET | `/politicas-datos/vigente` | publico | HU-53 CA1 |

### Órdenes y operación (F3)

| Método | Ruta | Rol | HU |
|---|---|---|---|
| POST | `/ordenes` | admin, operario | HU-08 |
| GET | `/ordenes` | admin, operario | HU-09 (filtros por estado y fecha) |
| GET | `/ordenes/{id}` | admin, operario | HU-08 |
| PATCH | `/ordenes/{id}/estado` | admin, operario | HU-10, HU-14 CA3 |
| GET | `/dashboard` | admin, operario | HU-09 CA1, CA3, HU-11 |

### Promociones y branding (F4)

| Método | Ruta | Rol | HU |
|---|---|---|---|
| GET | `/promociones` | admin, operario | HU-12 |
| POST | `/promociones` | admin | HU-12 CA1 |
| PATCH | `/promociones/{id}` | admin | HU-12 |
| GET | `/establecimiento` | admin, operario | HU-13 |
| PUT | `/establecimiento/branding` | admin | HU-13 CA1 |
| POST | `/establecimiento/logo` | admin | HU-13 CA1, CA3 (multipart) |

### Cliente final (F5) — prefijo `/publico/{slug}`

| Método | Ruta | Rol | HU |
|---|---|---|---|
| GET | `/publico/{slug}` | publico | HU-37 (branding de la sede) |
| POST | `/publico/{slug}/buscar` | publico | HU-29, HU-34 (placa o celular) |
| GET | `/publico/seguimiento/{codigo}` | publico | HU-30, HU-36, HU-33 |
| GET | `/publico/seguimiento/{codigo}/eventos` | publico | HU-30 CA2, HU-47 (SSE) |
| GET | `/publico/{slug}/promociones` | publico | HU-32, HU-41 |
| GET | `/publico/{slug}/promociones/{id}` | publico | HU-42 |
| POST | `/publico/{slug}/otp` | publico | ADR-05 (solicitar código) |
| POST | `/publico/{slug}/otp/verificar` | publico | ADR-05 (emite sesión `cliente`) |
| GET | `/cliente/vehiculos` | cliente | HU-38 CA2 |
| GET | `/cliente/historial` | cliente | HU-31, HU-38 |
| GET | `/cliente/historial/{ordenId}` | cliente | HU-39, HU-40 |
| GET | `/cliente/mis-datos` | cliente | HU-54 CA1 |
| PATCH | `/cliente/mis-datos` | cliente | HU-54 CA2 |
| POST | `/cliente/solicitudes-titular` | cliente | HU-54 CA3 |
| GET | `/solicitudes-titular` | admin | HU-54 CA3 (atención de solicitudes) |

### Notificaciones (F6)

| Método | Ruta | Rol | HU |
|---|---|---|---|
| GET | `/cliente/preferencias` | cliente | HU-15 CA1 |
| PUT | `/cliente/preferencias` | cliente | HU-15 CA3, CA4 |
| POST | `/cliente/celular/verificar` | cliente | HU-15 CA2 |
| POST | `/cliente/push/suscripciones` | cliente | HU-48 |
| GET | `/cliente/notificaciones` | cliente | HU-24 CA1, CA2 |
| PATCH | `/cliente/notificaciones/{id}/leida` | cliente | HU-24 |
| GET | `/publico/baja/{token}` | publico | HU-16 CA3 |
| GET | `/configuracion/notificaciones` | admin | HU-17 CA1 |
| PUT | `/configuracion/notificaciones` | admin | HU-17 CA2, CA3 |
| GET | `/notificaciones` | admin | HU-20 (bitácora con filtros) |
| GET | `/notificaciones/fallidas` | admin, operario | HU-19 CA3 |
| POST | `/webhooks/twilio`, `/webhooks/resend` | firma del proveedor | HU-19 CA4 (confirmación de entrega) |

### Comunicación avanzada (F7)

| Método | Ruta | Rol | HU |
|---|---|---|---|
| GET | `/plantillas` | admin | HU-18 |
| PUT | `/plantillas/{evento}/{canal}` | admin | HU-18 CA1, CA2, CA4 |
| POST | `/plantillas/vista-previa` | admin | HU-18 CA3 |
| POST | `/campanas/estimar` | admin | HU-21 CA1, CA2 |
| POST | `/campanas` | admin | HU-21 CA3, CA4 |
| GET | `/campanas` | admin | HU-21 |
| POST | `/ordenes/{id}/novedades` | admin, operario | HU-23 |
| POST | `/ordenes/{id}/novedades/{nid}/fotos` | admin, operario | HU-23 CA2 |
| GET | `/publico/recordatorios/{token}/desactivar` | publico | HU-22 CA3 |
| GET | `/consumo` | admin | HU-25 |
| GET | `/plataforma/consumo` | plataforma | HU-25 CA3 |
| GET / PUT | `/plataforma/planes` | plataforma | HU-25 CA1 |

### Producción (F8)

| Método | Ruta | Rol | HU |
|---|---|---|---|
| GET | `/metricas` | plataforma | HU-50 CA1 |
