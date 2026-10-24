# F1 — Identidad, tenants y autorización: Especificación

| Campo | Valor |
|---|---|
| Estado | Borrador |
| Épicas | ZARU-1, ZARU-48 |
| Historias | HU-01 (ZARU-2), HU-02 (ZARU-3), HU-43 (ZARU-47), HU-46 (ZARU-51), HU-52 CA1 y CA3 (ZARU-57), HU-55 CA1 (ZARU-60) |
| Depende de | F0 |
| Puntos estimados | 21 |

## 1. Objetivo
Garantizar que cada petición al backend esté asociada a un usuario autenticado, a un rol y a un único establecimiento, que nadie pueda ver ni modificar datos de otro afiliado, que el administrador gestione a sus operarios y que la plataforma pueda dar de alta nuevos establecimientos sin tocar el código. Toda acción sensible y todo intento denegado queda auditado.

## 2. Requisitos funcionales

| ID | Requisito | Origen |
|---|---|---|
| RF-F1-01 | El backend valida el JWT de Supabase Auth en cada petición privada y rechaza tokens ausentes, inválidos o vencidos con `401`. | HU-46 CA1, CA3 |
| RF-F1-02 | El backend resuelve rol (`admin`, `operario`, `plataforma`) y establecimiento del usuario desde la base de datos; nunca desde la petición. | HU-43 CA1, HU-46 CA1 |
| RF-F1-03 | Un usuario desactivado o de un establecimiento inactivo recibe `403` aunque su token sea válido. | HU-02 CA3 |
| RF-F1-04 | `GET /me` devuelve id, nombre, rol y establecimiento (id, nombre, slug, branding) del usuario. | HU-01 CA1 |
| RF-F1-05 | Un operario que invoca una función exclusiva del administrador recibe `403` y el intento se registra en auditoría. | HU-02 CA2, HU-46 CA2 |
| RF-F1-06 | Todo recurso consultado o modificado se filtra por el establecimiento del usuario; un id de otro establecimiento responde `404`. | HU-43 CA1, CA2, HU-01 CA3 |
| RF-F1-07 | El administrador lista, crea, edita y desactiva operarios de su establecimiento. Al crearlo, el sistema envía una invitación por correo. | HU-02 CA1, CA3 |
| RF-F1-08 | Un administrador no puede desactivarse a sí mismo ni dejar el establecimiento sin administradores activos. | HU-02 (regla derivada) |
| RF-F1-09 | Un administrador de plataforma da de alta un establecimiento con su primer administrador; el nuevo tenant queda operativo y aislado sin cambios de código. | HU-43 CA3 |
| RF-F1-10 | Las acciones de creación, modificación, desactivación, consulta de datos personales y los accesos denegados se registran en `auditoria` con usuario, fecha, acción, recurso, resultado, IP y `requestId`. | HU-55 CA1, HU-46 CA2 |
| RF-F1-11 | El administrador consulta la auditoría de su establecimiento con filtros por usuario, acción y fechas. | HU-55 CA1 |

## 3. Requisitos no funcionales

| ID | Requisito | Medida |
|---|---|---|
| RNF-F1-01 | Las contraseñas no se almacenan ni transitan por el backend (Supabase Auth con bcrypt). | Ninguna tabla de `public` contiene contraseñas (DA-05) |
| RNF-F1-02 | En producción el backend rechaza tráfico no HTTPS. | Redirección o `426` cuando `x-forwarded-proto != https` |
| RNF-F1-03 | Ningún secreto en el repositorio. | Escaneo de secretos (gitleaks) en CI |
| RNF-F1-04 | La resolución de identidad agrega como máximo 50 ms por petición. | Caché en memoria del perfil por 60 s, invalidada al editar el usuario |
| RNF-F1-05 | Límite de 10 intentos fallidos de autenticación por IP por minuto. | `express-rate-limit` en rutas privadas con respuesta `401` |

## 4. Escenarios de aceptación

**ESC-F1-01 — Sesión válida** (RF-F1-01, RF-F1-04 · HU-01 CA1)
- **Dado** un administrador con cuenta activa
- **Cuando** llama a `GET /me` con su token
- **Entonces** recibe `200` con su rol `admin` y los datos de su establecimiento.

**ESC-F1-02 — Token vencido** (RF-F1-01 · HU-46 CA3)
- **Dado** un token vencido
- **Cuando** llama a cualquier endpoint privado
- **Entonces** recibe `401` con código `NO_AUTENTICADO`.

**ESC-F1-03 — Operario en función de administrador** (RF-F1-05 · HU-02 CA2, HU-46 CA2)
- **Dado** un usuario con rol `operario`
- **Cuando** llama a `POST /servicios`
- **Entonces** recibe `403` y existe un registro en `auditoria` con `resultado = denegado`.

**ESC-F1-04 — Recurso de otro establecimiento** (RF-F1-06 · HU-43 CA2)
- **Dado** un cliente que pertenece al establecimiento B
- **Cuando** un administrador del establecimiento A consulta `GET /clientes/{id}` de ese cliente
- **Entonces** recibe `404`, idéntico al de un id inexistente.

**ESC-F1-05 — Crear operario** (RF-F1-07 · HU-02 CA1)
- **Dado** un administrador
- **Cuando** crea un operario con nombre y correo
- **Entonces** el usuario queda con rol `operario` en su establecimiento y Supabase envía la invitación.

**ESC-F1-06 — Operario desactivado** (RF-F1-03 · HU-02 CA3)
- **Dado** un operario desactivado
- **Cuando** usa un token emitido antes de la desactivación
- **Entonces** recibe `403`.

**ESC-F1-07 — Alta de establecimiento** (RF-F1-09 · HU-43 CA3)
- **Dado** un administrador de plataforma
- **Cuando** crea el establecimiento "Lavadero Norte" con su administrador
- **Entonces** el nuevo administrador puede iniciar sesión y solo ve los datos de "Lavadero Norte".

**ESC-F1-08 — Último administrador** (RF-F1-08)
- **Dado** un establecimiento con un solo administrador
- **Cuando** intenta desactivarse a sí mismo
- **Entonces** recibe `409` con código `CONFLICTO`.

## 5. Fuera de alcance
- Pantallas de login (las resuelve el frontend con Supabase Auth).
- Recuperación de contraseña (la ofrece Supabase Auth).
- Autenticación del cliente final (F5).
- Agrupación de varias sedes bajo una marca (DA-10).

## 6. Decisiones abiertas relacionadas
- DA-05 Contraseñas gestionadas por Supabase Auth.
- DA-10 Una sede = un establecimiento.
