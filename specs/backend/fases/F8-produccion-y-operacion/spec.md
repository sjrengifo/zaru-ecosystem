# F8 — Producción y operación: Especificación

| Campo | Valor |
|---|---|
| Estado | Borrador |
| Épicas | ZARU-48 |
| Historias | HU-47 (ZARU-54), HU-48 (ZARU-55), HU-49 (ZARU-56), HU-50 CA2 (ZARU-57), HU-53 CA2 y CA3 (ZARU-60), HU-56 CA3 (ZARU-62) |
| Depende de | F0 a F7 (puede iniciarse en paralelo a F6–F7 para ambientes y monitoreo) · DA-06, DA-07 y DA-08 confirmadas |
| Puntos | 19 (Jira) · Sprint 1 |

## 1. Objetivo
Operar la plataforma de forma confiable: cambios que pasan por un ambiente de pruebas antes de producción, monitoreo con alertas, copias de seguridad diarias cifradas y restaurables, datos cifrados en tránsito y en reposo, un protocolo documentado para incidentes de datos personales y la plataforma publicada en la nube con despliegue automático desde `main`.

## 2. Requisitos funcionales

### Ambientes y despliegue (HU-56)

| ID | Requisito | Origen |
|---|---|---|
| RF-F8-01 | Existen tres ambientes: desarrollo (local), pruebas (`staging`) y producción, cada uno con su propia base de datos y secretos. | HU-56 |
| RF-F8-02 | Un merge a `develop` despliega automáticamente en pruebas, aplicando las migraciones pendientes. | HU-56 CA3 |
| RF-F8-03 | Un merge de `develop` a `main`, con aprobación, despliega en producción solo si el despliegue en pruebas y sus pruebas de humo pasaron. | HU-56 CA2, CA3 |
| RF-F8-04 | Si las pruebas o las migraciones fallan, el despliegue se detiene y se notifica al equipo. | HU-56 CA2 |

### Monitoreo (HU-48)

| ID | Requisito | Origen |
|---|---|---|
| RF-F8-05 | Un tablero muestra disponibilidad, tiempo de respuesta, tasa de errores, tamaño de la cola de notificaciones y uso de recursos. | HU-48 CA1 |
| RF-F8-06 | Si `/health/ready` falla 2 veces seguidas, la latencia p95 supera 2 s durante 5 minutos o la cola acumula más de 200 notificaciones vencidas, se alerta al equipo por correo y por el canal del equipo. | HU-48 CA2 |
| RF-F8-07 | Los errores del servidor se registran con fecha, hora, `requestId`, ruta y traza en un servicio de logs con retención de al menos 30 días. | HU-48 CA3 |

### Copias de seguridad (HU-49)

| ID | Requisito | Origen |
|---|---|---|
| RF-F8-08 | Cada día a las 3:00 a. m. (Bogotá) se genera una copia completa de la base de producción. | HU-49 CA1 |
| RF-F8-09 | Las copias se cifran y se guardan fuera de Supabase, con retención de 30 días. | HU-49 CA3 |
| RF-F8-10 | Existe un procedimiento documentado de restauración que recupera los datos de la copia más reciente. | HU-49 CA2 |
| RF-F8-11 | Cada mes se restaura la última copia en un proyecto de pruebas, se verifica y se registra el resultado. | HU-49 CA4 |

### Cifrado (HU-50)

| ID | Requisito | Origen |
|---|---|---|
| RF-F8-12 | Los datos personales permanecen cifrados en reposo; el correo del cliente se cifra además a nivel de columna. | HU-50 CA2, DA-08 |
| RF-F8-13 | Los secretos de cada ambiente se gestionan en el gestor de la plataforma (Render, Vercel, GitHub Secrets), nunca en el código. | HU-50 CA3 |

### Incidentes (HU-53)

| ID | Requisito | Origen |
|---|---|---|
| RF-F8-14 | Un procedimiento de respuesta a incidentes define roles, pasos, tiempos y plantillas de comunicación. | HU-53 CA2, CA3 |
| RF-F8-15 | Una consulta sobre la auditoría identifica, para un rango de tiempo y un usuario o IP, los registros y establecimientos afectados. | HU-53 CA2 |
| RF-F8-16 | El procedimiento incluye la notificación a los establecimientos y titulares afectados y el reporte a la Superintendencia de Industria y Comercio cuando aplique. | HU-53 CA3 |

