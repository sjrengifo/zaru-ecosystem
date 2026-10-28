# F5 — API del cliente final: Especificación

| Campo | Valor |
|---|---|
| Estado | Borrador |
| Épicas | ZARU-30, ZARU-48 |
| Historias | HU-17 (ZARU-33), HU-18 (ZARU-34), HU-19 (ZARU-39), HU-20 (ZARU-69), HU-21 (ZARU-40), HU-22 (ZARU-41), HU-23 (ZARU-35), HU-24 (ZARU-43), HU-25 (ZARU-37), HU-26 (ZARU-45), HU-27 (ZARU-46), HU-45 (ZARU-52), HU-52 CA1 y CA2 (ZARU-59), HU-59 (ZARU-65) |
| Depende de | F3, F4 · DA-01 y DA-03 resueltas en Jira |
| Puntos | 42 (Jira) · Sprint 2, más HU-59 (5) en el Sprint 1 |

## 1. Objetivo
Exponer al cliente final, sin registro ni contraseña, el seguimiento en tiempo real de su vehículo con la marca de la sede, y —tras verificar su celular— su historial, sus vehículos y sus datos personales. Los duplicados de la Épica 2 ya se fusionaron en Jira (DA-01 resuelta).

## 2. Requisitos funcionales

### Acceso y seguimiento (nivel público)

| ID | Requisito | Origen |
|---|---|---|
| RF-F5-01 | `GET /publico/{slug}` devuelve nombre, logo, colores y dirección de la sede; un slug inexistente o inactivo responde `404`. | HU-22 CA1 |
| RF-F5-02 | El cliente busca por placa (o celular) dentro de la sede; si el vehículo tiene una orden activa, recibe su código de seguimiento. | HU-17 CA1, CA2 |
| RF-F5-03 | Si la placa o el celular no tiene una orden activa en esa sede, la respuesta indica que el vehículo no se encuentra en servicio, sin revelar si está registrado. | HU-17 CA4 |
| RF-F5-04 | `GET /publico/seguimiento/{codigo}` devuelve estado actual, pasos del flujo con su hora, servicios contratados, total, hora estimada de entrega, branding de la sede, indicador de Rain Insure y la nota "El pago se realiza en el establecimiento". No incluye nombre, celular ni correo. | HU-18 CA1, HU-19, HU-20, HU-21 CA1, CA2, HU-25, HU-59 CA2 |
| RF-F5-05 | `GET /publico/seguimiento/{codigo}/eventos` emite por Server-Sent Events cada cambio de estado de esa orden en menos de 5 segundos. | HU-18 CA2, HU-45 CA1 |
| RF-F5-06 | Al reconectarse con `Last-Event-ID`, el cliente recibe los eventos perdidos o, como mínimo, el estado actual. | HU-45 CA2 |
| RF-F5-07 | Un suscriptor solo recibe eventos de la orden de su código. | HU-45 CA3 |
| RF-F5-08 | El código de seguimiento deja de dar acceso 24 horas después de la entrega. | Seguridad (DA-03) |

### Promociones públicas

| ID | Requisito | Origen |
|---|---|---|
| RF-F5-09 | `GET /publico/{slug}/promociones` lista solo las promociones vigentes de esa sede, con branding. | HU-26 CA1, CA2, CA3 |
| RF-F5-10 | `GET /publico/{slug}/promociones/{id}` devuelve descripción completa, condiciones, servicios aplicables y vigencia. | HU-27 CA1 |

### Sesión del cliente (nivel verificado)

| ID | Requisito | Origen |
|---|---|---|
| RF-F5-11 | El cliente solicita un código OTP de 6 dígitos para su celular registrado en la sede. La respuesta es la misma exista o no el celular. | ADR-05 |
| RF-F5-12 | Al verificar el OTP correcto (máx. 5 intentos, vigencia 5 minutos) recibe un token de sesión de rol `cliente` válido por 30 días. | ADR-05 |
| RF-F5-13 | `GET /cliente/vehiculos` lista sus vehículos en esa sede. | HU-23 CA2 |
| RF-F5-14 | `GET /cliente/historial` lista sus servicios entregados del más reciente al más antiguo, con fecha, sede y servicios, filtrable por placa. | HU-23 CA1, CA2, HU-59 CA3 |
| RF-F5-15 | `GET /cliente/historial/{ordenId}` muestra los servicios exactos, el valor y la cobertura Rain Insure con su fecha de vencimiento. | HU-24 CA1, HU-25 CA1 |
| RF-F5-16 | `GET /cliente/mis-datos` muestra los datos personales registrados y sus autorizaciones vigentes. | HU-52 CA1 |
| RF-F5-17 | `PATCH /cliente/mis-datos` actualiza nombre y correo; el cambio de celular exige verificar el nuevo número con OTP. | HU-52 CA2 |
| RF-F5-18 | `POST /cliente/solicitudes-titular` registra una solicitud de eliminación que el administrador atiende con la anonimización de F2. | HU-52 CA3 |

