# F3 — Órdenes y operación en tiempo real: Especificación

| Campo | Valor |
|---|---|
| Estado | Borrador |
| Épicas | ZARU-1, ZARU-48 |
| Historias | HU-08 (ZARU-9), HU-09 (ZARU-10), HU-10 (ZARU-11), HU-11 (ZARU-12), HU-45 CA1 (ZARU-52, para el panel), HU-54 (ZARU-61), HU-16 (ZARU-68) |
| Depende de | F2 · DA-02 confirmada |
| Puntos | 51 (Jira) · Sprint 1 |

## 1. Objetivo
Soportar la operación diaria del car wash: registrar el ingreso de un vehículo con los servicios solicitados, avanzar su estado con trazabilidad completa, alimentar un dashboard en tiempo real con alertas de demora, y garantizar que una acción repetida por reintento o falla de red no genere registros duplicados. Cada cambio de estado deja un evento listo para que el motor de notificaciones (F6) lo consuma.

## 2. Requisitos funcionales

| ID | Requisito | Origen |
|---|---|---|
| RF-F3-01 | Crear una orden para un vehículo registrado con uno o más servicios activos; el sistema calcula subtotal y total, deja la orden en `recibido` y genera un código de seguimiento único. | HU-08 CA1 |
| RF-F3-02 | Crear la orden indicando una placa no registrada junto con los datos del cliente y del vehículo, en una sola operación atómica (incluye la autorización de datos de F2). | HU-08 CA2 |
| RF-F3-03 | No se permite más de una orden activa (no entregada) por vehículo. | HU-08 (regla derivada) |
| RF-F3-04 | Cada orden guarda el precio y la duración de cada servicio al momento de crearla, y calcula la hora estimada de entrega. | HU-07 CA2, HU-11 |
| RF-F3-05 | Avanzar el estado según el flujo `recibido → en_lavado → (secado) → listo → entregado`; cualquier otra transición responde `409`. | HU-10 CA1, DA-02 |
| RF-F3-06 | Cada cambio de estado registra estado anterior, nuevo, usuario y hora en `historial_estados`. | HU-10 CA1 |
| RF-F3-07 | Revertir el último cambio de estado está permitido durante los 60 segundos siguientes; el registro se marca como revertido. | HU-28 CA3 |
| RF-F3-08 | Cada cambio o reversión de estado genera, en la misma transacción, un evento `orden.estado_cambiado` en la tabla de eventos para el motor de notificaciones. | HU-10 CA2 |
| RF-F3-09 | Al pasar a `entregado`, la orden se cierra con `entregada_at` y pasa a formar parte del historial del vehículo. | HU-10 CA3 |
| RF-F3-10 | `GET /dashboard` devuelve las órdenes del día agrupadas por estado con placa, servicios, hora de ingreso y hora estimada, más el resumen del día: vehículos atendidos e ingresos. | HU-09 CA1, CA3 |
| RF-F3-11 | Cada orden del dashboard indica si está demorada: tiempo en el estado actual mayor que la duración estimada de sus servicios. | HU-11 CA1, CA2 |
| RF-F3-12 | Los cambios en `ordenes` se publican por Supabase Realtime solo a usuarios del mismo establecimiento. | HU-09 CA2, HU-45 CA1 |
| RF-F3-13 | `POST /ordenes` y `PATCH /ordenes/{id}/estado` son idempotentes con `Idempotency-Key`: un reintento con la misma clave devuelve la misma respuesta sin crear registros nuevos. | HU-54 CA1 |
| RF-F3-14 | `POST /ordenes/sincronizar` recibe un lote de acciones pendientes del dispositivo, cada una con su `Idempotency-Key` y hora local, y las aplica en el orden en que se realizaron. | HU-54 CA2 |
| RF-F3-15 | `GET /reportes/servicios?desde&hasta` devuelve el ranking de servicios por número de órdenes e ingresos. | HU-16 CA1 |
| RF-F3-16 | `GET /reportes/afluencia?desde&hasta` devuelve el número de vehículos por franja horaria y día de la semana; sin órdenes en el rango, responde una lista vacía con `sinDatos: true`. | HU-16 CA2, CA3 |

