# F7 — Comunicación avanzada: Especificación

| Campo | Valor |
|---|---|
| Estado | Borrador |
| Épicas | ZARU-15 |
| Historias | HU-18 (ZARU-21), HU-21 (ZARU-24), HU-22 (ZARU-25), HU-23 (ZARU-26), HU-25 (ZARU-28) |
| Depende de | F4, F6 · DA-12 confirmada |
| Puntos estimados | 29 |

## 1. Objetivo
Dar al establecimiento herramientas para comunicarse con sus clientes más allá del cambio de estado: plantillas con su marca, campañas de promociones segmentadas y sin saturar, recordatorios del próximo lavado y mensajes del operario sobre novedades del vehículo. A la vez, la plataforma controla el consumo de SMS y correos de cada sede según su plan.

## 2. Requisitos funcionales

### Plantillas (HU-18)

| ID | Requisito | Origen |
|---|---|---|
| RF-F7-01 | El administrador edita el texto de la plantilla de cada evento y canal, con las variables `{nombre_cliente}`, `{placa}`, `{estado}`, `{sede}`, `{hora}`. | HU-18 CA1 |
| RF-F7-02 | Para SMS, la respuesta incluye el número de caracteres y de segmentos; con más de 160 caracteres se advierte que se enviará en varias partes. | HU-18 CA2 |
| RF-F7-03 | La vista previa devuelve el mensaje renderizado para push, SMS y correo con datos de ejemplo y el branding de la sede. | HU-18 CA3 |
| RF-F7-04 | Una plantilla con una variable inexistente o mal escrita no se guarda y la respuesta señala la variable inválida y su posición. | HU-18 CA4 |
| RF-F7-05 | Si la sede no personalizó una plantilla, se usa la de la plataforma. | HU-18 (regla derivada) |

### Campañas de promociones (HU-21)

| ID | Requisito | Origen |
|---|---|---|
| RF-F7-06 | Una campaña se crea sobre una promoción vigente con segmentación por: días sin visita (30, 60 o 90), servicios usados y tipo de vehículo. | HU-21 CA1 |
| RF-F7-07 | Antes de confirmar, el sistema devuelve el número de destinatarios, excluyendo a quienes no autorizaron comunicaciones comerciales. | HU-21 CA2, HU-16 CA2 |
| RF-F7-08 | Un cliente que ya recibió 2 mensajes comerciales de la sede en los últimos 7 días se excluye. | HU-21 CA3 |
| RF-F7-09 | Un envío programado entre las 8:00 p. m. y las 7:00 a. m. (Bogotá) se reprograma para las 7:00 a. m. siguientes. | HU-21 CA4 |
| RF-F7-10 | Cada mensaje comercial incluye el enlace de baja (F6). | HU-16 CA3 |

### Recordatorios (HU-22)

| ID | Requisito | Origen |
|---|---|---|
| RF-F7-11 | Con al menos 3 servicios entregados del mismo vehículo en la sede, se calcula su frecuencia promedio y se programa un recordatorio un día antes de la fecha estimada del próximo lavado. | HU-22 CA1 |
| RF-F7-12 | Si el vehículo recibe un servicio antes del recordatorio, este se cancela y se recalcula. | HU-22 CA2 |
| RF-F7-13 | El enlace "no volver a recordarme" desactiva los recordatorios del vehículo sin afectar las notificaciones de estado. | HU-22 CA3 |
| RF-F7-14 | Los recordatorios requieren autorización `comerciales` y respetan el horario de envío de RF-F7-09. | Ley 1581 · HU-21 CA4 |

### Novedades del operario (HU-23)

| ID | Requisito | Origen |
|---|---|---|
| RF-F7-15 | Sobre una orden en curso, el operario envía una novedad de tipo `demora`, `dano_preexistente`, `objeto_encontrado` u `otro`, con texto opcional de hasta 300 caracteres. | HU-23 CA1 |
| RF-F7-16 | Las novedades de daño preexistente admiten hasta 3 fotos (JPG/PNG, máx. 5 MB c/u) que quedan como evidencia en el historial del servicio. | HU-23 CA2 |
| RF-F7-17 | Una novedad de demora indica minutos adicionales y actualiza la hora estimada de entrega que ve el cliente en su seguimiento. | HU-23 CA3 |
| RF-F7-18 | La novedad se notifica de inmediato al cliente (sin ventana de gracia) por sus canales activos. | HU-23 |

### Consumo por plan (HU-25)

