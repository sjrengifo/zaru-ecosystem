# F3 — Órdenes y operación en tiempo real: Plan técnico

## 1. Resumen del enfoque
Las operaciones que tocan varias tablas (crear orden, cambiar estado) se implementan como **funciones SQL transaccionales** invocadas por el servicio, de modo que orden, servicios, historial y evento se escriben juntos o no se escriben. La máquina de estados vive en el servicio (fácil de probar) y la función SQL vuelve a validar la transición con bloqueo de fila. Un middleware de idempotencia guarda la respuesta de cada `Idempotency-Key`.

## 2. Cambios en el modelo de datos
Migración `<ts>_ordenes_y_operacion.sql`:

| Objeto | Cambio | RF |
|---|---|---|
| `estado_orden` | `alter type estado_orden add value 'secado' before 'listo'` (migración separada: no puede ir en la misma transacción que su uso) | RF-F3-05 |
| `ordenes` | `codigo_seguimiento text unique not null`, `entrega_estimada_at`, `observaciones`, `version int default 1` | RF-F3-01, RF-F3-04, RNF-F3-03 |
| `historial_estados` | `estado_anterior`, `revertido bool default false` | RF-F3-06, RF-F3-07 |
| `eventos` | Nueva (ver modelo) | RF-F3-08 |
| `idempotencia` | Nueva; job de limpieza de registros > 24 h | RF-F3-13 |
| Índices | `ordenes (establecimiento_id, estado) where estado <> 'entregado'`, `ordenes (vehiculo_id, created_at desc)`, `eventos (procesado_at) where procesado_at is null` | RNF-F3-02 |
| Índice único parcial | `ordenes (vehiculo_id) where estado <> 'entregado'` | RF-F3-03 |
| `privado.crear_orden(...)` | Valida servicios activos del tenant, copia precios, calcula totales y entrega estimada, genera código, inserta orden, servicios, historial inicial y evento | RF-F3-01, 02, 04, 08 |
| `privado.cambiar_estado_orden(orden, estado, usuario, revertir)` | `select … for update`, valida transición o reversión ≤ 60 s, actualiza, inserta historial y evento | RF-F3-05 a 09 |

## 3. Contrato de API

| Método | Ruta | Rol | Petición | Respuesta | RF |
|---|---|---|---|---|---|
| POST | `/ordenes` | admin, operario | `Idempotency-Key` · `{ vehiculoId, servicioIds[], observaciones? }` o `{ nuevoVehiculo: { cliente, autorizaciones, vehiculo }, servicioIds[] }` | `201 Orden` | RF-F3-01 a 04 |
| GET | `/ordenes` | admin, operario | `?estado&desde&hasta&placa` + paginación | `Pagina<OrdenResumen>` | RF-F3-10 |
| GET | `/ordenes/{id}` | admin, operario | — | `Orden` + `servicios` + `historial` | RF-F3-06 |
| PATCH | `/ordenes/{id}/estado` | admin, operario | `Idempotency-Key` · `{ estado }` o `{ revertir: true }` | `Orden` · `409` | RF-F3-05 a 09 |
| GET | `/dashboard` | admin, operario | `?fecha` (por defecto hoy, zona Bogotá) | `{ columnas: { recibido[], en_lavado[], secado[], listo[], entregado[] }, resumen: { atendidos, ingresos, enCurso, demoradas } }` | RF-F3-10, 11 |

## 4. Diseño de módulos

| Componente | Comportamiento |
|---|---|
| `modules/ordenes/estado.js` | Tabla de transiciones permitidas y función pura `validarTransicion(actual, nuevo)` |
| `ordenes.service.js` | Valida con `estado.js` (falla rápido) y llama a la función SQL; traduce errores SQL (`P0001`) a `AppError` |
| `modules/dashboard` | Una consulta de órdenes del día con sus servicios y el último cambio de estado; calcula `demorada = now - estado_desde > suma(duracion_min)` con `clock` |
| `middlewares/idempotencia.js` | Sin clave → `400` en rutas que la exigen. Clave nueva → procesa y guarda status y cuerpo. Clave existente con mismo hash de cuerpo → devuelve lo guardado. Hash distinto → `422 IDEMPOTENCIA_CONFLICTO`. Concurrencia: `insert … on conflict do nothing` antes de procesar para reservar la clave. |

## 5. Reglas de negocio

| Regla | Implementación | Error |
|---|---|---|
| Transiciones: `recibido→en_lavado`, `en_lavado→secado`, `en_lavado→listo`, `secado→listo`, `listo→entregado` | `estado.js` + función SQL | `409 CONFLICTO` |
| Reversión solo del último cambio, ≤ 60 s, no desde `entregado` | Función SQL compara `historial_estados.created_at` | `409` |
| Una orden activa por vehículo | Índice único parcial | `409` |
| Servicios activos y del mismo tenant | Función SQL | `400` |
| Cliente anonimizado | No admite órdenes | `409` |
| Código de seguimiento | Alfabeto `23456789ABCDEFGHJKMNPQRSTUVWXYZ`, 10 caracteres, reintento ante colisión | — |

## 6. Estrategia de pruebas

| Nivel | Qué se prueba |
|---|---|
| Unitarias | Tabla completa de transiciones (válidas e inválidas), cálculo de demora con reloj falso, middleware de idempotencia con repositorio falso |
| Integración | ESC-F3-01 a ESC-F3-08; atomicidad de `crear_orden`; concurrencia: dos `PATCH` simultáneos a la misma orden dejan un solo cambio |
| Tiempo real | ESC-F3-09 con dos clientes `supabase-js` autenticados en Supabase local |
| Aislamiento | Agregar `ordenes/{id}`, `ordenes/{id}/estado` |
| Rendimiento | 100 órdenes activas: dashboard < 500 ms; 200 cambios de estado: p95 < 300 ms |

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| `alter type … add value` no es transaccional | Migración propia, previa a las que usan el valor |
| Lógica duplicada entre servicio y SQL | La fuente de verdad es la función SQL; `estado.js` solo adelanta el error y se prueba contra la misma tabla de casos |
| Crecimiento de `idempotencia` y `eventos` | Limpieza programada (`pg_cron`) de registros procesados > 24 h / > 30 días |
