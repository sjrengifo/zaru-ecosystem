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
| `VALIDACION` | 400 | Datos inválidos o incompletos (HU-43 CA2) |
| `NO_AUTENTICADO` | 401 | Token ausente, inválido o vencido (HU-44 CA3) |
| `SIN_PERMISO` | 403 | Rol sin acceso a la función (HU-44 CA2) |
| `NO_ENCONTRADO` | 404 | No existe **o pertenece a otro establecimiento** (HU-41 CA2) |
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
| GET | `/health` | publico | HU-48 |
| GET | `/health/ready` | publico | HU-48 (verifica base de datos) |

### Identidad y tenants (F1)

| Método | Ruta | Rol | HU |
|---|---|---|---|
| GET | `/me` | admin, operario | HU-01, HU-44 |
| GET | `/usuarios` | admin | HU-02 |
| POST | `/usuarios` | admin | HU-02 CA1 |
| PATCH | `/usuarios/{id}` | admin | HU-02 CA3 |
| GET | `/plataforma/establecimientos` | plataforma | HU-41 CA3 |
| POST | `/plataforma/establecimientos` | plataforma | HU-41 CA3 |
| PATCH | `/plataforma/establecimientos/{id}` | plataforma | HU-41, HU-57 CA2, CA3 (estado: prueba, activo, pendiente de activación, suspendido) |
| GET | `/auditoria` | admin | HU-53 CA1 |

### Clientes, vehículos y catálogo (F2)

| Método | Ruta | Rol | HU |
|---|---|---|---|
| GET | `/clientes` | admin, operario | HU-04 CA1 |
| POST | `/clientes` | admin, operario | HU-03, HU-51 |
| GET | `/clientes/{id}` | admin, operario | HU-04 |
| PATCH | `/clientes/{id}` | admin, operario | HU-04 CA2 |
| GET | `/clientes/{id}/consentimientos` | admin | HU-30 CA4 |
| POST | `/clientes/{id}/consentimientos` | admin, operario | HU-30 |
| POST | `/clientes/{id}/anonimizar` | admin | HU-52 CA3 |
| GET | `/vehiculos` | admin, operario | HU-05 |
| POST | `/vehiculos` | admin, operario | HU-05 |
| GET | `/vehiculos/{id}` | admin, operario | HU-05 |
| PATCH | `/vehiculos/{id}` | admin, operario | HU-05 |
| GET | `/vehiculos/{id}/historial` | admin, operario | HU-06 |
| GET | `/servicios` | admin, operario | HU-07 |
| POST | `/servicios` | admin | HU-07 CA1 |
| PATCH | `/servicios/{id}` | admin | HU-07 CA2, CA3 |
| GET | `/politicas-datos/vigente` | publico | HU-51 CA1 |

### Órdenes y operación (F3)

| Método | Ruta | Rol | HU |
|---|---|---|---|
| POST | `/ordenes` | admin, operario | HU-08 |
| GET | `/ordenes` | admin, operario | HU-09 (filtros por estado y fecha) |
| GET | `/ordenes/{id}` | admin, operario | HU-08 |
| PATCH | `/ordenes/{id}/estado` | admin, operario | HU-10, HU-28 CA3 |
| GET | `/dashboard` | admin, operario | HU-09 CA1, CA3, HU-11 |
| POST | `/ordenes/sincronizar` | admin, operario | HU-54 CA2 |
| GET | `/reportes/servicios` | admin | HU-16 CA1 |
| GET | `/reportes/afluencia` | admin | HU-16 CA2, CA3 |

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
| GET | `/publico/{slug}` | publico | HU-22 (branding de la sede) |
| POST | `/publico/{slug}/buscar` | publico | HU-17, HU-17 (placa o celular) |
| GET | `/publico/seguimiento/{codigo}` | publico | HU-18, HU-21, HU-25 |
| GET | `/publico/seguimiento/{codigo}/eventos` | publico | HU-18 CA2, HU-45 (SSE) |
| GET | `/publico/{slug}/promociones` | publico | HU-26, HU-26 |
| GET | `/publico/{slug}/promociones/{id}` | publico | HU-27 |
| POST | `/publico/{slug}/otp` | publico | ADR-05 (solicitar código) |
| POST | `/publico/{slug}/otp/verificar` | publico | ADR-05 (emite sesión `cliente`) |
| GET | `/cliente/vehiculos` | cliente | HU-23 CA2 |
| GET | `/cliente/historial` | cliente | HU-23, HU-23 |
| GET | `/cliente/historial/{ordenId}` | cliente | HU-24, HU-25 |
| GET | `/cliente/mis-datos` | cliente | HU-52 CA1 |
| PATCH | `/cliente/mis-datos` | cliente | HU-52 CA2 |
| POST | `/cliente/solicitudes-titular` | cliente | HU-52 CA3 |
| GET | `/solicitudes-titular` | admin | HU-52 CA3 (atención de solicitudes) |

### Notificaciones (F6)

| Método | Ruta | Rol | HU |
|---|---|---|---|
| GET | `/cliente/preferencias` | cliente | HU-29 CA1 |
| PUT | `/cliente/preferencias` | cliente | HU-29 CA3, CA4 |
| POST | `/cliente/celular/verificar` | cliente | HU-29 CA2 |
| POST | `/cliente/push/suscripciones` | cliente | HU-46 |
| GET | `/cliente/notificaciones` | cliente | HU-38 CA1, CA2 |
| PATCH | `/cliente/notificaciones/{id}/leida` | cliente | HU-38 |
| GET | `/publico/baja/{token}` | publico | HU-30 CA3 |
| GET | `/configuracion/notificaciones` | admin | HU-31 CA1 |
| PUT | `/configuracion/notificaciones` | admin | HU-31 CA2, CA3 |
| GET | `/notificaciones` | admin | HU-34 (bitácora con filtros) |
| GET | `/notificaciones/fallidas` | admin, operario | HU-33 CA3 |
| POST | `/webhooks/twilio`, `/webhooks/resend` | firma del proveedor | HU-33 CA4 (confirmación de entrega) |

### Comunicación avanzada (F7)

| Método | Ruta | Rol | HU |
|---|---|---|---|
| GET | `/plantillas` | admin | HU-32 |
| PUT | `/plantillas/{evento}/{canal}` | admin | HU-32 CA1, CA2, CA4 |
| POST | `/plantillas/vista-previa` | admin | HU-32 CA3 |
| POST | `/campanas/estimar` | admin | HU-35 CA1, CA2 |
| POST | `/campanas` | admin | HU-35 CA3, CA4 |
| GET | `/campanas` | admin | HU-35 |
| POST | `/ordenes/{id}/novedades` | admin, operario | HU-37 |
| POST | `/ordenes/{id}/novedades/{nid}/fotos` | admin, operario | HU-37 CA2 |
| GET | `/publico/recordatorios/{token}/desactivar` | publico | HU-36 CA3 |
| GET | `/consumo` | admin | HU-39 |
| GET | `/plataforma/consumo` | plataforma | HU-39 CA3 |
| GET / PUT | `/plataforma/planes` | plataforma | HU-39 CA1 |

### Producción (F8)

| Método | Ruta | Rol | HU |
|---|---|---|---|
| GET | `/metricas` | plataforma | HU-48 CA1 |
