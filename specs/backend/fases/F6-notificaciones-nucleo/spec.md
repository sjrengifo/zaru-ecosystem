# F6 — Motor de notificaciones (núcleo): Especificación

| Campo | Valor |
|---|---|
| Estado | Borrador |
| Épicas | ZARU-15, ZARU-48 |
| Historias | HU-28 (ZARU-17), HU-29 (ZARU-18), HU-30 CA2 y CA3 (ZARU-19), HU-31 (ZARU-20), HU-33 (ZARU-22), HU-34 (ZARU-23), HU-38 (ZARU-27), HU-40 (ZARU-70), HU-46 (ZARU-53) |
| Depende de | F3, F5 · DA-04 y DA-09 confirmadas |
| Puntos | 42 (Jira) · Sprint 2, más HU-46 (8) en el Sprint 1 |

## 1. Objetivo
Avisar automáticamente al cliente final de cada cambio relevante del estado de su vehículo por el canal que prefiera (push, SMS o correo), respetando sus autorizaciones y la configuración de la sede, sin bloquear nunca la operación del car wash, con reintentos, canal alterno ante fallas, una bitácora consultable por el establecimiento y un centro de notificaciones para el cliente.

## 2. Requisitos funcionales

### Generación

| ID | Requisito | Origen |
|---|---|---|
| RF-F6-01 | Cada evento `orden.estado_cambiado` cuyo estado esté habilitado en la sede genera una notificación por cada canal activo y autorizado del cliente. | HU-28 CA1, HU-46 CA1 |
| RF-F6-02 | La notificación de cambio de estado incluye placa, nuevo estado y hora; la de `listo` incluye además nombre y dirección de la sede y valor a pagar en el punto físico. | HU-28 CA1, CA2 |
| RF-F6-03 | Las notificaciones se envían como máximo 30 segundos después del cambio de estado. | HU-28 CA1 |
| RF-F6-04 | Si el estado se revierte antes del envío, la notificación se cancela; si ya se envió, se envía una corrección. | HU-28 CA3 |
| RF-F6-05 | Editar datos de la orden que no sean el estado no genera notificaciones. | HU-28 CA4 |
| RF-F6-06 | Sin autorización de `notificaciones_servicio` no se genera ninguna notificación operativa. | HU-30, Ley 1581 |

### Preferencias del cliente

| ID | Requisito | Origen |
|---|---|---|
| RF-F6-07 | El cliente consulta sus canales (push, SMS, correo) con su estado activo/inactivo. | HU-29 CA1 |
| RF-F6-08 | Activar SMS exige un celular verificado con código de 6 dígitos. | HU-29 CA2 |
| RF-F6-09 | Desactivar todos los canales exige confirmación explícita (`confirmarSinCanales: true`); sin ella responde `409` con la advertencia. | HU-29 CA3 |
| RF-F6-10 | Las notificaciones se envían solo por los canales que el cliente dejó activos. | HU-29 CA4 |
| RF-F6-11 | El cliente registra su suscripción push del navegador; si rechaza el permiso o el navegador no lo soporta, conserva SMS y correo (manejo en el frontend). | HU-40 CA1, CA2, CA3 |

### Configuración de la sede

| ID | Requisito | Origen |
|---|---|---|
| RF-F6-12 | El administrador consulta los estados del flujo con un interruptor de notificación por estado. | HU-31 CA1 |
| RF-F6-13 | El estado `listo` no se puede desactivar. | HU-31 CA2 |
| RF-F6-14 | La configuración se aplica de inmediato y solo a su establecimiento. | HU-31 CA3 |

### Entrega confiable

| ID | Requisito | Origen |
|---|---|---|
| RF-F6-15 | Las notificaciones se procesan desde una cola persistente en el orden en que se generaron, sin bloquear la operación del establecimiento. | HU-46 CA2, CA3 |
| RF-F6-16 | Ante un error del proveedor se reintenta hasta 3 veces con esperas de 1, 2 y 4 minutos. | HU-33 CA1 |
| RF-F6-17 | Si se agotan los reintentos de una notificación `listo`, se envía por otro canal activo y autorizado del cliente. | HU-33 CA2 |
| RF-F6-18 | Si falla en todos los canales, la notificación queda como fallida definitiva y aparece en las alertas del dashboard con placa y celular del cliente. | HU-33 CA3 |
| RF-F6-19 | Un reintento o un envío alterno nunca produce un duplicado si el original ya fue entregado. | HU-33 CA4 |

### Bitácora y centro de notificaciones

| ID | Requisito | Origen |
|---|---|---|
| RF-F6-20 | El administrador consulta la bitácora con fecha, hora, cliente, placa, canal, tipo y estado; filtrable por placa, fechas, canal y estado. | HU-34 CA1, CA2, HU-46 CA4 |
| RF-F6-21 | La bitácora solo incluye notificaciones de su establecimiento y enmascara celulares y correos (`300****567`, `j***@correo.com`). | HU-34 CA3 |
| RF-F6-22 | El cliente consulta sus notificaciones de los últimos 90 días, de la más reciente a la más antigua, con marca de leída y un contador de no leídas. | HU-38 CA1, CA2 |
| RF-F6-23 | Cada notificación de estado incluye el enlace a su seguimiento o al detalle del servicio. | HU-38 CA3 |

### Autorizaciones comerciales

