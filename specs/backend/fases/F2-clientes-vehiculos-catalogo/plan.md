# F2 — Clientes, vehículos, catálogo y datos personales: Plan técnico

## 1. Resumen del enfoque
Las autorizaciones salen de la tabla `clientes` y pasan a `consentimientos`, una tabla de solo inserción que funciona como evidencia legal. El registro de cliente se hace con una función SQL transaccional que crea el cliente y sus consentimientos juntos. Se completan los módulos `clientes`, `vehiculos` y `servicios`, y se agrega la anonimización.

## 2. Cambios en el modelo de datos
Migración `<ts>_clientes_y_datos_personales.sql`:

| Objeto | Cambio | RF |
|---|---|---|
| `politicas_datos` | Nueva; seed con la versión `1.0` | RF-F2-10 |
| `consentimientos` | Nueva; enum `tipo_consentimiento`; sin permisos de `update`/`delete` | RF-F2-04 |
| Datos existentes | Por cada cliente actual se inserta un consentimiento `tratamiento_datos` con su `fecha_autorizacion` y versión `1.0` | RF-F2-04 |
| `clientes` | Se renombra `telefono` → `celular` (y su restricción única); se eliminan `autorizacion_datos` y `fecha_autorizacion`; se agregan `celular_verificado_at`, `anonimizado_at` | RF-F2-01, RF-F2-09 |
| `vehiculos` | `recordatorios_activos bool default true` | (F7) |
| `servicios` | `incluye_rain_insure bool default false`, `rain_insure_horas int check (rain_insure_horas > 0)`; `orden_servicios.rain_insure_hasta timestamptz` (HU-15) | RF-F2-16 |
| `solicitudes_titular` | Nueva | RF-F2-09 |
| Extensión `pg_trgm` + `unaccent` | Índice `gin` sobre `unaccent(lower(nombre))` | RF-F2-07 |
| Vista `consentimientos_vigentes` | Último registro por (`cliente_id`, `tipo`) | RF-F2-05 |
| Función `crear_cliente_con_consentimiento(...)` | Inserta cliente y consentimientos en una transacción; falla si `tratamiento_datos` no está otorgado | RF-F2-02, RNF-F2-02 |
| Función `anonimizar_cliente(id, usuario_id)` | Reemplaza datos personales por `anonimo-<hash>` y registra la solicitud | RF-F2-09 |

Ambas funciones se crean en el esquema `privado` con `security definer` y permisos solo para `service_role`.

## 3. Contrato de API

| Método | Ruta | Rol | Petición | Respuesta | RF |
|---|---|---|---|---|---|
| GET | `/politicas-datos/vigente` | publico | — | `{ version, url }` | RF-F2-10 |
| GET | `/clientes` | admin, operario | `?buscar&pagina&tamano` | `Pagina<ClienteResumen>` | RF-F2-07 |
| POST | `/clientes` | admin, operario | `{ nombre, celular, correo?, autorizaciones: { tratamientoDatos, notificacionesServicio, comerciales } }` | `201 Cliente` · `409` | RF-F2-01 a 06 |
| GET | `/clientes/{id}` | admin, operario | — | `Cliente` + `vehiculos` + `autorizacionesVigentes` | RF-F2-14 |
| PATCH | `/clientes/{id}` | admin, operario | `{ nombre?, celular?, correo? }` | `Cliente` | RF-F2-08 |
| GET | `/clientes/{id}/consentimientos` | admin | — | `Consentimiento[]` | RF-F2-05 |
| POST | `/clientes/{id}/consentimientos` | admin, operario | `{ tipo, otorgado }` | `201 Consentimiento` | RF-F2-04 |
| POST | `/clientes/{id}/anonimizar` | admin | `{ motivo }` | `204` | RF-F2-09 |
| GET | `/vehiculos` | admin, operario | `?placa&clienteId` | `Vehiculo[]` | RF-F2-11 |
| POST | `/vehiculos` | admin, operario | `{ clienteId, placa, tipo, marca?, color? }` | `201 Vehiculo` · `409` | RF-F2-11 a 13 |
| GET | `/vehiculos/{id}` | admin, operario | — | `Vehiculo` + `cliente` | RF-F2-14 |
| PATCH | `/vehiculos/{id}` | admin, operario | `{ tipo?, marca?, color? }` | `Vehiculo` | RF-F2-11 |
| GET | `/vehiculos/{id}/historial` | admin, operario | paginación | `Pagina<ServicioHistorial>` | RF-F2-15 |
| GET | `/servicios` | admin, operario | `?activo` | `Servicio[]` | RF-F2-18 |
| POST | `/servicios` | admin | `{ nombre, precio, duracionMin, incluyeRainInsure?, rainInsureDias? }` | `201 Servicio` | RF-F2-16 |
| PATCH | `/servicios/{id}` | admin | campos parciales + `activo` | `Servicio` | RF-F2-17, 18 |

Los campos del API usan `camelCase`; el repositorio traduce a `snake_case`.

## 4. Reglas de negocio

| Regla | Implementación | Error |
|---|---|---|
| Celular colombiano | `^3\d{9}$` | `400` |
| Placa normalizada | `toUpperCase().replace(/[\s-]/g, '')` antes de validar | `400` si no cumple el formato |
| Sin autorización, sin datos | Validación zod + función SQL (doble barrera) | `400` |
| Revocar `tratamiento_datos` | No se permite por este endpoint; se gestiona con anonimización | `409` |
| Cliente anonimizado | No se puede editar ni recibir órdenes nuevas | `409` |
| Rain Insure | Si `incluyeRainInsure`, `rainInsureDias` es obligatorio | `400` |

## 5. Estrategia de pruebas

| Nivel | Qué se prueba |
|---|---|
| Unitarias | Normalización y validación de placa y celular, reglas de Rain Insure |
| Integración | ESC-F2-01 a ESC-F2-10; atomicidad (si falla el consentimiento, no queda cliente) |
| Aislamiento | Agregar `clientes/{id}`, `vehiculos/{id}`, `vehiculos/{id}/historial`, `servicios/{id}`, `clientes/{id}/consentimientos` |
| Rendimiento | Script que genera 5 000 clientes y mide la búsqueda (RNF-F2-01) |

## 6. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Pérdida de evidencia al migrar la columna de autorización | La migración copia a `consentimientos` antes de eliminar la columna; prueba de migración con datos |
| Búsqueda por placa y nombre lenta | Índices `pg_trgm` y búsqueda por placa exacta normalizada |
| Anonimización incompleta | Prueba que recorre todas las columnas de texto del cliente y verifica que no queda el dato original |
