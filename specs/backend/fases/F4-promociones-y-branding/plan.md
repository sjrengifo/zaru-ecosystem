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
| `privado.hoy_bogota()`, `privado.estado_promocion(...)` | Fecha de hoy en Bogotá y estado `programada`, `vigente`, `vencida` o `desactivada` (inicio y fin incluidos) | RF-F4-02 |
| Vistas `promociones_con_estado` y `promociones_vigentes` | Con `security_invoker`: respetan el RLS de quien consulta. La primera trae `estado` y `servicios` (jsonb) | RF-F4-02, RF-F4-06 |
| `public.guardar_promocion(...)` | Crea o edita la promoción y reemplaza sus servicios en una sola transacción; rechaza servicios de otra sede | RF-F4-01, RF-F4-03 |
| `public.mejor_promocion(...)` | Mejor promoción vigente para un servicio en una fecha, con el descuento en pesos (ver sección 8). La usa `crear_orden` de HU-08 | RF-F4-04, RF-F4-05 |
| Storage | Bucket `logos` público, `file_size_limit = 2MB`, `allowed_mime_types = {image/png, image/jpeg}` | RF-F4-07 |

## 3. Contrato de API

| Método | Ruta | Rol | Petición | Respuesta | RF |
|---|---|---|---|---|---|
| GET | `/promociones` | admin, operario | `?estado=vigentes\|programadas\|vencidas\|todas` (por defecto `todas`) | `Promocion[]` (con `estado` y `servicios`) | RF-F4-06 |
| POST | `/promociones` | admin | `{ nombre, descripcion?, condiciones?, descuentoPct, fechaInicio, fechaFin, servicioIds[] }` | `201 Promocion` | RF-F4-01 |
| PATCH | `/promociones/{id}` | admin | Campos parciales + `activa` | `Promocion` | RF-F4-03 |
| GET | `/establecimiento` | admin, operario | — | `Establecimiento` con `branding` | RF-F4-09 |
| PUT | `/establecimiento/branding` | admin | `{ colorPrimario, colorSecundario }` | `Establecimiento` | RF-F4-08 |
| POST | `/establecimiento/logo` | admin | `multipart/form-data` campo `logo` | `Establecimiento` (con `logo_url`) · `400` | RF-F4-07 |

## 4. Diseño de módulos

| Componente | Comportamiento |
|---|---|
| `modules/promociones` | CRUD con validación `fechaFin >= fechaInicio` y servicios del mismo tenant |
| `modules/establecimiento` | Branding y logo. Usa `multer` en memoria con límite de 2 MB y detecta el formato real por la firma binaria (`shared/logo.js`; para dos formatos no hace falta `file-type`). Sube con `req.tenant.archivos('logos')`, que limita todo a `logos/{establecimientoId}/`, guarda `logo-{timestamp}.{ext}` y borra el logo anterior. |

## 5. Reglas de negocio

| Regla | Implementación | Error |
|---|---|---|
| Descuento por servicio = precio × pct de la mejor promoción vigente | `mejor_promocion` | — |
| Empate en el porcentaje | `mejor_promocion`: la creada primero y, si coincide, el id menor (sección 8) | — |
| Una promoción nueva no termina antes de hoy (Bogotá) | zod | `400` |
| Desactivar no borra (no hay `DELETE`): una orden puede seguir apuntando a su promoción | Rutas | — |
| Redondeo a pesos enteros | `round(…, 0)` | — |
| Servicios de la promoción del mismo tenant | Validación en servicio | `400` |
| Archivo PNG/JPG ≤ 2 MB por contenido | `multer` + firma binaria | `400 VALIDACION` |

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

## 8. Mejor promoción por servicio y uso desde HU-08

`public.mejor_promocion(p_establecimiento_id, p_servicio_id, p_fecha default null, p_precio default null)` devuelve como máximo una fila `(promocion_id, nombre, descuento_pct, descuento)`, o ninguna si no hay promoción vigente:

- `p_fecha` null significa hoy en Bogotá.
- `descuento = round(p_precio × descuento_pct / 100, 0)`, en pesos enteros (null si no se envía precio).
- Solo cuentan promociones activas, del mismo establecimiento, que incluyan el servicio y estén vigentes en esa fecha.

**Regla de desempate (determinista).** Se ordena por:

1. Mayor `descuento_pct` (RF-F4-05).
2. Si empatan, la promoción **creada primero** (`created_at` menor). Así, crear una promoción nueva con el mismo porcentaje no cambia la que ya se venía aplicando ese día.
3. Si también coinciden, el **`id` menor**, para que dos consultas iguales devuelvan siempre la misma.

Cualquiera de las empatadas da el mismo descuento; la regla solo fija cuál queda registrada en la orden. Pruebas: `database/pruebas/09_promociones.sql` (desempates 1 y 2).

**Cómo debe usarla `crear_orden` (HU-08):**

```sql
-- Dentro de crear_orden, por cada servicio de la orden (precio ya copiado del catálogo):
select m.promocion_id, coalesce(m.descuento, 0)
  into v_promocion_id, v_descuento
from (select 1) x
left join lateral public.mejor_promocion(p_establecimiento_id, v_servicio.id, privado.hoy_bogota(), v_servicio.precio) m on true;
```

- Guardar en `orden_servicios` el descuento y la promoción aplicada (columnas `descuento numeric(12,2) default 0` y `promocion_id` que agrega la migración de HU-08).
- `ordenes.descuento` = suma de los descuentos y `ordenes.total = subtotal − descuento`. Con ESC-F4-03: 55 000 − 6 000 = 49 000.
- Calcularlo una sola vez, al crear la orden. Editar o desactivar una promoción después no cambia órdenes existentes.
- Desde el backend se puede llamar con `req.tenant.rpc('mejor_promocion', { p_servicio_id, p_precio })`: el establecimiento lo pone la sesión.
- Es `security definer` y solo la ejecuta `service_role`; `crear_orden` la puede llamar porque corre como su dueño.