| ID | Requisito | Origen |
|---|---|---|
| RF-F6-24 | Los mensajes comerciales incluyen un enlace "dejar de recibir" que revoca la autorización `comerciales` de inmediato y muestra la confirmación. | HU-30 CA3 |
| RF-F6-25 | Los clientes sin autorización `comerciales` se excluyen de todo envío comercial. | HU-30 CA2 |

## 3. Requisitos no funcionales

| ID | Requisito | Medida |
|---|---|---|
| RNF-F6-01 | Cambiar un estado no tarda más por causa de las notificaciones. | p95 del `PATCH` igual al de F3 (± 10 %) |
| RNF-F6-02 | La bitácora filtrada responde en menos de 3 segundos con 100 000 registros. | HU-34 CA2 · prueba de rendimiento |
| RNF-F6-03 | El worker procesa al menos 30 notificaciones por minuto. | Prueba de carga con proveedor `consola` |
| RNF-F6-04 | Ningún mensaje se envía dos veces. | Clave de deduplicación única |

## 4. Escenarios de aceptación

**ESC-F6-01 — Notificación de estado** (RF-F6-01 a 03 · HU-28 CA1)
- **Dado** un cliente con push activo y autorización de notificaciones
- **Cuando** el operario pasa su orden a `en_lavado`
- **Entonces** en menos de 30 s se envía un push con placa, estado y hora.

**ESC-F6-02 — Listo para entrega** (RF-F6-02 · HU-28 CA2)
- **Dado** una orden de 55 000
- **Cuando** pasa a `listo`
- **Entonces** el mensaje incluye nombre y dirección de la sede y "Valor a pagar: $55.000".

**ESC-F6-03 — Reversión rápida** (RF-F6-04 · HU-28 CA3)
- **Dado** un cambio a `listo` revertido a los 10 s
- **Cuando** el worker procesa la cola
- **Entonces** la notificación queda `cancelada` y el cliente no recibe nada.

**ESC-F6-04 — Sin cambio de estado** (RF-F6-05 · HU-28 CA4)
- **Dado** una orden en curso
- **Cuando** se editan sus observaciones
- **Entonces** no se crea ninguna notificación.

**ESC-F6-05 — Activar SMS sin verificar** (RF-F6-08 · HU-29 CA2)
- **Dado** un cliente sin celular verificado
- **Cuando** activa SMS
- **Entonces** recibe `409` con `requiereVerificacion: true`; tras verificar con el código de 6 dígitos, el canal queda activo.

**ESC-F6-06 — Todos los canales desactivados** (RF-F6-09 · HU-29 CA3)
- **Dado** un cliente que desactiva todos los canales
- **Cuando** guarda sin confirmar
- **Entonces** recibe `409` con la advertencia; con `confirmarSinCanales: true` se guarda.

**ESC-F6-07 — Estado obligatorio** (RF-F6-13 · HU-31 CA2)
- **Dado** un administrador
- **Cuando** desactiva `listo`
- **Entonces** recibe `400` indicando que es un estado obligatorio.

**ESC-F6-08 — Estado desactivado** (RF-F6-14 · HU-31 CA3)
- **Dado** la sede A con `en_lavado` desactivado y la sede B con todo activo
- **Cuando** ambas pasan una orden a `en_lavado`
- **Entonces** solo el cliente de B es notificado.

**ESC-F6-09 — Reintentos y canal alterno** (RF-F6-16, RF-F6-17 · HU-33 CA1, CA2)
- **Dado** un proveedor push que siempre falla y un cliente con push y SMS activos
- **Cuando** la orden pasa a `listo`
- **Entonces** hay 3 reintentos a 1, 2 y 4 min y luego un envío por SMS.

**ESC-F6-10 — Falla total** (RF-F6-18 · HU-33 CA3)
- **Dado** que fallan todos los canales
- **Cuando** se agotan los intentos
- **Entonces** `GET /notificaciones/fallidas` y `GET /dashboard` muestran la alerta con placa y celular.

**ESC-F6-11 — Sin duplicados** (RF-F6-19 · HU-33 CA4)
- **Dado** un envío que el proveedor confirma tarde mientras el worker programa un reintento
- **Cuando** llega la confirmación
- **Entonces** el reintento se cancela y el cliente recibe un solo mensaje.

**ESC-F6-12 — Bitácora enmascarada** (RF-F6-20, RF-F6-21 · HU-34)
- **Dado** notificaciones de las sedes A y B
- **Cuando** el admin de A filtra por placa y canal
- **Entonces** ve solo las de A, con el celular enmascarado.

**ESC-F6-13 — Centro de notificaciones** (RF-F6-22 · HU-38 CA1, CA2)
- **Dado** un cliente con 3 notificaciones sin leer
- **Cuando** consulta su centro
- **Entonces** recibe la lista ordenada y `noLeidas: 3`; al marcar una como leída, `noLeidas: 2`.

**ESC-F6-14 — Darse de baja** (RF-F6-24 · HU-30 CA3)
- **Dado** un correo comercial con enlace de baja
- **Cuando** el cliente lo abre
- **Entonces** se registra un consentimiento `comerciales = false` con canal `enlace_baja` y se muestra la confirmación.

## 5. Fuera de alcance
- Plantillas personalizadas por sede (F7; en F6 se usan plantillas por defecto de la plataforma).
- Campañas, recordatorios, novedades y cupos por plan (F7).

## 6. Decisiones abiertas relacionadas
- **DA-04** Descripción de HU-34.
- **DA-09** Proveedores de envío.
