# F4 — Promociones y branding: Especificación

| Campo | Valor |
|---|---|
| Estado | Borrador |
| Épicas | ZARU-1 |
| Historias | HU-12 (ZARU-13), HU-13 (ZARU-14) |
| Depende de | F3 |
| Puntos | 10 (Jira) · Sprint 1 |

## 1. Objetivo
Permitir que cada establecimiento cree promociones con vigencia que se apliquen automáticamente al total de las órdenes, y que configure su logo y colores para que su identidad se muestre en todos los canales hacia el cliente final.

## 2. Requisitos funcionales

### Promociones

| ID | Requisito | Origen |
|---|---|---|
| RF-F4-01 | El administrador crea promociones con nombre, descripción, condiciones, porcentaje de descuento (1–100), fecha de inicio, fecha de fin y servicios aplicables (al menos uno). | HU-12 CA1, HU-27 |
| RF-F4-02 | Una promoción está **vigente** si está activa y la fecha actual (zona Bogotá) está entre su inicio y su fin, ambos incluidos. Al pasar la fecha de fin deja de estar vigente sin intervención manual. | HU-12 CA2 |
| RF-F4-03 | El administrador puede editar o desactivar una promoción; los cambios no alteran órdenes ya creadas. | HU-12 |
| RF-F4-04 | Al crear una orden, si hay una promoción vigente que aplica a alguno de sus servicios, el descuento se aplica a esos servicios y la orden guarda la promoción aplicada. | HU-12 CA3 |
| RF-F4-05 | Si varias promociones aplican al mismo servicio, se usa la de mayor descuento. | HU-12 (regla derivada) |
| RF-F4-06 | El listado de promociones permite filtrar por `vigentes`, `programadas` y `vencidas`. | HU-12 |

### Branding

| ID | Requisito | Origen |
|---|---|---|
| RF-F4-07 | El administrador sube un logo PNG o JPG de máximo 2 MB; cualquier otro formato o tamaño se rechaza indicando los requisitos. | HU-13 CA1, CA3 |
| RF-F4-08 | El administrador define color primario y secundario en formato hexadecimal `#RRGGBB`. | HU-13 CA1 |
| RF-F4-09 | El branding guardado (logo, colores, nombre) queda disponible para el panel y para los canales del cliente final. | HU-13 CA2, HU-22 |

## 3. Requisitos no funcionales

| ID | Requisito | Medida |
|---|---|---|
| RNF-F4-01 | El tipo de archivo se valida por su contenido (firma binaria), no solo por la extensión. | Prueba con un `.png` que no es imagen |
| RNF-F4-02 | Los logos se sirven desde una URL pública con caché. | Bucket público `logos` |
| RNF-F4-03 | Cada sede solo puede escribir en su propia carpeta del bucket. | Ruta `logos/{establecimiento_id}/…` y políticas de Storage |

## 4. Escenarios de aceptación

**ESC-F4-01 — Crear promoción** (RF-F4-01 · HU-12 CA1)
- **Dado** un administrador
- **Cuando** crea "Martes de motor" con 20 % para "Lavado de motor" del 1 al 30 del mes
- **Entonces** recibe `201` y la promoción aparece como vigente durante esas fechas.

**ESC-F4-02 — Vencimiento automático** (RF-F4-02 · HU-12 CA2)
- **Dado** una promoción con fecha de fin ayer
- **Cuando** consulto `GET /promociones?estado=vigentes`
- **Entonces** no aparece, y no se aplica a órdenes nuevas.

**ESC-F4-03 — Descuento aplicado** (RF-F4-04 · HU-12 CA3)
- **Dado** la promoción de 20 % sobre "Lavado de motor" (30 000)
- **Cuando** creo una orden con "Lavado básico" (25 000) y "Lavado de motor"
- **Entonces** subtotal 55 000, descuento 6 000, total 49 000, y la orden referencia la promoción.

**ESC-F4-04 — Mejor promoción** (RF-F4-05)
- **Dado** dos promociones vigentes de 10 % y 20 % sobre el mismo servicio
- **Cuando** creo una orden con ese servicio
- **Entonces** se aplica la de 20 %.

**ESC-F4-05 — Logo válido** (RF-F4-07, RF-F4-09 · HU-13 CA1, CA2)
- **Dado** un PNG de 500 KB
- **Cuando** lo subo
- **Entonces** recibo la URL pública y `GET /establecimiento` la devuelve.

**ESC-F4-06 — Logo inválido** (RF-F4-07 · HU-13 CA3)
- **Dado** un archivo GIF o un PNG de 3 MB
- **Cuando** lo subo
- **Entonces** recibo `400` indicando "PNG o JPG de máximo 2 MB".

## 5. Fuera de alcance
- Vista previa del branding (la renderiza el frontend con los datos de la API).
- Envío de promociones a clientes (F7).
- Consulta pública de promociones por el cliente final (F5).

## 6. Decisiones abiertas relacionadas
- Ninguna.