| ID | Requisito | Origen |
|---|---|---|
| RF-F7-19 | Cada plan define un cupo mensual de SMS y de correos. | HU-25 CA1 |
| RF-F7-20 | Al alcanzar el 80 % del cupo se notifica al administrador de la sede y al de la plataforma (una sola vez por mes y canal). | HU-25 CA1 |
| RF-F7-21 | Con el cupo de SMS agotado, las notificaciones operativas se envían por push o correo si el cliente los tiene activos; las comerciales por SMS se omiten. | HU-25 CA2 |
| RF-F7-22 | El administrador de la plataforma consulta el consumo del mes por establecimiento frente a su cupo. | HU-25 CA3 (ver DA-12) |
| RF-F7-23 | El administrador de la sede consulta su propio consumo del mes. | HU-25 |

## 3. Requisitos no funcionales

| ID | Requisito | Medida |
|---|---|---|
| RNF-F7-01 | Estimar destinatarios de una campaña tarda menos de 2 s con 5 000 clientes. | Prueba de rendimiento |
| RNF-F7-02 | Una campaña no satura la cola: los mensajes se encolan con prioridad menor que los operativos. | Columna `prioridad` en `notificaciones` |
| RNF-F7-03 | Las fotos de evidencia solo son accesibles por el establecimiento mediante URL firmada. | Bucket privado `evidencias` |

## 4. Escenarios de aceptación

**ESC-F7-01 — Variable inválida** (RF-F7-04 · HU-18 CA4)
- **Dado** el texto "Hola {nombre_clente}"
- **Cuando** guardo la plantilla
- **Entonces** recibo `400` señalando `{nombre_clente}`.

**ESC-F7-02 — SMS largo** (RF-F7-02 · HU-18 CA2)
- **Dado** una plantilla SMS de 200 caracteres
- **Cuando** la guardo
- **Entonces** la respuesta incluye `caracteres: 200`, `segmentos: 2` y la advertencia de mayor costo.

**ESC-F7-03 — Vista previa** (RF-F7-03 · HU-18 CA3)
- **Dado** una plantilla editada
- **Cuando** pido la vista previa
- **Entonces** recibo el texto renderizado por canal con datos de ejemplo y el logo y colores de la sede.

**ESC-F7-04 — Estimación con exclusiones** (RF-F7-07, RF-F7-08 · HU-21 CA2, CA3)
- **Dado** 10 clientes del segmento, 2 sin autorización comercial y 1 con 2 promociones esta semana
- **Cuando** estimo la campaña
- **Entonces** el total es 7 y el detalle de exclusiones es `{ sinAutorizacion: 2, limiteSemanal: 1 }`.

**ESC-F7-05 — Horario nocturno** (RF-F7-09 · HU-21 CA4)
- **Dado** una campaña programada a las 9:30 p. m.
- **Cuando** la confirmo
- **Entonces** queda programada para las 7:00 a. m. del día siguiente.

**ESC-F7-06 — Programación del recordatorio** (RF-F7-11 · HU-22 CA1)
- **Dado** un vehículo con servicios el 1, el 11 y el 21 del mes
- **Cuando** se entrega el tercero
- **Entonces** se programa un recordatorio para el día 30 (próximo estimado: día 31).

**ESC-F7-07 — Cancelación por visita** (RF-F7-12 · HU-22 CA2)
- **Dado** un recordatorio programado
- **Cuando** el vehículo recibe un servicio antes
- **Entonces** el recordatorio se cancela y se programa uno nuevo.

**ESC-F7-08 — Novedad con fotos** (RF-F7-15, RF-F7-16 · HU-23 CA1, CA2)
- **Dado** una orden en `en_lavado`
- **Cuando** el operario reporta un daño preexistente con 3 fotos
- **Entonces** la novedad queda en el historial de la orden con las fotos y se notifica al cliente; una cuarta foto se rechaza.

**ESC-F7-09 — Demora** (RF-F7-17 · HU-23 CA3)
- **Dado** una orden con entrega estimada a las 10:00
- **Cuando** el operario reporta 15 minutos de demora
- **Entonces** el seguimiento del cliente muestra 10:15.

**ESC-F7-10 — Cupo al 80 %** (RF-F7-20 · HU-25 CA1)
- **Dado** un plan con 100 SMS y 79 enviados
- **Cuando** se envía el SMS 80
- **Entonces** se notifica al administrador de la sede y al de la plataforma, una sola vez.

**ESC-F7-11 — Cupo agotado** (RF-F7-21 · HU-25 CA2)
- **Dado** el cupo de SMS agotado y un cliente con SMS y correo activos
- **Cuando** su orden pasa a `listo`
- **Entonces** se envía por correo y no por SMS.

## 5. Fuera de alcance
- Editor visual de plantillas de correo (el frontend edita texto; el diseño del correo es fijo con el branding).
- Facturación y cobro de los planes.

## 6. Decisiones abiertas relacionadas
- **DA-12** Criterio CA3 de HU-25 incompleto en Jira.