## 3. Requisitos no funcionales

| ID | Requisito | Medida |
|---|---|---|
| RNF-F5-01 | Tras 5 búsquedas fallidas en 10 minutos desde un mismo origen, se bloquean temporalmente nuevos intentos (HU-59 CA1). | `429` al exceder |
| RNF-F5-02 | Límite de OTP: 3 solicitudes por celular cada 15 minutos. | `429` al exceder |
| RNF-F5-03 | El OTP se guarda solo como hash. | Revisión del esquema |
| RNF-F5-04 | Las respuestas públicas no contienen datos personales. | Prueba que inspecciona el JSON en busca de nombre, celular y correo del cliente |
| RNF-F5-05 | El flujo SSE envía un comentario de mantenimiento cada 25 s para no ser cortado por proxies. | Prueba de conexión prolongada |

## 4. Escenarios de aceptación

**ESC-F5-01 — Acceso por placa** (RF-F5-02 · HU-17 CA1, CA2)
- **Dado** el vehículo ABC123 con una orden en `en_lavado` en la sede `demo-cali`
- **Cuando** busco `abc123` en `POST /publico/demo-cali/buscar`
- **Entonces** recibo el código de seguimiento de esa orden.

**ESC-F5-02 — Placa sin servicio** (RF-F5-03 · HU-17 CA4)
- **Dado** una placa sin orden activa (registrada o no)
- **Cuando** la busco
- **Entonces** recibo `404` con el mensaje "El vehículo no se encuentra en servicio actualmente", idéntico en ambos casos.

**ESC-F5-03 — Seguimiento** (RF-F5-04 · HU-18 CA1, HU-21)
- **Dado** un código de seguimiento válido
- **Cuando** consulto el seguimiento
- **Entonces** veo el estado actual, los servicios, el total, la nota de pago en el establecimiento y el branding, sin datos personales.

**ESC-F5-04 — Actualización en vivo** (RF-F5-05 · HU-18 CA2, HU-45 CA1)
- **Dado** un cliente conectado a `/eventos`
- **Cuando** el operario cambia el estado
- **Entonces** el cliente recibe el evento en menos de 5 segundos.

**ESC-F5-05 — Reconexión** (RF-F5-06 · HU-45 CA2)
- **Dado** un cliente que se desconecta y la orden cambia dos veces
- **Cuando** se reconecta con `Last-Event-ID`
- **Entonces** recibe los dos cambios o el estado más reciente.

**ESC-F5-06 — Aislamiento de eventos** (RF-F5-07 · HU-45 CA3)
- **Dado** dos clientes con órdenes distintas
- **Cuando** cambia la orden del primero
- **Entonces** el segundo no recibe ningún evento.

**ESC-F5-07 — Promociones de la sede** (RF-F5-09 · HU-26 CA2)
- **Dado** promociones vigentes en `demo-cali` y en `lavadero-norte`
- **Cuando** consulto las de `demo-cali`
- **Entonces** solo veo las de `demo-cali`.

**ESC-F5-08 — Sesión por OTP** (RF-F5-11, RF-F5-12)
- **Dado** un cliente con celular registrado
- **Cuando** solicita y verifica el OTP
- **Entonces** recibe un token `cliente`; con un código incorrecto 5 veces el OTP queda invalidado.

**ESC-F5-09 — Historial por placa** (RF-F5-14 · HU-23 CA2)
- **Dado** un cliente con dos vehículos y servicios entregados en ambos
- **Cuando** consulta el historial filtrando por una placa
- **Entonces** solo ve los servicios de esa placa, del más reciente al más antiguo.

**ESC-F5-10 — Rain Insure** (RF-F5-15 · HU-24 CA1, HU-25 CA1)
- **Dado** un servicio entregado hace 2 días que incluye Rain Insure de 5 días
- **Cuando** consulta el detalle
- **Entonces** ve la cobertura vigente y su fecha de vencimiento.

**ESC-F5-11 — Mis datos** (RF-F5-16, RF-F5-17 · HU-52 CA1, CA2)
- **Dado** un cliente con sesión
- **Cuando** consulta y actualiza su correo
- **Entonces** el cambio se refleja en el panel del establecimiento.

## 5. Fuera de alcance
- Interfaz responsiva, lectura de QR y línea de tiempo visual (HU-17 CA2, CA3 y HU-19: frontend; el backend entrega los datos).
- Envío real del OTP por SMS: en esta fase se usa el proveedor `consola`; el envío real llega con F6.
- Centro de notificaciones (F6).

## 6. Decisiones abiertas relacionadas
- **DA-01** Historias duplicadas — confirmar antes de iniciar.
- **DA-03** Nivel de acceso por placa — confirmar antes de iniciar.