## 3. Requisitos no funcionales

| ID | Requisito | Medida |
|---|---|---|
| RNF-F3-01 | Cambiar el estado responde en menos de 300 ms (p95). | Prueba de rendimiento local |
| RNF-F3-02 | `GET /dashboard` responde en menos de 500 ms con 100 órdenes activas. | Prueba de rendimiento |
| RNF-F3-03 | Dos operarios que cambian el estado de la misma orden al mismo tiempo no dejan el historial inconsistente. | Bloqueo optimista con `version` o `select … for update` |
| RNF-F3-04 | El código de seguimiento no es adivinable. | 10 caracteres de un alfabeto sin ambigüedades (≈ 50 bits) |

## 4. Escenarios de aceptación

**ESC-F3-01 — Crear orden** (RF-F3-01, RF-F3-04 · HU-08 CA1)
- **Dado** el vehículo ABC123 y los servicios "Lavado básico" (25 000) y "Lavado de motor" (30 000)
- **Cuando** creo la orden
- **Entonces** recibo `201` con total 55 000, estado `recibido`, `codigoSeguimiento` y `entregaEstimadaAt` = ahora + 70 min.

**ESC-F3-02 — Orden con vehículo nuevo** (RF-F3-02 · HU-08 CA2)
- **Dado** la placa XYZ987 sin registrar
- **Cuando** creo la orden con los datos del cliente, su autorización y del vehículo
- **Entonces** se crean cliente, consentimiento, vehículo y orden; si cualquiera falla, no se crea nada.

**ESC-F3-03 — Avanzar estado** (RF-F3-05, RF-F3-06, RF-F3-08 · HU-10 CA1, CA2)
- **Dado** una orden en `recibido`
- **Cuando** el operario la pasa a `en_lavado`
- **Entonces** el historial registra usuario y hora, y existe un evento `orden.estado_cambiado`.

**ESC-F3-04 — Transición inválida** (RF-F3-05)
- **Dado** una orden en `recibido`
- **Cuando** intento pasarla a `entregado`
- **Entonces** recibo `409` y el estado no cambia.

**ESC-F3-05 — Reversión** (RF-F3-07 · HU-28 CA3)
- **Dado** una orden que pasó a `listo` hace 30 segundos
- **Cuando** el operario revierte el cambio
- **Entonces** vuelve a `en_lavado`, el registro queda marcado `revertido` y se genera un evento de reversión.

**ESC-F3-06 — Entrega** (RF-F3-09 · HU-10 CA3)
- **Dado** una orden en `listo`
- **Cuando** pasa a `entregado`
- **Entonces** aparece en `GET /vehiculos/{id}/historial`.

**ESC-F3-07 — Dashboard y demora** (RF-F3-10, RF-F3-11 · HU-09 CA1, CA3, HU-11 CA1)
- **Dado** una orden con servicios de 30 minutos que lleva 35 minutos en `en_lavado`
- **Cuando** consulto el dashboard
- **Entonces** aparece en la columna `en_lavado` con `demorada: true`, y el resumen incluye los vehículos entregados y los ingresos del día.

**ESC-F3-08 — Reintento idempotente** (RF-F3-13 · HU-54 CA1)
- **Dado** un cambio de estado enviado con `Idempotency-Key: k1`
- **Cuando** el dispositivo reenvía la misma petición con `k1`
- **Entonces** recibe la misma respuesta y el historial tiene un solo registro.

**ESC-F3-09 — Tiempo real aislado** (RF-F3-12 · HU-09 CA2)
- **Dado** dos administradores de establecimientos distintos suscritos a `ordenes`
- **Cuando** cambia una orden del establecimiento A
- **Entonces** solo el administrador de A recibe el evento.

## 5. Fuera de alcance
- Envío de notificaciones (F6): esta fase solo deja el evento.
- Almacenamiento local de acciones sin conexión y su reenvío automático (HU-55, frontend); el backend garantiza la idempotencia y el orden (HU-54).
- Aplicación de promociones al total (F4).
- Novedades del operario (F7).

## 6. Decisiones abiertas relacionadas
- **DA-02** Estados del servicio — debe confirmarse antes de iniciar.
