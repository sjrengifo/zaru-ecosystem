# F2 — Clientes, vehículos, catálogo y datos personales: Especificación

| Campo | Valor |
|---|---|
| Estado | Borrador |
| Épicas | ZARU-1, ZARU-15, ZARU-48 |
| Historias | HU-03 (ZARU-4), HU-04 (ZARU-5), HU-05 (ZARU-6), HU-06 (ZARU-7), HU-07 (ZARU-8), HU-30 CA1 y CA4 (ZARU-19), HU-51 (ZARU-58), HU-52 (ZARU-59), HU-15 (ZARU-67) |
| Depende de | F1 |
| Puntos | 25 (Jira) · Sprint 1 |

## 1. Objetivo
Permitir al establecimiento registrar y mantener a sus clientes y vehículos, y su catálogo de servicios, cumpliendo la Ley 1581 de 2012: ningún dato personal se guarda sin autorización expresa y versionada, cada autorización o revocación queda como evidencia, y el titular puede consultar, actualizar o pedir la eliminación de sus datos.

## 2. Requisitos funcionales

### Clientes y autorizaciones

| ID | Requisito | Origen |
|---|---|---|
| RF-F2-01 | Registrar un cliente exige nombre, celular (10 dígitos), correo y la autorización de tratamiento de datos. El correo es obligatorio desde la política 1.1 porque es un canal de notificación (HU-46), y no se puede vaciar al editar. | HU-03 CA1, HU-51 CA1 |
| RF-F2-02 | Sin autorización de tratamiento de datos, el registro se rechaza y **no se almacena ningún dato personal**. | HU-03 CA2, HU-51 CA3 |
| RF-F2-03 | Al registrar, se reciben dos autorizaciones adicionales independientes y desmarcadas por defecto: notificaciones del servicio y comunicaciones comerciales. | HU-30 CA1 |
| RF-F2-04 | Cada autorización otorgada o revocada se guarda como evidencia inmutable con fecha, hora, canal, IP y versión de la política vigente. | HU-30 CA4, HU-51 CA2 |
| RF-F2-05 | El establecimiento consulta el historial completo de autorizaciones de un cliente para auditoría. | HU-30 CA4 |
| RF-F2-06 | Si el celular ya existe en el establecimiento, el registro responde `409` con el id y nombre del cliente existente. | HU-03 CA3 |
| RF-F2-07 | Listar clientes con búsqueda por nombre (parcial, sin tildes), celular o placa. La paginación queda pendiente. | HU-04 CA1 |
| RF-F2-08 | Actualizar nombre, celular y correo de un cliente; el cambio se refleja en todos los módulos. | HU-04 CA2, HU-52 CA2 |
| RF-F2-09 | Anonimizar un cliente a solicitud del titular: se reemplazan sus datos personales de forma irreversible, se conservan las órdenes para estadísticas y se registra la gestión. | HU-52 CA3 |
| RF-F2-10 | `GET /politicas-datos/vigente` devuelve la versión y URL de la política vigente. | HU-51 CA1 |

### Vehículos

| ID | Requisito | Origen |
|---|---|---|
| RF-F2-11 | Registrar un vehículo asociado a un cliente con placa, tipo (carro o moto), marca y color; placa y tipo son obligatorios, y la placa se normaliza a mayúsculas sin espacios ni guiones. | HU-05 CA1 |
| RF-F2-12 | Formato de placa válido: carro `AAA000`, moto `AAA00A` o `AAA00`. | HU-05 CA1 |
| RF-F2-13 | Una placa repetida en el establecimiento responde `409` indicando a qué cliente pertenece. | HU-05 CA2 |
| RF-F2-14 | El detalle del cliente incluye todos sus vehículos. | HU-05 CA3 |
| RF-F2-15 | El historial de un vehículo lista sus órdenes entregadas con fecha, servicios y valor, de la más reciente a la más antigua; si no hay, devuelve una lista vacía. La paginación queda pendiente. | HU-06 CA1, CA2 |

### Catálogo de servicios