### Publicación en la nube (HU-47)

| ID | Requisito | Origen |
|---|---|---|
| RF-F8-17 | La API se publica en Render y el panel en Vercel, cada uno en una dirección pública con HTTPS. | HU-47 CA1 |
| RF-F8-18 | El panel publicado usa la API publicada: `VITE_API_URL` apunta a Render, `FRONTEND_URL` (CORS) al dominio del panel y Supabase Auth admite ese dominio. | HU-47 CA2 |
| RF-F8-19 | Un merge a `main` publica la API y el panel sin pasos manuales, y una prueba de humo verifica que la API sirve el commit nuevo y que el panel responde. | HU-47 CA3 |

## 3. Requisitos no funcionales

| ID | Requisito | Medida |
|---|---|---|
| RNF-F8-01 | Disponibilidad mensual de la API en producción. | ≥ 99 % (excluye suspensiones del plan gratuito, ver ADR-07) |
| RNF-F8-03 | Objetivo de recuperación. | RPO ≤ 24 h, RTO ≤ 4 h |
| RNF-F8-04 | TLS. | Solo HTTPS, TLS ≥ 1.2, HSTS activo |

## 4. Escenarios de aceptación

**ESC-F8-01 — Despliegue bloqueado** (RF-F8-04 · HU-56 CA2)
- **Dado** un merge a `develop` con una migración que falla
- **Cuando** corre el pipeline
- **Entonces** el despliegue en pruebas se detiene, producción no cambia y el equipo recibe la notificación.

**ESC-F8-02 — Promoción a producción** (RF-F8-02, RF-F8-03 · HU-56 CA3)
- **Dado** un cambio validado en pruebas
- **Cuando** se aprueba el PR de `develop` a `main`
- **Entonces** se despliega en producción y las pruebas de humo pasan.

**ESC-F8-03 — Alerta por caída** (RF-F8-06 · HU-48 CA2)
- **Dado** el backend de pruebas detenido
- **Cuando** el monitor falla 2 veces seguidas
- **Entonces** el equipo recibe la alerta en menos de 5 minutos.

**ESC-F8-04 — Restauración** (RF-F8-10, RF-F8-11 · HU-49 CA2, CA4)
- **Dado** la copia de anoche
- **Cuando** se ejecuta el procedimiento sobre un proyecto vacío
- **Entonces** los conteos de tablas coinciden con producción a la hora de la copia y el resultado queda registrado.

**ESC-F8-05 — HTTP rechazado** (RNF-F8-04 · HU-50 CA1)
- **Dado** una petición `http://` a la API de producción
- **Cuando** se envía
- **Entonces** se redirige a HTTPS o se rechaza, y la respuesta HTTPS incluye `Strict-Transport-Security`.

**ESC-F8-06 — Investigación de incidente** (RF-F8-15 · HU-53 CA2)
- **Dado** un token comprometido de un operario
- **Cuando** el equipo ejecuta la consulta de impacto para ese usuario y rango
- **Entonces** obtiene los recursos accedidos y los establecimientos afectados.

**ESC-F8-07 — Plataforma publicada** (RF-F8-17, RF-F8-18 · HU-47 CA1, CA2)
- **Dado** la API en Render y el panel en Vercel
- **Cuando** un administrador abre el dominio del panel desde su navegador e inicia sesión
- **Entonces** entra al dashboard y las pantallas cargan datos de la API publicada sin errores de CORS.

**ESC-F8-08 — Publicación automática** (RF-F8-19 · HU-47 CA3)
- **Dado** un PR integrado en `main`
- **Cuando** Render y Vercel terminan de publicar
- **Entonces** `/api/v1/health` reporta el commit del merge y el workflow *Prueba de humo en producción* pasa sin intervención manual.

## 5. Fuera de alcance
- Balanceo de carga, autoescalado, contenedorización y pruebas de carga: salieron de HU-47 al reformularse en Jira (DA-06).
- Migración a AWS o GCP.
- Certificaciones formales de seguridad.

## 6. Decisiones abiertas relacionadas
- **DA-06** Infraestructura de HU-47 (resuelta).
- **DA-07** Copias de seguridad en el plan gratuito.
- **DA-08** Cifrado en reposo.
