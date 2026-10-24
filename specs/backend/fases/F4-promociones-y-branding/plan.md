# F4 — Promociones y branding: Plan técnico

## 1. Resumen del enfoque
La vigencia de una promoción se calcula en la consulta (no hay tareas programadas que la desactiven), lo que garantiza que venza exactamente al terminar su fecha de fin. La función `crear_orden` de F3 se extiende para buscar y aplicar la mejor promoción vigente por servicio. El logo se sube al backend como `multipart/form-data`, se valida y se guarda en Supabase Storage.

## 2. Cambios en el modelo de datos
Migración `<ts>_promociones_y_branding.sql`:

| Objeto | Cambio | RF |
|---|---|---|
| `promociones` | `descripcion`, `condiciones`, `activa bool default true` | RF-F4-01, RF-F4-03 |
| `orden_servicios` | `descuento numeric(12,2) default 0`, `promocion_id` | RF-F4-04 |
| `ordenes` | `promocion_id` (la de mayor descuento aplicada) | RF-F4-04 |
| `establecimientos` | `check (color_primario ~ '^#[0-9A-Fa-f]{6}$')` y lo mismo para el secundario | RF-F4-08 |
| Vista `promociones_vigentes` | `activa and current_date at time zone 'America/Bogota' between fecha_inicio and fecha_fin` | RF-F4-02 |
| `privado.crear_orden` | Se reemplaza para calcular descuento por servicio con la mejor promoción vigente | RF-F4-04, RF-F4-05 |
| Storage | Bucket `logos` público, `file_size_limit = 2MB`, `allowed_mime_types = {image/png, image/jpeg}` | RF-F4-07 |

## 3. Contrato de API

| Método | Ruta | Rol | Petición | Respuesta | RF |
|---|---|---|---|---|---|
| GET | `/promociones` | admin, operario | `?estado=vigentes\|programadas\|vencidas\|todas` | `Promocion[]` (con `estado` calculado) | RF-F4-06 |
| POST | `/promociones` | admin | `{ nombre, descripcion?, condiciones?, descuentoPct, fechaInicio, fechaFin, servicioIds[] }` | `201 Promocion` | RF-F4-01 |
| PATCH | `/promociones/{id}` | admin | Campos parciales + `activa` | `Promocion` | RF-F4-03 |
| GET | `/establecimiento` | admin, operario | — | `Establecimiento` con `branding` | RF-F4-09 |
| PUT | `/establecimiento/branding` | admin | `{ colorPrimario, colorSecundario }` | `Branding` | RF-F4-08 |
| POST | `/establecimiento/logo` | admin | `multipart/form-data` campo `logo` | `{ logoUrl }` · `400` | RF-F4-07 |

## 4. Diseño de módulos

| Componente | Comportamiento |
|---|---|
| `modules/promociones` | CRUD con validación `fechaFin >= fechaInicio` y servicios del mismo tenant |
| `modules/establecimiento` | Branding y logo. Usa `multer` en memoria con límite de 2 MB y `file-type` para detectar el formato real. Guarda en `logos/{establecimientoId}/logo-{timestamp}.{ext}` y borra el logo anterior. |

## 5. Reglas de negocio

| Regla | Implementación | Error |
|---|---|---|
| Descuento por servicio = precio × pct de la mejor promoción vigente | Función SQL | — |
| Redondeo a pesos enteros | `round(…, 0)` | — |
| Servicios de la promoción del mismo tenant | Validación en servicio | `400` |
| Archivo PNG/JPG ≤ 2 MB por contenido | `multer` + `file-type` | `400 VALIDACION` |

## 6. Estrategia de pruebas

| Nivel | Qué se prueba |
|---|---|
| Unitarias | Cálculo del estado de una promoción con reloj falso (incluidos los bordes de fecha a medianoche en Bogotá) |
| Integración | ESC-F4-01 a ESC-F4-06; un archivo `.png` renombrado que no es imagen se rechaza |
| Aislamiento | Agregar `promociones/{id}` |

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Errores de zona horaria en el vencimiento | Cálculo siempre con `America/Bogota` y pruebas en los bordes |
| Logos huérfanos en Storage | Borrar el anterior al subir uno nuevo |