| ID | Requisito | Origen |
|---|---|---|
| RF-F2-16 | El administrador crea servicios con nombre, precio, duración estimada y, opcionalmente, el beneficio Rain Insure con su vigencia en **horas**. Cada orden guarda la fecha límite de la garantía al crearse, de modo que cambiar o desactivar la garantía del servicio solo afecta órdenes futuras. | HU-07 CA1, HU-15 CA1, CA2 |
| RF-F2-17 | Cambiar el precio de un servicio no modifica órdenes existentes. | HU-07 CA2 |
| RF-F2-18 | Un servicio desactivado no puede usarse en órdenes nuevas, pero sigue apareciendo en el historial. | HU-07 CA3 |

## 3. Requisitos no funcionales

| ID | Requisito | Medida |
|---|---|---|
| RNF-F2-01 | La búsqueda de clientes responde en menos de 500 ms con 5 000 clientes por establecimiento. | Prueba de rendimiento con datos sintéticos |
| RNF-F2-02 | La creación del cliente y de su autorización es atómica. | Función SQL transaccional |
| RNF-F2-03 | La consulta del detalle de un cliente queda auditada (acceso a datos personales). | Registro en `auditoria` |

## 4. Escenarios de aceptación

**ESC-F2-01 — Registro con autorización** (RF-F2-01, RF-F2-04 · HU-03 CA1, HU-51 CA2)
- **Dado** nombre, celular, correo y autorización de tratamiento otorgada
- **Cuando** registro el cliente
- **Entonces** recibo `201` y existe un consentimiento `tratamiento_datos` con la versión vigente de la política, la fecha y la IP.

**ESC-F2-02 — Registro sin autorización** (RF-F2-02 · HU-03 CA2, HU-51 CA3)
- **Dado** que la autorización no se otorga
- **Cuando** intento registrar el cliente
- **Entonces** recibo `400` con el campo `autorizacionDatos` y no existe ninguna fila nueva en `clientes`.

**ESC-F2-03 — Autorizaciones separadas** (RF-F2-03 · HU-30 CA1)
- **Dado** un registro que solo otorga la autorización de tratamiento
- **Cuando** consulto sus consentimientos
- **Entonces** `notificaciones_servicio` y `comerciales` figuran como no otorgados.

**ESC-F2-04 — Celular duplicado** (RF-F2-06 · HU-03 CA3)
- **Dado** un cliente con celular 3001234567
- **Cuando** registro otro cliente con el mismo celular
- **Entonces** recibo `409` con el id del cliente existente en `detalles[0].clienteId`, también si dos registros llegan al mismo tiempo.

**ESC-F2-05 — Búsqueda** (RF-F2-07 · HU-04 CA1)
- **Dado** el cliente "José Pérez" con el vehículo ABC123
- **Cuando** busco `jose`, `300123` o `abc123`
- **Entonces** el cliente aparece en los resultados.

**ESC-F2-06 — Placa duplicada** (RF-F2-13 · HU-05 CA2)
- **Dado** la placa ABC123 registrada para Ana
- **Cuando** registro `abc-123` para Luis
- **Entonces** recibo `409` indicando que pertenece a Ana.

**ESC-F2-07 — Historial vacío** (RF-F2-15 · HU-06 CA2)
- **Dado** un vehículo sin órdenes entregadas
- **Cuando** consulto su historial
- **Entonces** recibo `200` con una lista vacía.

**ESC-F2-08 — Precio histórico** (RF-F2-17 · HU-07 CA2)
- **Dado** una orden con "Lavado básico" a 25 000
- **Cuando** cambio el precio a 30 000
- **Entonces** la orden y el historial siguen mostrando 25 000.

**ESC-F2-09 — Servicio desactivado** (RF-F2-18 · HU-07 CA3)
- **Dado** un servicio desactivado
- **Cuando** consulto `GET /servicios?activo=true`
- **Entonces** no aparece.

**ESC-F2-10 — Anonimización** (RF-F2-09 · HU-52 CA3)
- **Dado** un cliente con órdenes
- **Cuando** el administrador lo anonimiza
- **Entonces** nombre, celular y correo quedan irreconocibles, las órdenes se conservan, y la gestión queda en `solicitudes_titular` y en `auditoria`.

## 5. Fuera de alcance
- Validación del celular por SMS (F6).
- Acceso del titular a sus propios datos desde la web móvil (F5).
- Revocación desde el enlace de baja de mensajes comerciales (F6).

## 6. Decisiones abiertas relacionadas
- Ninguna bloqueante.
